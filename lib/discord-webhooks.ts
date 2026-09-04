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
    // Drop lines that only held the $comment placeholder (plus markdown
    // markers), so no stray empty `**` line is sent when there's no comment.
    lines = lines.filter((line) => {
      if (!line.includes("$comment")) {
        return true
      }
      const rest = line.split("$comment").join("").trim()
      return rest !== "" && !/^[*_~`]+$/.test(rest)
    })
  }
  // split/join avoids `$`-pattern pitfalls of String.replace with user content.
  return lines
    .join("\n")
    .split("$url")
    .join(videoUrl)
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

export async function sendRenderTestWebhook(webhookUrl: string) {
  await sendMessage(webhookUrl, "Installed goat-gpol render webhook!")
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
