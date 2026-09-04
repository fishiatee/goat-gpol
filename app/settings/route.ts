import { NextRequest } from "next/server"

import {
  getJudgeSettings,
  getSkinLimits,
  getWebhookSettings,
  recomputeAllReplayStatuses,
  updateJudgeSettings,
  updateSkinLimits,
  updateWebhookSettings,
} from "@/lib/db"
import { isValidWebhookUrl } from "@/lib/discord-webhooks"
import { getSessionUser } from "@/lib/session"
import { canAdmin } from "@/lib/roles"
import type {
  AppSettings,
  JudgeSettings,
  SkinLimits,
  WebhookSettings,
} from "@/lib/judging"

export const dynamic = "force-dynamic"

const MAX_WEBHOOK_URL_LENGTH = 2000
const MAX_WEBHOOK_FORMAT_LENGTH = 2000

function parseSettings(
  body: unknown,
): (Partial<JudgeSettings> & Partial<SkinLimits> & Partial<WebhookSettings>) | null {
  if (!body || typeof body !== "object") {
    return null
  }
  const {
    thresholdScore,
    thresholdPercent,
    maxSkinsPerUser,
    maxSkinSizeMb,
    renderWebhookEnabled,
    renderWebhookUrl,
    renderWebhookMessageFormat,
  } = body as Record<string, unknown>
  const out: Partial<JudgeSettings> &
    Partial<SkinLimits> &
    Partial<WebhookSettings> = {}
  const int = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) ? value : undefined

  const score = int(thresholdScore)
  if (score !== undefined) {
    if (score < 0 || score > 4) {
      return null
    }
    out.thresholdScore = score
  }
  const percent = int(thresholdPercent)
  if (percent !== undefined) {
    if (percent < 1 || percent > 100) {
      return null
    }
    out.thresholdPercent = percent
  }
  const skins = int(maxSkinsPerUser)
  if (skins !== undefined) {
    if (skins < 0) {
      return null
    }
    out.maxSkinsPerUser = skins
  }
  const size = int(maxSkinSizeMb)
  if (size !== undefined) {
    if (size < 1) {
      return null
    }
    out.maxSkinSizeMb = size
  }
  if (renderWebhookEnabled !== undefined) {
    if (typeof renderWebhookEnabled !== "boolean") {
      return null
    }
    out.renderWebhookEnabled = renderWebhookEnabled
  }
  if (renderWebhookUrl !== undefined) {
    if (renderWebhookUrl !== null && typeof renderWebhookUrl !== "string") {
      return null
    }
    const trimmed =
      typeof renderWebhookUrl === "string" ? renderWebhookUrl.trim() : ""
    if (trimmed === "") {
      out.renderWebhookUrl = null
    } else {
      if (
        trimmed.length > MAX_WEBHOOK_URL_LENGTH ||
        !isValidWebhookUrl(trimmed)
      ) {
        return null
      }
      out.renderWebhookUrl = trimmed
    }
  }
  if (renderWebhookMessageFormat !== undefined) {
    if (typeof renderWebhookMessageFormat !== "string") {
      return null
    }
    if (renderWebhookMessageFormat.length > MAX_WEBHOOK_FORMAT_LENGTH) {
      return null
    }
    out.renderWebhookMessageFormat = renderWebhookMessageFormat
  }
  return out
}

function currentSettings(): AppSettings {
  return { ...getJudgeSettings(), ...getSkinLimits(), ...getWebhookSettings() }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!canAdmin(user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  return Response.json(currentSettings())
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!canAdmin(user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const input = parseSettings(await request.json().catch(() => null))
  if (!input) {
    return Response.json({ error: "invalid settings" }, { status: 400 })
  }
  const judgeInput: Partial<JudgeSettings> = {}
  if (input.thresholdScore !== undefined) {
    judgeInput.thresholdScore = input.thresholdScore
  }
  if (input.thresholdPercent !== undefined) {
    judgeInput.thresholdPercent = input.thresholdPercent
  }
  const limitsInput: Partial<SkinLimits> = {}
  if (input.maxSkinsPerUser !== undefined) {
    limitsInput.maxSkinsPerUser = input.maxSkinsPerUser
  }
  if (input.maxSkinSizeMb !== undefined) {
    limitsInput.maxSkinSizeMb = input.maxSkinSizeMb
  }
  const webhookInput: Partial<WebhookSettings> = {}
  if (input.renderWebhookEnabled !== undefined) {
    webhookInput.renderWebhookEnabled = input.renderWebhookEnabled
  }
  if (input.renderWebhookUrl !== undefined) {
    webhookInput.renderWebhookUrl = input.renderWebhookUrl
  }
  if (input.renderWebhookMessageFormat !== undefined) {
    webhookInput.renderWebhookMessageFormat = input.renderWebhookMessageFormat
  }
  if (Object.keys(judgeInput).length > 0) {
    updateJudgeSettings(judgeInput)
    recomputeAllReplayStatuses()
  }
  if (Object.keys(limitsInput).length > 0) {
    updateSkinLimits(limitsInput)
  }
  if (Object.keys(webhookInput).length > 0) {
    updateWebhookSettings(webhookInput)
  }
  return Response.json(currentSettings())
}
