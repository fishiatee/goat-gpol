import { NextRequest } from "next/server"

import {
  getUserByOsuId,
  listUsers,
  recomputeAllReplayStatuses,
  setUserBanned,
  setUserRole,
} from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canAdmin, canJudge, isManager } from "@/lib/roles"
import type { Role } from "@/lib/replay-types"

export const dynamic = "force-dynamic"

const ROLES: Role[] = ["basic", "judge", "admin", "manager"]

function toUserApi(user: {
  osu_id: number
  username: string
  avatar_url: string
  role: Role
  banned_at: number | null
}) {
  return {
    osuId: user.osu_id,
    username: user.username,
    avatarUrl: user.avatar_url,
    role: user.role,
    bannedAt: user.banned_at,
  }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!canAdmin(user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  return Response.json(listUsers().map(toUserApi))
}

export async function PATCH(request: NextRequest) {
  const actor = await getSessionUser()
  if (!actor) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!canAdmin(actor.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  const body = await request.json().catch(() => null)
  const targetId: unknown = body?.osuId
  if (typeof targetId !== "number" || !Number.isInteger(targetId)) {
    return Response.json({ error: "invalid osuId" }, { status: 400 })
  }
  const target = getUserByOsuId(targetId)
  if (!target) {
    return Response.json({ error: "not found" }, { status: 404 })
  }

  if (actor.osu_id === target.osu_id) {
    if (body.role !== undefined) {
      return Response.json(
        { error: "you cannot change your own role" },
        { status: 403 },
      )
    }
    if (body.banned !== undefined) {
      return Response.json(
        { error: "you cannot ban or unban yourself" },
        { status: 403 },
      )
    }
  }

  let nextRole = target.role
  let nextBannedAt = target.banned_at

  if (body.role !== undefined) {
    const role: unknown = body.role
    if (!ROLES.includes(role as Role)) {
      return Response.json({ error: "invalid role" }, { status: 400 })
    }
    if (role === "manager") {
      return Response.json({ error: "manager level cannot be assigned" }, { status: 400 })
    }
    if (target.role === "manager") {
      return Response.json({ error: "manager level cannot be changed" }, { status: 403 })
    }
    if (target.role === "admin" && !isManager(actor.role)) {
      return Response.json(
        { error: "only the manager can change an admin's role" },
        { status: 403 },
      )
    }
    if (role === "admin" && !isManager(actor.role)) {
      return Response.json(
        { error: "only the manager can promote to admin" },
        { status: 403 },
      )
    }
    nextRole = role as Role
  }

  if (body.banned !== undefined) {
    if (target.role === "manager") {
      return Response.json({ error: "manager cannot be banned" }, { status: 403 })
    }
    if (target.role === "admin" && !isManager(actor.role)) {
      return Response.json(
        { error: "only the manager can ban an admin" },
        { status: 403 },
      )
    }
    nextBannedAt = body.banned ? Date.now() : null
  }

  if (nextRole !== target.role) {
    setUserRole(target.osu_id, nextRole)
  }
  if (nextBannedAt !== target.banned_at) {
    setUserBanned(target.osu_id, nextBannedAt)
  }
  if (canJudge(nextRole) !== canJudge(target.role)) {
    recomputeAllReplayStatuses()
  }
  const updated = getUserByOsuId(target.osu_id)
  return Response.json(updated ? toUserApi(updated) : null)
}