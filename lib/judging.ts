import type { ReplayStatus } from "@/lib/replay-types"

export type JudgeSettings = {
  thresholdScore: number
  thresholdPercent: number
}

export const DEFAULT_JUDGE_SETTINGS: JudgeSettings = {
  thresholdScore: 3,
  thresholdPercent: 50,
}

export type SkinLimits = {
  maxSkinsPerUser: number
  maxSkinSizeMb: number
}

export const DEFAULT_SKIN_LIMITS: SkinLimits = {
  maxSkinsPerUser: 15,
  maxSkinSizeMb: 50,
}

export type WebhookSettings = {
  renderWebhookEnabled: boolean
  renderWebhookUrl: string | null
  renderWebhookMessageFormat: string
}

export const DEFAULT_WEBHOOK_SETTINGS: WebhookSettings = {
  renderWebhookEnabled: false,
  renderWebhookUrl: null,
  renderWebhookMessageFormat: "**New video upload!!**\n$url\n\n*$comment*\n\n@YouTube Video",
}

export type AppSettings = JudgeSettings & SkinLimits & WebhookSettings

export function statusFromJudgments(
  scores: number[],
  eligibleJudges: number,
  settings: JudgeSettings,
): ReplayStatus {
  if (eligibleJudges <= 0) {
    return "pool"
  }
  const good = scores.filter((s) => s > settings.thresholdScore).length
  if (good > (eligibleJudges * settings.thresholdPercent) / 100) {
    return "render"
  }
  return "pool"
}