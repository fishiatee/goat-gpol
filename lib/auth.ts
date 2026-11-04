import "server-only"
import * as osu from "osu-api-v2-js"
import { getDb, getUserByOsuId, type UserRow } from "./db"
import { deleteUserSessions } from "./session"

const OAUTH_SCOPES: osu.Scope[] = ["identify", "public"]

const TOKEN_REFRESH_SKEW_MS = 60 * 1000

export class ReauthenticationRequiredError extends Error {
  constructor() {
    super("reauthentication-required")
    this.name = "ReauthenticationRequiredError"
  }
}

function getClientId(): number {
  const raw = process.env.OSU_CLIENT_ID
  if (!raw) {
    throw new Error("OSU_CLIENT_ID environment variable is not set")
  }
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("OSU_CLIENT_ID environment variable must be a positive integer")
  }
  return id
}

function getClientSecret(): string {
  const secret = process.env.OSU_CLIENT_SECRET
  if (!secret) {
    throw new Error("OSU_CLIENT_SECRET environment variable is not set")
  }
  return secret
}

export function getAppOrigin(requestOrigin: string): string {
  return process.env.BASE_URL ?? requestOrigin
}

export function getRedirectUri(): string {
  return new URL("/auth/callback", process.env.BASE_URL).toString()
}

export function buildAuthorizationUrl(state: string): string {
  const url = osu.generateAuthorizationURL(
    getClientId(),
    getRedirectUri(),
    OAUTH_SCOPES,
  )
  return `${url}&state=${encodeURIComponent(state)}`
}

export async function authorizeWithCode(code: string, redirectUri: string): Promise<osu.API> {
  return osu.API.createAsync(
    getClientId(),
    getClientSecret(),
    {
      redirect_uri: redirectUri,
      code,
    },
    {
      set_token_on_expires: false,
    },
  )
}

export async function getResourceOwner(api: osu.API) {
  return api.getResourceOwner()
}

export function createUserApi(user: UserRow, settings: Partial<osu.API> = {}): osu.API {
  return new osu.API({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    set_token_on_creation: false,
    set_token_on_expires: false,
    access_token: user.access_token,
    refresh_token: user.refresh_token ?? undefined,
    expires: user.token_expires_at ? new Date(user.token_expires_at) : undefined,
    ...settings,
  })
}

function tokenNeedsRefresh(user: UserRow): boolean {
  return (
    user.refresh_token !== null &&
    user.token_expires_at !== null &&
    Date.now() >= user.token_expires_at - TOKEN_REFRESH_SKEW_MS
  )
}

function isReauthenticationError(error: unknown): boolean {
  if (!(error instanceof osu.APIError)) {
    return false
  }
  const response = error.response
  if (!response || (response.status_code !== 400 && response.status_code !== 401)) {
    return false
  }
  const body = response.json
  if (typeof body !== "object" || body === null) {
    return false
  }
  const code = (body as { error?: unknown }).error
  return code === "invalid_grant" || code === "invalid_token"
}

async function rethrowTokenError(osuId: number, error: unknown): Promise<never> {
  if (isReauthenticationError(error)) {
    await deleteUserSessions(osuId)
    throw new ReauthenticationRequiredError()
  }
  throw error
}

export function persistUserTokens(osuId: number, api: osu.API) {
  const user = getUserByOsuId(osuId)
  if (!user) {
    return
  }
  const refreshToken = api.refresh_token ?? user.refresh_token
  const tokenExpiresAt = api.expires.getTime()
  if (
    api.access_token === user.access_token &&
    refreshToken === user.refresh_token &&
    tokenExpiresAt === user.token_expires_at
  ) {
    return
  }
  getDb().run(
    "UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = ? WHERE osu_id = ?",
    [api.access_token, refreshToken, tokenExpiresAt, Date.now(), osuId],
  )
}

export async function withUserApi<T>(
  osuId: number,
  fn: (api: osu.API) => Promise<T>,
): Promise<T> {
  const user = getUserByOsuId(osuId)
  if (!user) {
    throw new Error(`User ${osuId} not found`)
  }
  const api = createUserApi(user)
  if (tokenNeedsRefresh(user)) {
    try {
      await api.setNewToken()
    } catch (error) {
      await rethrowTokenError(osuId, error)
    }
    persistUserTokens(osuId, api)
  }
  try {
    return await fn(api)
  } catch (error) {
    return await rethrowTokenError(osuId, error)
  } finally {
    persistUserTokens(osuId, api)
  }
}