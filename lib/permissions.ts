import type { Role } from "@/lib/replay-types"

export const PERMISSIONS = {
  manage_users: "Manage users",
  manage_replays: "Manage submitted replays",
  manage_skins: "Manage submitted skins",
  manage_webhooks: "Manage web-hooks",
  manage_thresholds: "Manage submission thresholds",
  see_vote_details: "See vote details",
  judge: "Allow judging",
  render: "Allow rendering",
  manual_replay_status: "Allow manual replay status intervention",
  ban_users: "Allow banning users",
  delete_replays: "Allow replays deletion",
  delete_skins: "Allow skins deletion",
  site_administration: "Site administration",
} as const

export type Permission = keyof typeof PERMISSIONS

export type PermissionUser = {
  role: Role
  permissions: string | Permission[]
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && Object.hasOwn(PERMISSIONS, value)
}

export function userPermissions(user: PermissionUser): Permission[] {
  const value: unknown = typeof user.permissions === "string"
    ? JSON.parse(user.permissions)
    : user.permissions
  return Array.isArray(value) ? value.filter(isPermission) : []
}

export function legacyPermissions(role: Role): Permission[] {
  if (role === "admin") return ["site_administration"]
  if (role === "judge") return ["judge", "render", "see_vote_details"]
  return []
}

export function isManager(user: PermissionUser): boolean {
  return user.role === "manager"
}

export function hasPermission(user: PermissionUser, permission: Permission): boolean {
  if (isManager(user)) return true
  const permissions = userPermissions(user)
  return permissions.includes("site_administration") || permissions.includes(permission)
}

export function isEligibleJudge(user: PermissionUser): boolean {
  return hasPermission(user, "judge")
}

export const MANAGE_PERMISSIONS = {
  users: "manage_users",
  replays: "manage_replays",
  skins: "manage_skins",
  webhooks: "manage_webhooks",
  thresholds: "manage_thresholds",
} as const

export function canManage(user: PermissionUser): boolean {
  return Object.values(MANAGE_PERMISSIONS).some((permission) => hasPermission(user, permission))
}

export function canAccessReplays(user: PermissionUser): boolean {
  return hasPermission(user, "judge") || hasPermission(user, "render") || hasPermission(user, "manage_replays")
}
