import type { Replay, Skin } from "@/components/app-shell"
import type { ReplayState } from "@/lib/replay-types"

export type FilterKind =
  | "submitted_date"
  | "score_date"
  | "player"
  | "submitter"
  | "game_mode"
  | "status"
  | "is_pfc"

export type GameModeFilter = "osu" | "taiko" | "catch" | "mania"
export type StatusFilter = ReplayState

export const GAME_MODE_OPTIONS: { value: GameModeFilter; label: string }[] = [
  { value: "osu", label: "osu!" },
  { value: "taiko", label: "osu!taiko" },
  { value: "catch", label: "osu!catch" },
  { value: "mania", label: "osu!mania" },
]

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "queued", label: "Queued" },
  { value: "denied", label: "Denied" },
  { value: "uploaded", label: "Uploaded" },
]

export const FILTER_META: Record<
  FilterKind,
  { label: string; description: string; example: string }
> = {
  submitted_date: {
    label: "Date",
    description: "When the replay or skin was submitted",
    example: "submitted_date:>2026-09-01",
  },
  score_date: {
    label: "Score date",
    description: "When the replay's score was set",
    example: "score_date:<30d",
  },
  player: {
    label: "Player",
    description: "Who set the score (name or user ID)",
    example: "player:username",
  },
  submitter: {
    label: "Submitter",
    description: "Who submitted it (name or user ID)",
    example: "submitter:username",
  },
  game_mode: {
    label: "Game mode",
    description: "osu!, osu!taiko, osu!catch, osu!mania",
    example: "game_mode:mania",
  },
  status: {
    label: "Status",
    description: "submitted, queued, denied, uploaded",
    example: "status:uploaded",
  },
  is_pfc: {
    label: "PFC",
    description: "Only perfect full combos",
    example: "is_pfc",
  },
}

export function availableKinds(
  context: "replays" | "skins",
  admin: boolean,
): FilterKind[] {
  if (context === "replays") {
    const kinds: FilterKind[] = [
      "submitted_date",
      "score_date",
      "player",
      "game_mode",
      "status",
      "is_pfc",
    ]
    if (admin) {
      kinds.splice(3, 0, "submitter")
    }
    return kinds
  }
  const kinds: FilterKind[] = ["submitted_date", "game_mode"]
  if (admin) {
    kinds.splice(1, 0, "submitter")
  }
  return kinds
}

export type DateFilter =
  | { mode: "on"; start: number; end: number }
  | { mode: "exact"; at: number }
  | {
      mode: "before" | "after"
      at: number
      inclusive: boolean
      relative?: { amount: number; unit: "d" | "w" | "m" | "y" }
    }

export type ParsedFilter =
  | {
      kind: "submitted_date" | "score_date"
      date: DateFilter
      raw: string
    }
  | { kind: "player" | "submitter"; values: string[]; raw: string }
  | { kind: "game_mode"; values: GameModeFilter[]; raw: string }
  | { kind: "status"; values: StatusFilter[]; raw: string }
  | { kind: "is_pfc"; raw: string }

export interface ParsedSearch {
  text: string
  filters: ParsedFilter[]
}

const DAY_MS = 86_400_000
const RELATIVE_MS: Record<string, number> = {
  d: DAY_MS,
  w: 7 * DAY_MS,
  m: 30 * DAY_MS,
  y: 365 * DAY_MS,
}

export function tokenizeQuery(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: string | null = null
  for (const char of input) {
    if (quote) {
      current += char
      if (char === quote) {
        quote = null
      }
    } else if (char === '"' || char === "'") {
      quote = char
      current += char
    } else if (/\s/.test(char)) {
      if (current !== "") {
        tokens.push(current)
        current = ""
      }
    } else {
      current += char
    }
  }
  if (current !== "") {
    tokens.push(current)
  }
  return tokens
}

