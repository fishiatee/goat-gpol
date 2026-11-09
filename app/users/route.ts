import { NextRequest } from "next/server"

import {
  getDb,
  getUserByOsuId,
  listUsers,
  recomputeAllReplayStatuses,
  setUserBanned,
  setUserPermissions,
  setUserRole,
  type UserRow,
} from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import {
  hasPermission,
  isManager,
  isPermission,
  legacyPermissions,
  userPermissions,
  type Permission,
} from "@/lib/permissions"
import type { Role } from "@/lib/replay-types"

export const dynamic = "force-dynamic"

function toUserApi(user: UserRow) {
  return {
    osuId: user.osu_id,
    username: user.username,
    avatarUrl: user.avatar_url,
    role: user.role,
    permissions: userPermissions(user),
    bannedAt: user.banned_at,
  }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 })
  if (!hasPermission(user, "manage_users")) {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }
  return Response.json(listUsers().map(toUserApi))
}

export async function PATCH(request: NextRequest) {
  const actor = await getSessionUser()
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid body" }, { status: 400 })
  }
  const targetId: unknown = body.osuId
  if (typeof targetId !== "number" || !Number.isInteger(targetId)) {
    return Response.json({ error: "invalid osuId" }, { status: 400 })
  }
  const target = getUserByOsuId(targetId)
  if (!target) return Response.json({ error: "not found" }, { status: 404 })
  const changesPermissions = body.permissions !== undefined || body.role !== undefined
  const changesBan = body.banned !== undefined
  if (!changesPermissions && !changesBan) {
    return Response.json({ error: "invalid body" }, { status: 400 })
  }
  if (actor.osu_id === target.osu_id || isManager(target)) {
    return Response.json({ error: "cannot modify yourself or the manager" }, { status: 403 })
  }
  const previousPermissions = userPermissions(target)
  let permissions = previousPermissions
  let role: Role | undefined
  if (changesPermissions) {
    if (!hasPermission(actor, "site_administration") ||
      (previousPermissions.includes("site_administration") && !isManager(actor))) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
    if (body.role !== undefined) {
      if (body.permissions !== undefined || !["basic", "judge", "admin"].includes(body.role)) {
        return Response.json({ error: "invalid role" }, { status: 400 })
      }
      role = body.role as Role
      permissions = legacyPermissions(role)
    } else {
      if (!Array.isArray(body.permissions) || !body.permissions.every(isPermission)) {
        return Response.json({ error: "invalid permissions" }, { status: 400 })
      }
      permissions = [...new Set<Permission>(body.permissions)]
    }
    if (!isManager(actor) && (
      permissions.includes("site_administration") !== previousPermissions.includes("site_administration") ||
      permissions.some((permission) => !previousPermissions.includes(permission) && !hasPermission(actor, permission))
    )) {
      return Response.json({ error: "cannot grant these permissions" }, { status: 403 })
    }
  }
  if (changesBan) {
    if (typeof body.banned !== "boolean") {
      return Response.json({ error: "invalid banned value" }, { status: 400 })
    }
    if (!hasPermission(actor, "ban_users") ||
      (previousPermissions.includes("site_administration") && !isManager(actor))) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
  }
  getDb().transaction(() => {
    if (changesPermissions) {
      if (role !== undefined) setUserRole(target.osu_id, role)
      setUserPermissions(target.osu_id, permissions)
    }
    if (changesBan) setUserBanned(target.osu_id, body.banned ? Date.now() : null)
    if (hasPermission({ ...target, permissions }, "judge") !== hasPermission(target, "judge")) {
      recomputeAllReplayStatuses()
    }
  })()
  return Response.json(toUserApi(getUserByOsuId(target.osu_id)!))
}
