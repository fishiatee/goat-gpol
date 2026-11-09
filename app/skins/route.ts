import { NextRequest } from "next/server"

import {
  countSkinsByUser,
  getDb,
  getSkinById,
  getSkinLimits,
  insertSkin,
  listSkins,
  listSkinsByUser,
  type SkinWithUploader,
} from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { hasPermission } from "@/lib/permissions"
import { SKIN_RULESETS } from "@/lib/skin-upload"
import { removeUpload, storeUpload, UploadError, validateZipUpload } from "@/lib/upload-storage"
import { MAX_SKIN_NAME_LENGTH } from "@/lib/upload-limits"

export const dynamic = "force-dynamic"

const OSK_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])

const VALID_RULESETS = new Set<string>(SKIN_RULESETS)

function skinToApi(skin: SkinWithUploader) {
  return {
    id: skin.id,
    name: skin.name,
    rulesets: JSON.parse(skin.rulesets) as string[],
    scrollSpeed: skin.scroll_speed,
    createdAt: skin.created_at,
    submitter: { osuId: skin.osu_id, username: skin.uploader_username },
  }
}

function parseRulesets(raw: string | null): string[] | null {
  const rulesets = (raw ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => VALID_RULESETS.has(r))
  return rulesets.length > 0 ? [...new Set(rulesets)] : null
}

function parseScrollSpeed(raw: string | null): number | null {
  if (raw === null || raw === "") {
    return null
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1 || value > 40) {
    return null
  }
  return Math.round(value * 2) / 2
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const scope = request.nextUrl.searchParams.get("scope") ?? "own"
  if (scope === "all") {
    if (!hasPermission(user, "manage_skins")) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
    return Response.json(listSkins().map(skinToApi))
  }
  return Response.json(listSkinsByUser(user.osu_id).map(skinToApi))
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  const limits = getSkinLimits()
  if (countSkinsByUser(user.osu_id) >= limits.maxSkinsPerUser) {
    return Response.json({ error: "skin-limit-reached" }, { status: 403 })
  }
  const maxSkinBytes = limits.maxSkinSizeMb * 1024 * 1024

  const name = (request.nextUrl.searchParams.get("name") ?? "").trim()
  const fileName = request.nextUrl.searchParams.get("fileName") ?? ""
  const rulesets = parseRulesets(request.nextUrl.searchParams.get("rulesets"))
  const scrollSpeed = parseScrollSpeed(
    request.nextUrl.searchParams.get("scrollSpeed"),
  )
  if (!name || name.length > MAX_SKIN_NAME_LENGTH) {
    return Response.json({ error: "invalid name" }, { status: 400 })
  }
  if (!rulesets) {
    return Response.json({ error: "invalid rulesets" }, { status: 400 })
  }
  if (
    request.nextUrl.searchParams.get("scrollSpeed") !== null &&
    scrollSpeed === null
  ) {
    return Response.json({ error: "invalid scroll speed" }, { status: 400 })
  }
  if (!fileName.toLowerCase().endsWith(".osk")) {
    return Response.json({ error: "invalid file type" }, { status: 400 })
  }
  const rawLength = request.headers.get("content-length")
  const contentLength = rawLength === null ? undefined : Number(rawLength)
  if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength <= 0)) {
    return Response.json({ error: "invalid file size" }, { status: 400 })
  }
  if (contentLength !== undefined && contentLength > maxSkinBytes) {
    return Response.json({ error: "file too large" }, { status: 413 })
  }
  if (!request.body) {
    return Response.json({ error: "missing file" }, { status: 400 })
  }

  let filePath: string | undefined
  let committed = false
  try {
    filePath = await storeUpload({
      body: request.body,
      directory: "skins",
      extension: ".osk",
      maxBytes: maxSkinBytes,
      expectedBytes: contentLength,
      magic: OSK_MAGIC,
      signal: request.signal,
      validate: validateZipUpload,
    })
    const savedPath = filePath
    const row = getDb().transaction(() => {
      if (countSkinsByUser(user.osu_id) >= getSkinLimits().maxSkinsPerUser) {
        throw new UploadError("skin-limit-reached", 403)
      }
      const id = insertSkin(user.osu_id, name, JSON.stringify(rulesets), scrollSpeed, savedPath)
      const skin = getSkinById(id)
      if (!skin) throw new Error("skin not found after insertion")
      return skin
    }).immediate()
    committed = true
    return Response.json(
      skinToApi({ ...row, uploader_username: user.username }),
      { status: 201 },
    )
  } catch (error) {
    if (filePath && !committed) await removeUpload(filePath)
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    console.error("Skin upload failed", error)
    return Response.json({ error: "upload failed" }, { status: 500 })
  }
}
