import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import path from "node:path"
import type {
  JudgmentApi,
  ReplayApi,
  ReplayState,
  Role,
  ReplayStatus,
} from "@/lib/replay-types"
import {
  DEFAULT_JUDGE_SETTINGS,
  DEFAULT_SKIN_LIMITS,
  statusFromJudgments,
  type JudgeSettings,
  type SkinLimits,
} from "@/lib/judging"

export type UserRow = {
  osu_id: number
  username: string
  avatar_url: string
  country_code: string
  access_token: string
  refresh_token: string | null
  token_expires_at: number | null
  role: Role
  banned_at: number | null
  created_at: number
  updated_at: number
}

export type SessionRow = {
  token: string
  osu_id: number
  expires_at: number
  created_at: number
}

let db: Database | null = null

export function getDb(): Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db")
    mkdirSync(path.dirname(dbPath), { recursive: true })
    db = new Database(dbPath)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("PRAGMA foreign_keys = ON")
    migrate(db)
    syncManagerRoleAtStartup()
  }
  return db
}

function columnExists(db: Database, table: string, column: string): boolean {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((r) => r.name === column)
}

function ensureColumn(db: Database, table: string, column: string, ddl: string) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      osu_id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT '',
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at INTEGER,
      role TEXT NOT NULL DEFAULT 'basic',
      banned_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      osu_id INTEGER NOT NULL REFERENCES users(osu_id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      osu_id INTEGER NOT NULL REFERENCES users(osu_id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      skin_name TEXT,
      status TEXT NOT NULL DEFAULT 'pool',
      manual INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      ruleset TEXT NOT NULL DEFAULT 'osu',
      beatmap_checksum TEXT NOT NULL,
      beatmap_id INTEGER NOT NULL,
      beatmap_title TEXT NOT NULL,
      beatmap_artist TEXT NOT NULL,
      beatmap_creator TEXT NOT NULL,
      beatmap_version TEXT NOT NULL,
      beatmap_star_rating REAL NOT NULL,
      beatmap_max_combo INTEGER NOT NULL,
      beatmap_url TEXT NOT NULL,
      beatmap_background_url TEXT NOT NULL,
      beatmap_cover_list_url TEXT NOT NULL,
      score_rank TEXT NOT NULL,
      score_osu_id INTEGER,
      score_username TEXT NOT NULL,
      score_date INTEGER NOT NULL,
      score_total INTEGER NOT NULL,
      score_max_combo INTEGER NOT NULL,
      score_accuracy REAL NOT NULL,
      score_mods TEXT NOT NULL,
      score_count_geki INTEGER NOT NULL,
      score_count_katu INTEGER NOT NULL,
  score_count_300 INTEGER NOT NULL,
  score_count_100 INTEGER NOT NULL,
  score_count_50 INTEGER NOT NULL,
  score_count_miss INTEGER NOT NULL,
  score_accuracyv2 REAL NOT NULL DEFAULT 0,
  score_is_lazer INTEGER NOT NULL DEFAULT 0,
  video_url TEXT,
  video_comment TEXT,
  created_at INTEGER NOT NULL
);

    CREATE TABLE IF NOT EXISTS judgments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      replay_id INTEGER NOT NULL REFERENCES replays(id) ON DELETE CASCADE,
      judge_osu_id INTEGER NOT NULL REFERENCES users(osu_id) ON DELETE CASCADE,
      score REAL NOT NULL CHECK(score BETWEEN 0 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(replay_id, judge_osu_id)
    );

    CREATE TABLE IF NOT EXISTS skins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      osu_id INTEGER NOT NULL REFERENCES users(osu_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  ensureColumn(db, "users", "role", "role TEXT NOT NULL DEFAULT 'basic'")
  ensureColumn(db, "users", "banned_at", "banned_at INTEGER")
  ensureColumn(db, "replays", "status", "status TEXT NOT NULL DEFAULT 'pool'")
  ensureColumn(db, "replays", "manual", "manual INTEGER NOT NULL DEFAULT 0")
  ensureColumn(db, "replays", "locked", "locked INTEGER NOT NULL DEFAULT 0")
  ensureColumn(db, "replays", "score_osu_id", "score_osu_id INTEGER")
  ensureColumn(db, "replays", "ruleset", "ruleset TEXT NOT NULL DEFAULT 'osu'")
  ensureColumn(db, "skins", "file_path", "file_path TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "skins", "rulesets", "rulesets TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, "skins", "scroll_speed", "scroll_speed REAL")
  ensureColumn(db, "replays", "video_url", "video_url TEXT")
  ensureColumn(db, "replays", "video_comment", "video_comment TEXT")
  ensureColumn(
    db,
    "replays",
    "score_accuracyv2",
    "score_accuracyv2 REAL NOT NULL DEFAULT 0",
  )
  ensureColumn(
    db,
    "replays",
    "score_is_lazer",
    "score_is_lazer INTEGER NOT NULL DEFAULT 0",
  )
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_osu_id ON sessions(osu_id)")
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)")
  db.run("CREATE INDEX IF NOT EXISTS idx_replays_created_at ON replays(created_at DESC)")
  db.run("CREATE INDEX IF NOT EXISTS idx_replays_osu_id ON replays(osu_id)")
  db.run("CREATE INDEX IF NOT EXISTS idx_judgments_replay_id ON judgments(replay_id)")
  db.run("CREATE INDEX IF NOT EXISTS idx_skins_osu_id ON skins(osu_id)")
}

