import "server-only"
import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { getDb, type UserRow } from "./db"

export const SESSION_COOKIE = "session"

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function createSessionToken(osuId: number, ttlMs = SESSION_TTL_MS) {
  const token = randomBytes(32).toString("hex")
  const expiresAt = Date.now() + ttlMs
  getDb().run(
    "INSERT INTO sessions (token, osu_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [token, osuId, expiresAt, Date.now()],
  )
  return { token, expiresAt }
}

export async function createSessionCookie(osuId: number) {
  const { token, expiresAt } = createSessionToken(osuId)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(expiresAt),
    path: "/",
  })
}

export function getUserBySessionToken(token: string): UserRow | null {
  return getDb().query<UserRow, [string, number]>(
    `SELECT u.*
     FROM sessions s
     JOIN users u ON u.osu_id = s.osu_id
     WHERE s.token = ? AND s.expires_at > ?`,
  ).get(token, Date.now())
}

export async function getSessionUser(): Promise<UserRow | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) {
    return null
  }
  return getUserBySessionToken(token)
}

export async function deleteSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    getDb().run("DELETE FROM sessions WHERE token = ?", [token])
  }
  cookieStore.delete(SESSION_COOKIE)
}

export async function deleteUserSessions(osuId: number) {
  getDb().run("DELETE FROM sessions WHERE osu_id = ?", [osuId])
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}