import { NextRequest } from "next/server"

import {
  deleteJudgmentById,
  getJudgment,
  getReplayById,
  judgmentToApi,
  listJudgments,
  replayToApiForViewer,
  updateJudgmentById,
  upsertJudgment,
} from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canAccessReplays, hasPermission } from "@/lib/permissions"
import type { UserRow } from "@/lib/db"

export const dynamic = "force-dynamic"

function votesForViewer(replayId: number, user: UserRow) {
  return listJudgments(replayId).map((row, index) => {
    const vote = judgmentToApi(row)
    if (row.judge_osu_id === user.osu_id || hasPermission(user, "see_vote_details")) return vote
    return {
      ...vote,
      id: -(index + 1),
      judgeOsuId: 0,
      judgeUsername: "???",
      judgeAvatarUrl: "",
      comment: "",
      createdAt: 0,
      updatedAt: 0,
    }
  })
}

function parseScoreComment(body: unknown): {
  score: number
  comment: string
} | null {
  if (!body || typeof body !== "object") {
    return null
  }
  const { score, comment } = body as Record<string, unknown>
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 5 ||
    typeof comment !== "string"
  ) {
    return null
  }
  return { score: Math.round(score * 100) / 100, comment }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const replay = getReplayById(Number(id))
  if (!replay) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  if (replay.osu_id !== user.osu_id && !canAccessReplays(user) && !hasPermission(user, "see_vote_details")) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  return Response.json(votesForViewer(replay.id, user))
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!hasPermission(user, "judge")) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const { id } = await params
  const replay = getReplayById(Number(id))
  if (!replay) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  if (replay.score_osu_id === user.osu_id) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const input = parseScoreComment(await request.json().catch(() => null))
  if (!input) {
    return Response.json({ error: "invalid score or comment" }, { status: 400 })
  }
  upsertJudgment(replay.id, user.osu_id, input.score, input.comment)
  return Response.json(replayToApiForViewer(replay.id, user.osu_id))
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!hasPermission(user, "manage_replays") || !hasPermission(user, "see_vote_details")) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const { id } = await params
  const replay = getReplayById(Number(id))
  if (!replay) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  const judgeOsuId = Number(request.nextUrl.searchParams.get("judgeOsuId"))
  if (!Number.isInteger(judgeOsuId)) {
    return Response.json({ error: "invalid judge" }, { status: 400 })
  }
  const judgment = getJudgment(replay.id, judgeOsuId)
  if (!judgment) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  const input = parseScoreComment(await request.json().catch(() => null))
  if (!input) {
    return Response.json({ error: "invalid score or comment" }, { status: 400 })
  }
  updateJudgmentById(judgment.id, replay.id, input.score, input.comment)
  return Response.json(votesForViewer(replay.id, user))
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!hasPermission(user, "manage_replays") || !hasPermission(user, "see_vote_details")) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const { id } = await params
  const replay = getReplayById(Number(id))
  if (!replay) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  const judgeOsuId = Number(request.nextUrl.searchParams.get("judgeOsuId"))
  if (!Number.isInteger(judgeOsuId)) {
    return Response.json({ error: "invalid judge" }, { status: 400 })
  }
  const judgment = getJudgment(replay.id, judgeOsuId)
  if (!judgment) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  deleteJudgmentById(judgment.id, replay.id)
  return new Response(null, { status: 204 })
}
