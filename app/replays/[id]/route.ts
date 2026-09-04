import { rm } from "node:fs/promises"
import { NextRequest } from "next/server"

import {
  deleteReplayRow,
  getReplayById,
  getWebhookSettings,
  replayToApiForViewer,
  updateReplayStatusManually,
  updateReplayVideo,
  updateReplayVideoUrl,
} from "@/lib/db"
import {
  isValidWebhookUrl,
  sendRenderUploadedWebhook,
} from "@/lib/discord-webhooks"
import { getSessionUser } from "@/lib/session"
import { canAdmin, canJudge } from "@/lib/roles"
import type { ReplayStatus } from "@/lib/replay-types"

export const dynamic = "force-dynamic"

const MAX_VIDEO_URL_LENGTH = 2000
const MAX_VIDEO_COMMENT_LENGTH = 2000

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!canJudge(user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const { id } = await params
  const replay = getReplayById(Number(id))
  if (!replay) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  const body = (await request.json().catch(() => null)) as {
    status?: unknown
    videoUrl?: unknown
    videoComment?: unknown
  } | null
  if (
    !body ||
    (body.status === undefined &&
      body.videoUrl === undefined &&
      body.videoComment === undefined)
  ) {
    return Response.json({ error: "invalid body" }, { status: 400 })
  }

  let attachedVideoUrl: string | null = null
  let attachedVideoComment: string | null = replay.video_comment ?? null
  if (body.videoUrl !== undefined || body.videoComment !== undefined) {
    let videoUrl: string | null = replay.video_url
    let videoComment: string | null = replay.video_comment ?? null
    if (body.videoUrl !== undefined) {
      videoUrl = null
      if (typeof body.videoUrl === "string") {
        videoUrl = body.videoUrl.trim()
        if (
          videoUrl !== "" &&
          (videoUrl.length > MAX_VIDEO_URL_LENGTH ||
            !/^https?:\/\//i.test(videoUrl))
        ) {
          return Response.json({ error: "invalid video url" }, { status: 400 })
        }
        if (videoUrl === "") {
          videoUrl = null
        } else {
          attachedVideoUrl = videoUrl
        }
      } else if (body.videoUrl !== null) {
        return Response.json({ error: "invalid video url" }, { status: 400 })
      }
    }
    if (body.videoComment !== undefined) {
      videoComment = null
      if (typeof body.videoComment === "string") {
        videoComment = body.videoComment.trim()
        if (videoComment.length > MAX_VIDEO_COMMENT_LENGTH) {
          return Response.json({ error: "invalid video comment" }, { status: 400 })
        }
        if (videoComment === "") {
          videoComment = null
        }
      } else if (body.videoComment !== null) {
        return Response.json({ error: "invalid video comment" }, { status: 400 })
      }
    }
    if (body.videoUrl !== undefined && body.videoComment === undefined) {
      updateReplayVideoUrl(replay.id, videoUrl)
    } else {
      updateReplayVideo(replay.id, videoUrl, videoComment)
    }
    attachedVideoComment = videoComment
  }

  if (attachedVideoUrl !== null) {
    try {
      const webhook = getWebhookSettings()
      if (
        webhook.renderWebhookEnabled &&
        webhook.renderWebhookUrl &&
        isValidWebhookUrl(webhook.renderWebhookUrl)
      ) {
        await sendRenderUploadedWebhook(
          webhook.renderWebhookUrl,
          attachedVideoUrl,
          attachedVideoComment,
          webhook.renderWebhookMessageFormat,
        )
      }
    } catch {
      // Webhook delivery must never fail the attach request.
    }
  }

  if (body.status !== undefined) {
    if (!canAdmin(user.role)) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
    const status = body.status
    if (status !== "pool" && status !== "render") {
      return Response.json({ error: "invalid status" }, { status: 400 })
    }
    updateReplayStatusManually(replay.id, status as ReplayStatus)
  }

  const updated = replayToApiForViewer(replay.id, user.osu_id)
  return Response.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!canAdmin(user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const { id } = await params
  const replay = getReplayById(Number(id))
  if (!replay) {
    return Response.json({ error: "not found" }, { status: 404 })
  }
  deleteReplayRow(replay.id)
  await rm(replay.file_path, { force: true })
  return new Response(null, { status: 204 })
}