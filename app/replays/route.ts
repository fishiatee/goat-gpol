import { after, NextRequest } from "next/server"

import {
  findDuplicateReplay,
  getDb,
  getReplayById,
  getUserByOsuId,
  getWebhookSettings,
  insertReplay,
  listReplays,
  listReplaysByUser,
  replayRowToApi,
} from "@/lib/db"
import {
  isValidWebhookUrl,
  sendReplaySubmissionWebhook,
} from "@/lib/discord-webhooks"
import { withUserApi, ReauthenticationRequiredError } from "@/lib/auth"
import { getSessionUser } from "@/lib/session"
import { hasPermission, isManager } from "@/lib/permissions"
import type { ReplayMetadata } from "@/lib/replay-types"
import { removeUpload, storeUpload, UploadError } from "@/lib/upload-storage"

export const dynamic = "force-dynamic"

const MAX_METADATA_BYTES = 256 * 1024

async function readSubmission(request: NextRequest): Promise<FormData> {
  if (!request.body) throw new UploadError("missing file or metadata", 400)
  try {
    return await request.formData()
  } catch {
    throw new UploadError("invalid form data", 400)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseReplayMetadata(raw: string): ReplayMetadata | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)) {
      return null
    }
    const beatmap = value.beatmap
    const score = value.score
    if (!isRecord(beatmap) || !isRecord(score)) {
      return null
    }
    const num = (x: unknown) => typeof x === "number" && Number.isFinite(x)
    const str = (x: unknown) => typeof x === "string"
    const valid =
      str(value.fileName) &&
      (value.skinName === null || str(value.skinName)) &&
      str(value.notes) &&
      str(value.ruleset) &&
      ["osu", "taiko", "catch", "mania"].includes(value.ruleset) &&
      str(value.beatmapChecksum) &&
      num(beatmap.id) &&
      str(beatmap.title) &&
      str(beatmap.artist) &&
      str(beatmap.creator) &&
      str(beatmap.version) &&
      num(beatmap.starRating) &&
      num(beatmap.maxCombo) &&
      str(beatmap.url) &&
      str(beatmap.backgroundUrl) &&
      str(beatmap.coverListUrl) &&
      str(score.rank) &&
      str(score.username) &&
      num(score.date) &&
      num(score.totalScore) &&
      num(score.maxCombo) &&
      num(score.accuracy) &&
      num(score.accuracyv2) &&
      Array.isArray(score.mods) &&
      (score.isLazer === true || score.isLazer === false) &&
      score.mods.every((m) => str(m)) &&
      num(score.countGeki) &&
      num(score.countKatu) &&
      num(score.count300) &&
      num(score.count100) &&
      num(score.count50) &&
      num(score.countMiss)
    if (!valid) {
      return null
    }
    return value as unknown as ReplayMetadata
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const scope = request.nextUrl.searchParams.get("scope") ?? "own"
  if (scope === "own") {
    return Response.json(
      listReplaysByUser(user.osu_id).map((r) => replayRowToApi(r, user.osu_id)),
    )
  }
  if (scope === "judge" || scope === "render") {
    if (!hasPermission(user, scope === "judge" ? "judge" : "render")) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
    const rows = listReplays(scope === "render" ? "render" : "pool")
    return Response.json(rows.map((r) => replayRowToApi(r, user.osu_id)))
  }
  if (scope === "all") {
    if (!hasPermission(user, "manage_replays")) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
    const rows = listReplays()
    return Response.json(rows.map((r) => replayRowToApi(r, user.osu_id)))
  }
  return Response.json({ error: "invalid scope" }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (user.banned_at !== null && !isManager(user)) {
    return Response.json({ error: "banned" }, { status: 403 })
  }
  let form: FormData
  try {
    form = await readSubmission(request)
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: "invalid form data" }, { status: 400 })
  }
  const file = form.get("file")
  const metadata = form.get("metadata")
  if (!(file instanceof File) || typeof metadata !== "string") {
    return Response.json({ error: "missing file or metadata" }, { status: 400 })
  }
  if (file.size === 0) {
    return Response.json({ error: "invalid file size" }, { status: 400 })
  }
  const input = metadata.length <= MAX_METADATA_BYTES ? parseReplayMetadata(metadata) : null
  if (!input) {
    return Response.json({ error: "invalid metadata" }, { status: 400 })
  }

  let scoreOsuId: number | null = null
  try {
    const scoreUser = await withUserApi(user.osu_id, (api) =>
      api.getUser(input.score.username),
    )
    scoreOsuId = scoreUser.id
  } catch (error) {
    if (error instanceof ReauthenticationRequiredError) {
      return Response.json(
        { error: "reauthentication-required" },
        { status: 401 },
      )
    }
    scoreOsuId = null
  }

  const duplicate = findDuplicateReplay(
    input.beatmapChecksum,
    scoreOsuId,
    input.score.username,
    input.score.date,
  )
  if (duplicate) {
    return Response.json(
      {
        error:
          duplicate.osu_id === user.osu_id
            ? "replay-already-submitted"
            : "replay-submitted-by-other",
      },
      { status: 409 },
    )
  }

  let filePath: string | undefined
  let row: NonNullable<ReturnType<typeof getReplayById>>
  let committed = false
  try {
    filePath = await storeUpload({
      body: file.stream(),
      directory: "replays",
      extension: ".osr",
      expectedBytes: file.size,
      signal: request.signal,
    })
    const savedPath = filePath
    row = getDb().transaction(() => {
      const currentUser = getUserByOsuId(user.osu_id)
      if (!currentUser) throw new UploadError("unauthorized", 401)
      if (currentUser.banned_at !== null && !isManager(currentUser)) {
        throw new UploadError("banned", 403)
      }
      const existing = findDuplicateReplay(input.beatmapChecksum, scoreOsuId, input.score.username, input.score.date)
      if (existing) {
        throw new UploadError(existing.osu_id === user.osu_id ? "replay-already-submitted" : "replay-submitted-by-other", 409)
      }
      const id = insertReplay({
        osuId: user.osu_id,
        fileName: input.fileName,
        skinName: input.skinName,
        notes: input.notes,
        ruleset: input.ruleset,
        beatmapChecksum: input.beatmapChecksum,
        beatmap: input.beatmap,
        score: { ...input.score, osuId: scoreOsuId },
      }, savedPath)
      const replay = getReplayById(id)
      if (!replay) throw new Error("replay not found after insertion")
      return replay
    }).immediate()
    committed = true
  } catch (error) {
    if (filePath && !committed) await removeUpload(filePath)
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    console.error("Replay submission failed", error)
    return Response.json({ error: "upload failed" }, { status: 500 })
  }
  after(async () => {
    try {
      const webhook = getWebhookSettings()
      if (
        webhook.replayWebhookEnabled &&
        webhook.replayWebhookUrl &&
        isValidWebhookUrl(webhook.replayWebhookUrl)
      ) {
        await sendReplaySubmissionWebhook(
          webhook.replayWebhookUrl,
          {
            submitterName: user.username,
            submitterOsuId: user.osu_id,
            playerName: input.score.username,
            playerOsuId: scoreOsuId,
            scoreDateMs: input.score.date,
            submissionDateMs: row.created_at,
            starRating: input.beatmap.starRating,
            mods: input.score.mods,
            mapName: input.beatmap.title,
            mapArtist: input.beatmap.artist,
            mapMapper: input.beatmap.creator,
            mapDiff: input.beatmap.version,
            mapUrl: input.beatmap.url,
            comment: input.notes,
            grade: input.score.rank,
            score: input.score.totalScore,
            ruleset: input.ruleset,
            accuracy: input.score.accuracy,
            accuracyv2: input.score.accuracyv2,
            isLazer: input.score.isLazer,
            comboMax: input.score.maxCombo,
            comboMapMax: input.beatmap.maxCombo,
            count300: input.score.count300,
            count100: input.score.count100,
            count50: input.score.count50,
            countMiss: input.score.countMiss,
          },
          webhook.replayWebhookMessageFormat,
        )
      }
    } catch (error) {
      console.error("Replay submission webhook failed", error)
    }
  })
  return Response.json(replayRowToApi(row, user.osu_id), { status: 201 })
}
