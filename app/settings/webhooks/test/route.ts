import { NextRequest } from "next/server"

import {
  getJudgeSettings,
  getSkinLimits,
  getWebhookSettings,
  updateWebhookSettings,
} from "@/lib/db"
import {
  isValidWebhookUrl,
  sendRenderTestWebhook,
} from "@/lib/discord-webhooks"
import { getSessionUser } from "@/lib/session"
import { canAdmin } from "@/lib/roles"

export const dynamic = "force-dynamic"

const MAX_WEBHOOK_URL_LENGTH = 2000

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!canAdmin(user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const body = (await request.json().catch(() => null)) as {
    url?: unknown
  } | null
  const raw = typeof body?.url === "string" ? body.url.trim() : ""
  if (
    raw === "" ||
    raw.length > MAX_WEBHOOK_URL_LENGTH ||
    !isValidWebhookUrl(raw)
  ) {
    return Response.json({ error: "invalid webhook url" }, { status: 400 })
  }
  try {
    await sendRenderTestWebhook(raw)
  } catch {
    return Response.json({ error: "webhook-failed" }, { status: 502 })
  }
  updateWebhookSettings({ renderWebhookUrl: raw })
  return Response.json({
    ...getJudgeSettings(),
    ...getSkinLimits(),
    ...getWebhookSettings(),
  })
}