function normalizeGameMode(value: string): GameModeFilter | null {
  const v = value.toLowerCase().replace(/^osu!/, "")
  if (v === "osu" || v === "std" || v === "standard") {
    return "osu"
  }
  if (v === "mania" || v === "osumania") {
    return "mania"
  }
  if (v === "taiko" || v === "osutaiko") {
    return "taiko"
  }
  if (v === "catch" || v === "ctb" || v === "osucatch" || v === "fruits") {
    return "catch"
  }
  return null
}

function validDayStart(year: number, month: number, day: number): number | null {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date.getTime()
}

function applyDayOp(op: string, start: number): DateFilter {
  const end = start + DAY_MS
  if (op === ">") {
    return { mode: "after", at: end, inclusive: false }
  }
  if (op === ">=") {
    return { mode: "after", at: start, inclusive: true }
  }
  if (op === "<") {
    return { mode: "before", at: start, inclusive: false }
  }
  if (op === "<=") {
    return { mode: "before", at: end, inclusive: true }
  }
  return { mode: "on", start, end }
}

function applyPreciseOp(op: string, at: number): DateFilter {
  if (op === ">") {
    return { mode: "after", at, inclusive: false }
  }
  if (op === ">=") {
    return { mode: "after", at, inclusive: true }
  }
  if (op === "<") {
    return { mode: "before", at, inclusive: false }
  }
  if (op === "<=") {
    return { mode: "before", at, inclusive: true }
  }
  return { mode: "exact", at }
}

function parseDateValue(body: string): DateFilter | null {
  const match = body.match(/^(>=|<=|>|<|=)?(.+)$/)
  if (!match) {
    return null
  }
  const op = match[1] ?? ""
  const rest = (match[2] ?? "").trim()
  if (rest === "") {
    return null
  }
  const relative = rest.match(/^(\d+)([dDwWmMyY])$/)
  if (relative) {
    const amount = Number(relative[1])
    const unit = relative[2].toLowerCase() as "d" | "w" | "m" | "y"
    const ref = Date.now() - amount * RELATIVE_MS[unit]
    if (op === "<" || op === "<=") {
      return { mode: "before", at: ref, inclusive: false, relative: { amount, unit } }
    }
    return { mode: "after", at: ref, inclusive: true, relative: { amount, unit } }
  }
  if (/^\d{9,13}$/.test(rest)) {
    const at = rest.length >= 12 ? Number(rest) : Number(rest) * 1000
    return applyPreciseOp(op, at)
  }
  const ymd = rest.match(/^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/)
  if (ymd) {
    const start = validDayStart(Number(ymd[1]), Number(ymd[3]), Number(ymd[4]))
    if (start === null) {
      return null
    }
    return applyDayOp(op, start)
  }
  const mdy = rest.match(/^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/)
  if (mdy) {
    const first = Number(mdy[1])
    const second = Number(mdy[3])
    const year = Number(mdy[4])
    const month = first > 12 ? second : first
    const day = first > 12 ? first : second
    const start = validDayStart(year, month, day)
    if (start === null) {
      return null
    }
    return applyDayOp(op, start)
  }
  if (/T/.test(rest) || /\d\s+\d/.test(rest) || /Z$/.test(rest)) {
    const at = Date.parse(rest)
    if (!Number.isFinite(at)) {
      return null
    }
    return applyPreciseOp(op, at)
  }
  return null
}

function stripQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function splitUnquoted(value: string, separator: string): string[] {
  const parts: string[] = []
  let current = ""
  let quote: string | null = null
  for (const char of value) {
    if (quote) {
      current += char
      if (char === quote) {
        quote = null
      }
    } else if (char === '"' || char === "'") {
      quote = char
      current += char
    } else if (char === separator) {
      parts.push(current)
      current = ""
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts
}

export function parseSingleToken(token: string): ParsedFilter | null {
  if (token.toLowerCase() === "is_pfc") {
    return { kind: "is_pfc", raw: token }
  }
  const doubleQuotes = (token.match(/"/g) ?? []).length
  const singleQuotes = (token.match(/'/g) ?? []).length
  if (doubleQuotes % 2 === 1 || singleQuotes % 2 === 1) {
    return null
  }
  const match = token.match(/^([A-Za-z_]+):([\s\S]*)$/)
  if (!match) {
    return null
  }
  const kind = match[1].toLowerCase()
  const rawValue = (match[2] ?? "").trim()
  const value = stripQuotes(rawValue)
  switch (kind) {
    case "submitted_date":
    case "score_date": {
      if (value === "") {
        return null
      }
      const date = parseDateValue(value)
      return date ? { kind, date, raw: token } : null
    }
    case "player":
    case "submitter": {
      const values = splitUnquoted(rawValue, ",").map((part) =>
        stripQuotes(part.trim()),
      )
      if (values.length === 0 || values.some((v) => v === "")) {
        return null
      }
      return { kind, values, raw: token }
    }
    case "game_mode": {
      const values: GameModeFilter[] = []
      for (const part of splitUnquoted(rawValue, ",")) {
        const mode = normalizeGameMode(stripQuotes(part.trim()))
        if (!mode) {
          return null
        }
        values.push(mode)
      }
      if (values.length === 0) {
        return null
      }
      return { kind, values, raw: token }
    }
    case "status": {
      const values: StatusFilter[] = []
      for (const part of splitUnquoted(rawValue, ",")) {
        const status = stripQuotes(part.trim()).toLowerCase() as StatusFilter
        if (!STATUS_OPTIONS.some((o) => o.value === status)) {
          return null
        }
        values.push(status)
      }
      if (values.length === 0) {
        return null
      }
      return { kind, values, raw: token }
    }
    default:
      return null
  }
}

export function parseSearchQuery(input: string): ParsedSearch {
  const filters: ParsedFilter[] = []
  const kept: string[] = []
  for (const token of tokenizeQuery(input)) {
    if (isEmptyFilterToken(token)) {
      continue
    }
    const parsed = parseSingleToken(token)
    if (parsed) {
      filters.push(parsed)
    } else {
      kept.push(token)
    }
  }
  return { text: kept.join(" "), filters }
}

const KNOWN_KINDS: readonly string[] = [
  "submitted_date",
  "score_date",
  "player",
  "submitter",
  "game_mode",
  "status",
  "is_pfc",
]

function isEmptyFilterToken(token: string): boolean {
  const match = token.match(/^([A-Za-z_]+):$/)
  return match !== null && KNOWN_KINDS.includes(match[1].toLowerCase())
}

export function extractFilterTokens(
  text: string,
  available: readonly FilterKind[],
): { text: string; tokens: string[] } {
  const kept: string[] = []
  const tokens: string[] = []
  for (const token of tokenizeQuery(text)) {
    if (isEmptyFilterToken(token)) {
      continue
    }
    const parsed = parseSingleToken(token)
    if (parsed && (available as readonly string[]).includes(parsed.kind)) {
      tokens.push(token)
    } else {
      kept.push(token)
    }
  }
  return { text: kept.join(" "), tokens }
}

export function quoteFilterValue(value: string): string {
  const clean = value.trim().replace(/"/g, "")
  return /[\s':]/.test(clean) ? `"${clean}"` : clean
}

function toTime(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value
}

function matchesDate(valueMs: number, filter: DateFilter): boolean {
  if (filter.mode === "on") {
    return valueMs >= filter.start && valueMs < filter.end
  }
  if (filter.mode === "exact") {
    return valueMs === filter.at
  }
  if (filter.mode === "before") {
    return filter.inclusive ? valueMs <= filter.at : valueMs < filter.at
  }
  return filter.inclusive ? valueMs >= filter.at : valueMs > filter.at
}

function matchesPerson(
  value: string,
  person: { osuId: number | null | undefined; username: string },
): boolean {
  const query = value.toLowerCase()
  if (/^\d+$/.test(value) && person.osuId === Number(value)) {
    return true
  }
  return person.username.toLowerCase().includes(query)
}

export function matchesReplayFilters(
  replay: Replay,
  parsed: ParsedSearch,
): boolean {
  const players: string[] = []
  const submitters: string[] = []
  const modes: GameModeFilter[] = []
  const statuses: StatusFilter[] = []
  for (const filter of parsed.filters) {
    switch (filter.kind) {
      case "submitted_date":
        if (!matchesDate(replay.createdAt, filter.date)) {
          return false
        }
        break
      case "score_date":
        if (!matchesDate(toTime(replay.score.date), filter.date)) {
          return false
        }
        break
      case "is_pfc":
        if (replay.score.maxCombo !== replay.beatmap.maxCombo) {
          return false
        }
        break
      case "player":
        players.push(...filter.values)
        break
      case "submitter":
        submitters.push(...filter.values)
        break
      case "game_mode":
        modes.push(...filter.values)
        break
      case "status":
        statuses.push(...filter.values)
        break
    }
  }
  if (
    players.length > 0 &&
    !players.some((v) =>
      matchesPerson(v, {
        osuId: replay.score.osuId ?? null,
        username: replay.score.username,
      }),
    )
  ) {
    return false
  }
  if (
    submitters.length > 0 &&
    !submitters.some((v) => matchesPerson(v, replay.submitter))
  ) {
    return false
  }
  if (modes.length > 0 && !modes.includes(replay.ruleset as GameModeFilter)) {
    return false
  }
  if (statuses.length > 0 && !statuses.includes(replay.state)) {
    return false
  }
  return true
}

export function matchesSkinFilters(
  skin: Skin,
  parsed: ParsedSearch,
): boolean {
  const submitters: string[] = []
  const modes: GameModeFilter[] = []
  for (const filter of parsed.filters) {
    switch (filter.kind) {
      case "submitted_date":
        if (!matchesDate(skin.createdAt, filter.date)) {
          return false
        }
        break
      case "submitter":
        submitters.push(...filter.values)
        break
      case "game_mode":
        modes.push(...filter.values)
        break
      default:
        break
    }
  }
  if (
    submitters.length > 0 &&
    !submitters.some((v) => matchesPerson(v, skin.submitter))
  ) {
    return false
  }
  if (
    modes.length > 0 &&
    !modes.some((m) => skin.rulesets.includes(m))
  ) {
    return false
  }
  return true
}

export function formatDateShort(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function relativeLabel(
  relative: { amount: number; unit: "d" | "w" | "m" | "y" },
  after: boolean,
): string {
  const names = { d: "day", w: "week", m: "month", y: "year" } as const
  const name = names[relative.unit] + (relative.amount === 1 ? "" : "s")
  return after
    ? `in last ${relative.amount} ${name}`
    : `older than ${relative.amount} ${name}`
}

function describeDate(prefix: string, filter: DateFilter): string {
  if (filter.mode === "on") {
    return `${prefix} on ${formatDateShort(filter.start)}`
  }
  if (filter.mode === "exact") {
    return `${prefix} at ${formatDateTime(filter.at)}`
  }
  if (filter.relative) {
    return `${prefix} ${relativeLabel(filter.relative, filter.mode === "after")}`
  }
  const date = formatDateShort(filter.at)
  if (filter.mode === "before") {
    return filter.inclusive ? `${prefix} on or before ${date}` : `${prefix} before ${date}`
  }
  return filter.inclusive ? `${prefix} on or after ${date}` : `${prefix} after ${date}`
}

export function describeFilter(filter: ParsedFilter): string {
  switch (filter.kind) {
    case "submitted_date":
      return describeDate("Submitted", filter.date)
    case "score_date":
      return describeDate("Score", filter.date)
    case "player":
      return `Player: ${filter.values.join(", ")}`
    case "submitter":
      return `Submitter: ${filter.values.join(", ")}`
    case "game_mode":
      return `Mode: ${filter.values
        .map(
          (v) => GAME_MODE_OPTIONS.find((o) => o.value === v)?.label ?? v,
        )
        .join(", ")}`
    case "status":
      return `Status: ${filter.values
        .map((v) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v)
        .join(", ")}`
    case "is_pfc":
      return "PFC"
  }
}

export function describeToken(token: string): string | null {
  const parsed = parseSingleToken(token)
  return parsed ? describeFilter(parsed) : null
}