export type UpsertUserInput = {
  osuId: number
  username: string
  avatarUrl: string
  countryCode: string
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: number | null
}

export function upsertUser(input: UpsertUserInput) {
  const now = Date.now()
  getDb().run(
    `INSERT INTO users (osu_id, username, avatar_url, country_code, access_token, refresh_token, token_expires_at, role, banned_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'basic', NULL, ?, ?)
     ON CONFLICT(osu_id) DO UPDATE SET
       username = excluded.username,
       avatar_url = excluded.avatar_url,
       country_code = excluded.country_code,
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       token_expires_at = excluded.token_expires_at,
       updated_at = excluded.updated_at`,
    [
      input.osuId,
      input.username,
      input.avatarUrl,
      input.countryCode,
      input.accessToken,
      input.refreshToken,
      input.tokenExpiresAt,
      now,
      now,
    ],
  )
}

export function getUserByOsuId(osuId: number): UserRow | null {
  return getDb().query<UserRow, [number]>(
    "SELECT * FROM users WHERE osu_id = ?",
  ).get(osuId)
}

export function listUsers(): UserRow[] {
  return getDb().query<UserRow, []>(
    "SELECT * FROM users ORDER BY username COLLATE NOCASE ASC",
  ).all()
}

function applyManagerRole(managerId: number) {
  getDb().run("UPDATE users SET role = 'manager' WHERE osu_id = ?", [managerId])
  getDb().run(
    "UPDATE users SET role = 'basic' WHERE role = 'manager' AND osu_id != ?",
    [managerId],
  )
}

export function syncManagerRoleAtStartup() {
  const managerId = Number(process.env.MANAGER_USER_ID)
  if (!Number.isInteger(managerId)) {
    return
  }
  applyManagerRole(managerId)
}

export function syncManagerRole(osuId: number) {
  const managerId = Number(process.env.MANAGER_USER_ID)
  if (!Number.isInteger(managerId)) {
    return
  }
  if (osuId === managerId) {
    applyManagerRole(managerId)
  } else {
    getDb().run(
      "UPDATE users SET role = 'basic' WHERE role = 'manager' AND osu_id != ?",
      [managerId],
    )
  }
}

export function setUserRole(osuId: number, role: Role) {
  getDb().run("UPDATE users SET role = ?, updated_at = ? WHERE osu_id = ?", [
    role,
    Date.now(),
    osuId,
  ])
}

export function setUserBanned(osuId: number, bannedAt: number | null) {
  getDb().run("UPDATE users SET banned_at = ?, updated_at = ? WHERE osu_id = ?", [
    bannedAt,
    Date.now(),
    osuId,
  ])
}

export type SkinRow = {
  id: number
  osu_id: number
  name: string
  rulesets: string
  scroll_speed: number | null
  file_path: string
  created_at: number
}

export function insertSkin(
  osuId: number,
  name: string,
  rulesets: string,
  scrollSpeed: number | null,
): number {
  const result = getDb().run(
    "INSERT INTO skins (osu_id, name, rulesets, scroll_speed, created_at) VALUES (?, ?, ?, ?, ?)",
    [osuId, name, rulesets, scrollSpeed, Date.now()],
  )
  return Number(result.lastInsertRowid)
}

