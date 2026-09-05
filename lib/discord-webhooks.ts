import { WebhookClient } from "discord.js"

import { DEFAULT_WEBHOOK_SETTINGS } from "@/lib/judging"

const ALLOWED_HOSTS = new Set([
  "discord.com",
  "ptb.discord.com",
  "canary.discord.com",
  "discordapp.com",
  "ptb.discordapp.com",
  "canary.discordapp.com",
])

export function isValidWebhookUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim())
    if (parsed.protocol !== "https:") {
      return false
    }
    if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return false
    }
    return /^\/api\/webhooks\/\d+\/[\w-]+/.test(parsed.pathname)
  } catch {
    return false
  }
}

export function renderWebhookMessage(
  format: string | null | undefined,
  videoUrl: string,
  videoComment: string | null,
): string {
  const template =
    format && format.trim() !== ""
      ? format
      : DEFAULT_WEBHOOK_SETTINGS.renderWebhookMessageFormat
  const comment = (videoComment?.trim() ?? "").slice(0, 1500)
  let lines = template.split("\n")
  if (comment === "") {
    lines = lines.filter((line) => {
      if (!line.includes("$comment")) {
        return true
      }
      const rest = line.split("$comment").join("").trim()
      return rest !== "" && !/^[*_~`]+$/.test(rest)
    })
  }
  const wrappedUrl = `<${videoUrl}>`
  return lines
    .join("\n")
    .split("<$url>")
    .join(wrappedUrl)
    .split("$url")
    .join(wrappedUrl)
    .split("$comment")
    .join(comment)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .slice(0, 2000)
}

async function sendMessage(webhookUrl: string, content: string) {
  const client = new WebhookClient({ url: webhookUrl.trim() })
  try {
    await client.send({ content })
  } finally {
    client.destroy()
  }
}

export type ReplayWebhookData = {
  submitterName: string
  submitterOsuId: number | null
  playerName: string
  playerOsuId: number | null
  scoreDateMs: number
  submissionDateMs: number
  starRating: number
  mods: string[]
  mapName: string
  mapArtist: string
  mapMapper: string
  mapDiff: string
  mapUrl: string
  comment: string | null
  grade: string
  score: number
  ruleset: string
  accuracy: number
  accuracyv2: number
  isLazer: boolean
  comboMax: number
  comboMapMax: number
  count300: number
  count100: number
  count50: number
  countMiss: number
}

const RULESET_LABELS: Record<string, string> = {
  osu: "osu!",
  taiko: "osu!taiko",
  catch: "osu!catch",
  mania: "osu!mania",
}

function profileUrl(osuId: number | null, username: string): string {
  if (osuId !== null && Number.isFinite(osuId)) {
    return `https://osu.ppy.sh/users/${osuId}`
  }
  return `https://osu.ppy.sh/users/${encodeURIComponent(username)}`
}

export function replayWebhookMessage(
  format: string | null | undefined,
  data: ReplayWebhookData,
): string {
  const template =
    format && format.trim() !== ""
      ? format
      : DEFAULT_WEBHOOK_SETTINGS.replayWebhookMessageFormat
  const comment = (data.comment?.trim() ?? "").slice(0, 1500)
  let lines = template.split("\n")
  if (comment === "") {
    lines = lines.filter((line) => {
      if (!line.includes("$comment")) {
        return true
      }
      const rest = line.split("$comment").join("").trim()
      return rest !== "" && !/^[*_~`]+$/.test(rest)
    })
  }
  const replacements: Record<string, string> = {
    $submitter_name: data.submitterName,
    $submitter_url: profileUrl(data.submitterOsuId, data.submitterName),
    $player_name: data.playerName,
    $player_url: profileUrl(data.playerOsuId, data.playerName),
    $score_date: String(Math.round(data.scoreDateMs / 1000)),
    $submission_date: String(Math.round(data.submissionDateMs / 1000)),
    $sr: data.starRating.toFixed(2),
    $mods: data.mods.join("") || "NM",
    $map_name: data.mapName,
    $map_artist: data.mapArtist,
    $map_mapper: data.mapMapper,
    $map_diff: data.mapDiff,
    $map_url: data.mapUrl,
    $comment: comment,
    $grade: data.grade,
    $score: data.score.toLocaleString("en-US"),
    $gamemode: RULESET_LABELS[data.ruleset] ?? data.ruleset,
    $acc: `${((data.isLazer ? data.accuracyv2 : data.accuracy) * 100).toFixed(2)}%`,
    $combo_max: String(data.comboMax),
    $combo_map_max: String(data.comboMapMax),
    $count_300: String(data.count300),
    $count_100: String(data.count100),
    $count_50: String(data.count50),
    $count_miss: String(data.countMiss),
    $pfc: data.comboMax === data.comboMapMax ? "(PFC)" : "",
  }
  const keys = Object.keys(replacements).sort((a, b) => b.length - a.length)
  const urlKeys = new Set(["$submitter_url", "$player_url", "$map_url"])
  let message = lines.join("\n")
  for (const key of keys) {
    const value = urlKeys.has(key) ? `<${replacements[key]}>` : replacements[key]
    message = message.split(`<${key}>`).join(value)
    message = message.split(key).join(value)
  }
  return message
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .slice(0, 2000)
}

export async function sendRenderTestWebhook(webhookUrl: string) {
  await sendMessage(webhookUrl, "Installed goat-gpol render webhook!")
}

export async function sendReplayTestWebhook(webhookUrl: string) {
  await sendMessage(webhookUrl, "Installed goat-gpol replay webhook!")
}

export async function sendRenderUploadedWebhook(
  webhookUrl: string,
  videoUrl: string,
  videoComment: string | null,
  format?: string | null,
) {
  await sendMessage(
    webhookUrl,
    renderWebhookMessage(format, videoUrl, videoComment),
  )
}

export async function sendReplaySubmissionWebhook(
  webhookUrl: string,
  data: ReplayWebhookData,
  format?: string | null,
) {
  await sendMessage(webhookUrl, replayWebhookMessage(format, data))
}
