import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { NextRequest } from "next/server"

import {
  findDuplicateReplay,
  getReplayById,
  insertReplay,
  listReplays,
  listReplaysByUser,
  replayRowToApi,
  updateReplayFilePath,
} from "@/lib/db"
import { withUserApi } from "@/lib/auth"
import { getSessionUser } from "@/lib/session"
import { canAdmin, canJudge } from "@/lib/roles"
import type { ReplayMetadata } from "@/lib/replay-types"

export const dynamic = "force-dynamic"

const MAX_REPLAY_BYTES = 50 * 1024 * 1024

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
    if (!canJudge(user.role)) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
    const rows = listReplays(scope === "render" ? "render" : "pool")
    return Response.json(rows.map((r) => replayRowToApi(r, user.osu_id)))
  }
  if (scope === "all") {
    if (!canAdmin(user.role)) {
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
  if (user.banned_at !== null) {
    return Response.json({ error: "banned" }, { status: 403 })
  }
  const form = await request.formData()
  const file = form.get("file")
  const metadata = form.get("metadata")
  if (!(file instanceof File) || typeof metadata !== "string") {
    return Response.json({ error: "missing file or metadata" }, { status: 400 })
  }
  if (file.size === 0 || file.size > MAX_REPLAY_BYTES) {
    return Response.json({ error: "invalid file size" }, { status: 400 })
  }
  const input = parseReplayMetadata(metadata)
  if (!input) {
    return Response.json({ error: "invalid metadata" }, { status: 400 })
  }

  let scoreOsuId: number | null = null
  try {
    const scoreUser = await withUserApi(user.osu_id, (api) =>
      api.getUser(input.score.username),
    )
    scoreOsuId = scoreUser.id
  } catch {
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

  const id = insertReplay({
    osuId: user.osu_id,
    fileName: input.fileName,
    skinName: input.skinName,
    notes: input.notes,
    ruleset: input.ruleset,
    beatmapChecksum: input.beatmapChecksum,
    beatmap: input.beatmap,
    score: { ...input.score, osuId: scoreOsuId },
  })

  const dir = path.join(process.cwd(), "data", "replays")
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${id}.osr`)
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()))
  updateReplayFilePath(id, filePath)

  const row = getReplayById(id)
  if (!row) {
    return Response.json({ error: "internal error" }, { status: 500 })
  }
  return Response.json(replayRowToApi(row, user.osu_id), { status: 201 })
}