export function updateSkinFilePath(id: number, filePath: string) {
  getDb().run("UPDATE skins SET file_path = ? WHERE id = ?", [filePath, id])
}

export function getSkinById(id: number): SkinRow | null {
  return getDb().query<SkinRow, [number]>(
    "SELECT * FROM skins WHERE id = ?",
  ).get(id)
}

export type SkinWithUploader = SkinRow & { uploader_username: string }

export function listSkinsByUser(osuId: number): SkinWithUploader[] {
  return getDb().query<SkinWithUploader, [number]>(
    `SELECT s.*, u.username AS uploader_username
     FROM skins s
     JOIN users u ON u.osu_id = s.osu_id
     WHERE s.osu_id = ?
     ORDER BY s.created_at DESC`,
  ).all(osuId)
}

export function listSkins(): SkinWithUploader[] {
  return getDb().query<SkinWithUploader, []>(
    `SELECT s.*, u.username AS uploader_username
     FROM skins s
     JOIN users u ON u.osu_id = s.osu_id
     ORDER BY s.created_at DESC`,
  ).all()
}

export function deleteSkin(id: number) {
  getDb().run("DELETE FROM skins WHERE id = ?", [id])
}

export type ReplayRow = {
  id: number
  osu_id: number
  file_path: string
  file_name: string
  notes: string
  skin_name: string | null
  status: ReplayStatus
  manual: number
  locked: number
  ruleset: string
  beatmap_checksum: string
  beatmap_id: number
  beatmap_title: string
  beatmap_artist: string
  beatmap_creator: string
  beatmap_version: string
  beatmap_star_rating: number
  beatmap_max_combo: number
  beatmap_url: string
  beatmap_background_url: string
  beatmap_cover_list_url: string
  score_rank: string
  score_osu_id: number | null
  score_username: string
  score_date: number
  score_total: number
  score_max_combo: number
  score_accuracy: number
  score_mods: string
  score_count_geki: number
  score_count_katu: number
  score_count_300: number
  score_count_100: number
  score_count_50: number
  score_count_miss: number
  score_accuracyv2: number
  score_is_lazer: number
  video_url: string | null
  video_comment: string | null
  created_at: number
}

export type ReplayWithSubmitter = ReplayRow & { submitter_username: string }

export type NewReplay = {
  osuId: number
  fileName: string
  skinName: string | null
  notes: string
  ruleset: string
  beatmapChecksum: string
  beatmap: {
    id: number
    title: string
    artist: string
    creator: string
    version: string
    starRating: number
    maxCombo: number
    url: string
    backgroundUrl: string
    coverListUrl: string
  }
  score: {
    rank: string
    osuId: number | null
    username: string
    date: number
    totalScore: number
    maxCombo: number
    accuracy: number
    accuracyv2: number
    mods: string[]
    isLazer: boolean
    countGeki: number
    countKatu: number
    count300: number
    count100: number
    count50: number
    countMiss: number
  }
}

export function insertReplay(input: NewReplay): number {
  const result = getDb().run(
     `INSERT INTO replays (
       osu_id, file_path, file_name, notes, skin_name, status, ruleset,
       beatmap_checksum, beatmap_id, beatmap_title, beatmap_artist, beatmap_creator,
       beatmap_version, beatmap_star_rating, beatmap_max_combo, beatmap_url,
       beatmap_background_url, beatmap_cover_list_url,
       score_rank, score_osu_id, score_username, score_date, score_total, score_max_combo,
       score_accuracy, score_accuracyv2, score_mods, score_is_lazer,
       score_count_geki, score_count_katu, score_count_300, score_count_100,
       score_count_50, score_count_miss,
       created_at
     ) VALUES (?, ?, ?, ?, ?, 'pool', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.osuId,
      "",
      input.fileName,
      input.notes,
      input.skinName,
      input.ruleset,
      input.beatmapChecksum,
      input.beatmap.id,
      input.beatmap.title,
      input.beatmap.artist,
      input.beatmap.creator,
      input.beatmap.version,
      input.beatmap.starRating,
      input.beatmap.maxCombo,
      input.beatmap.url,
      input.beatmap.backgroundUrl,
      input.beatmap.coverListUrl,
      input.score.rank,
      input.score.osuId,
      input.score.username,
      input.score.date,
      input.score.totalScore,
      input.score.maxCombo,
      input.score.accuracy,
      input.score.accuracyv2,
      JSON.stringify(input.score.mods),
      input.score.isLazer ? 1 : 0,
      input.score.countGeki,
      input.score.countKatu,
      input.score.count300,
      input.score.count100,
      input.score.count50,
      input.score.countMiss,
      Date.now(),
    ],
  )
  return Number(result.lastInsertRowid)
}

export function findDuplicateReplay(
  beatmapChecksum: string,
  scoreOsuId: number | null,
  scoreUsername: string,
  scoreDate: number,
): ReplayWithSubmitter | null {
  if (scoreOsuId !== null) {
    return getDb().query<
      ReplayWithSubmitter,
      [string, number, number]
    >(
      `SELECT r.*, u.username AS submitter_username
       FROM replays r
       JOIN users u ON u.osu_id = r.osu_id
       WHERE r.beatmap_checksum = ? AND r.score_osu_id = ? AND r.score_date = ?
       LIMIT 1`,
    ).get(beatmapChecksum, scoreOsuId, scoreDate)
  }
  return getDb().query<ReplayWithSubmitter, [string, string, number]>(
    `SELECT r.*, u.username AS submitter_username
     FROM replays r
     JOIN users u ON u.osu_id = r.osu_id
     WHERE r.beatmap_checksum = ? AND r.score_username = ? COLLATE NOCASE AND r.score_date = ?
     LIMIT 1`,
  ).get(beatmapChecksum, scoreUsername, scoreDate)
}

export function updateReplayFilePath(id: number, filePath: string) {
  getDb().run("UPDATE replays SET file_path = ? WHERE id = ?", [filePath, id])
}

export function updateReplayVideoUrl(id: number, videoUrl: string | null) {
  getDb().run("UPDATE replays SET video_url = ? WHERE id = ?", [videoUrl, id])
}

export function updateReplayVideo(
  id: number,
  videoUrl: string | null,
  videoComment: string | null,
) {
  getDb().run("UPDATE replays SET video_url = ?, video_comment = ? WHERE id = ?", [
    videoUrl,
    videoComment,
    id,
  ])
}

export function replayStateFromRow(
  status: ReplayStatus,
  manual: number,
  videoUrl: string | null,
): ReplayState {
  if (videoUrl !== null && videoUrl !== "") {
    return "uploaded"
  }
  if (manual === 1 && status === "pool") {
    return "denied"
  }
  return status === "render" ? "queued" : "submitted"
}

export function updateReplayStatusManually(id: number, status: ReplayStatus) {
  const db = getDb()
  db.run(
    `UPDATE replays
     SET status = ?,
         manual = 1,
         locked = CASE WHEN ? = 'pool' THEN 1 ELSE locked END
     WHERE id = ?`,
    [status, status, id],
  )
  db.run("DELETE FROM judgments WHERE replay_id = ?", [id])
}

export function deleteReplayRow(id: number) {
  getDb().run("DELETE FROM replays WHERE id = ?", [id])
}

export function getReplayById(id: number): ReplayWithSubmitter | null {
  return getDb().query<ReplayWithSubmitter, [number]>(
    `SELECT r.*, u.username AS submitter_username
     FROM replays r
     JOIN users u ON u.osu_id = r.osu_id
     WHERE r.id = ?`,
  ).get(id)
}

export function listReplays(status?: ReplayStatus): ReplayWithSubmitter[] {
  if (status) {
    return getDb().query<ReplayWithSubmitter, [string]>(
      `SELECT r.*, u.username AS submitter_username
       FROM replays r
       JOIN users u ON u.osu_id = r.osu_id
       WHERE r.status = ?
       ORDER BY r.created_at DESC`,
    ).all(status)
  }
  return getDb().query<ReplayWithSubmitter, []>(
    `SELECT r.*, u.username AS submitter_username
     FROM replays r
     JOIN users u ON u.osu_id = r.osu_id
     ORDER BY r.created_at DESC`,
  ).all()
}

export function listReplaysByUser(osuId: number): ReplayWithSubmitter[] {
  return getDb().query<ReplayWithSubmitter, [number]>(
    `SELECT r.*, u.username AS submitter_username
     FROM replays r
     JOIN users u ON u.osu_id = r.osu_id
     WHERE r.osu_id = ?
     ORDER BY r.created_at DESC`,
  ).all(osuId)
}

export type JudgmentRow = {
  id: number
  replay_id: number
  judge_osu_id: number
  score: number
  comment: string
  created_at: number
  updated_at: number
}

export type JudgmentWithJudge = JudgmentRow & {
  judge_username: string
  judge_avatar_url: string
}

export function listJudgments(replayId: number): JudgmentWithJudge[] {
  return getDb().query<JudgmentWithJudge, [number]>(
    `SELECT j.*, u.username AS judge_username, u.avatar_url AS judge_avatar_url
     FROM judgments j
     JOIN users u ON u.osu_id = j.judge_osu_id
     WHERE j.replay_id = ?
     ORDER BY j.created_at ASC`,
  ).all(replayId)
}

export function judgmentToApi(judgment: JudgmentWithJudge): JudgmentApi {
  return {
    id: judgment.id,
    replayId: judgment.replay_id,
    judgeOsuId: judgment.judge_osu_id,
    judgeUsername: judgment.judge_username,
    judgeAvatarUrl: judgment.judge_avatar_url,
    score: judgment.score,
    comment: judgment.comment,
    createdAt: judgment.created_at,
    updatedAt: judgment.updated_at,
  }
}

export function getJudgment(
  replayId: number,
  judgeOsuId: number,
): JudgmentRow | null {
  return getDb().query<JudgmentRow, [number, number]>(
    "SELECT * FROM judgments WHERE replay_id = ? AND judge_osu_id = ?",
  ).get(replayId, judgeOsuId)
}

export function getJudgmentSummary(replayId: number): {
  count: number
  average: number | null
} {
  const row = getDb().query<{ count: number; avg: number | null }, [number]>(
    "SELECT COUNT(*) AS count, AVG(score) AS avg FROM judgments WHERE replay_id = ?",
  ).get(replayId)
  return { count: row?.count ?? 0, average: row?.avg ?? null }
}

export function getJudgmentScores(replayId: number): number[] {
  return getDb().query<{ score: number }, [number]>(
    "SELECT score FROM judgments WHERE replay_id = ?",
  ).all(replayId).map((r) => r.score)
}

export function getJudgeSettings(): JudgeSettings {
  const rows = getDb().query<{ key: string; value: string }, []>(
    "SELECT key, value FROM settings",
  ).all()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const num = (key: string, fallback: number) => {
    const value = Number(map.get(key))
    return Number.isFinite(value) ? value : fallback
  }
  return {
    thresholdScore: num(
      "thresholdScore",
      DEFAULT_JUDGE_SETTINGS.thresholdScore,
    ),
    thresholdPercent: num(
      "thresholdPercent",
      DEFAULT_JUDGE_SETTINGS.thresholdPercent,
    ),
  }
}

export function updateJudgeSettings(partial: Partial<JudgeSettings>) {
  const entries: [string, number][] = []
  if (partial.thresholdScore !== undefined) {
    entries.push(["thresholdScore", partial.thresholdScore])
  }
  if (partial.thresholdPercent !== undefined) {
    entries.push(["thresholdPercent", partial.thresholdPercent])
  }
  for (const [key, value] of entries) {
    getDb().run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, String(value)],
    )
  }
}

export function getSkinLimits(): SkinLimits {
  const rows = getDb().query<{ key: string; value: string }, []>(
    "SELECT key, value FROM settings",
  ).all()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const num = (key: string, fallback: number) => {
    const value = Number(map.get(key))
    return Number.isFinite(value) ? value : fallback
  }
  return {
    maxSkinsPerUser: num(
      "maxSkinsPerUser",
      DEFAULT_SKIN_LIMITS.maxSkinsPerUser,
    ),
    maxSkinSizeMb: num(
      "maxSkinSizeMb",
      DEFAULT_SKIN_LIMITS.maxSkinSizeMb,
    ),
  }
}

export function updateSkinLimits(partial: Partial<SkinLimits>) {
  const entries: [string, number][] = []
  if (partial.maxSkinsPerUser !== undefined) {
    entries.push(["maxSkinsPerUser", partial.maxSkinsPerUser])
  }
  if (partial.maxSkinSizeMb !== undefined) {
    entries.push(["maxSkinSizeMb", partial.maxSkinSizeMb])
  }
  for (const [key, value] of entries) {
    getDb().run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, String(value)],
    )
  }
}

export function countEligibleJudges(): number {
  const row = getDb().query<{ count: number }, []>(
    "SELECT COUNT(*) AS count FROM users WHERE role IN ('judge', 'admin', 'manager')",
  ).get()
  return row?.count ?? 0
}

export function recomputeReplayStatus(replayId: number) {
  const row = getDb().query<{ locked: number }, [number]>(
    "SELECT locked FROM replays WHERE id = ?",
  ).get(replayId)
  const locked = row?.locked === 1
  const status = locked
    ? "pool"
    : statusFromJudgments(
        getJudgmentScores(replayId),
        countEligibleJudges(),
        getJudgeSettings(),
      )
  getDb().run("UPDATE replays SET status = ?, manual = 0 WHERE id = ?", [
    status,
    replayId,
  ])
}

export function recomputeAllReplayStatuses() {
  const rows = getDb().query<{ id: number }, []>(
    "SELECT id FROM replays",
  ).all()
  for (const row of rows) {
    recomputeReplayStatus(row.id)
  }
}

export function upsertJudgment(
  replayId: number,
  judgeOsuId: number,
  score: number,
  comment: string,
) {
  const now = Date.now()
  getDb().run(
    `INSERT INTO judgments (replay_id, judge_osu_id, score, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(replay_id, judge_osu_id) DO UPDATE SET
       score = excluded.score,
       comment = excluded.comment,
       updated_at = excluded.updated_at`,
    [replayId, judgeOsuId, score, comment, now, now],
  )
  recomputeReplayStatus(replayId)
}

export function updateJudgmentById(
  id: number,
  replayId: number,
  score: number,
  comment: string,
) {
  getDb().run(
    "UPDATE judgments SET score = ?, comment = ?, updated_at = ? WHERE id = ?",
    [score, comment, Date.now(), id],
  )
  recomputeReplayStatus(replayId)
}

export function deleteJudgmentById(id: number, replayId: number) {
  getDb().run("DELETE FROM judgments WHERE id = ?", [id])
  recomputeReplayStatus(replayId)
}

export function replayRowToApi(
  row: ReplayWithSubmitter,
  viewerOsuId: number,
): ReplayApi {
  const mine = getJudgment(row.id, viewerOsuId)
  return {
    id: row.id,
    createdAt: row.created_at,
    fileName: row.file_name,
    skinName: row.skin_name,
    notes: row.notes,
    beatmapChecksum: row.beatmap_checksum,
    status: row.status,
    manual: row.manual === 1,
    videoUrl: row.video_url,
    videoComment: row.video_comment,
    state: replayStateFromRow(row.status, row.manual, row.video_url),
    ruleset: row.ruleset,
    beatmap: {
      id: row.beatmap_id,
      title: row.beatmap_title,
      artist: row.beatmap_artist,
      creator: row.beatmap_creator,
      version: row.beatmap_version,
      starRating: row.beatmap_star_rating,
      maxCombo: row.beatmap_max_combo,
      url: row.beatmap_url,
      backgroundUrl: row.beatmap_background_url,
      coverListUrl: row.beatmap_cover_list_url,
    },
    score: {
      rank: row.score_rank,
      osuId: row.score_osu_id,
      username: row.score_username,
      date: row.score_date,
      totalScore: row.score_total,
      maxCombo: row.score_max_combo,
      accuracy: row.score_accuracy,
      accuracyv2: row.score_accuracyv2,
      mods: JSON.parse(row.score_mods) as string[],
      isLazer: row.score_is_lazer === 1,
      countGeki: row.score_count_geki,
      countKatu: row.score_count_katu,
      count300: row.score_count_300,
      count100: row.score_count_100,
      count50: row.score_count_50,
      countMiss: row.score_count_miss,
    },
    myJudgment: mine ? { score: mine.score, comment: mine.comment } : null,
    judgmentSummary: getJudgmentSummary(row.id),
    submitter: { osuId: row.osu_id, username: row.submitter_username },
  }
}

export function replayToApiForViewer(
  id: number,
  viewerOsuId: number,
): ReplayApi | null {
  const row = getReplayById(id)
  return row ? replayRowToApi(row, viewerOsuId) : null
}