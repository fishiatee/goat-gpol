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
  replayWebhookEnabled: boolean
  replayWebhookUrl: string | null
  replayWebhookMessageFormat: string
}

export const DEFAULT_WEBHOOK_SETTINGS: WebhookSettings = {
  renderWebhookEnabled: false,
  renderWebhookUrl: null,
  renderWebhookMessageFormat: "**New video upload!!**\n$url\n\n*$comment*\n\n@YouTube Video",
  replayWebhookEnabled: false,
  replayWebhookUrl: null,
  replayWebhookMessageFormat:
    "**New replay submission!!**\n\n[$map_artist - $map_name [$map_diff]]($map_url) ($sr\\*)\n- Set by [$player_name]($player_url) <t:$score_date:R>\n- Submitted by [$submitter_name]($submitter_url) <t:$submission_date:R>\n\nDetails:\n- Grade: $grade\n- Mods: $mods\n- Combo: $combo_max / **$combo_map_max** $pfc\n- Accuracy: $acc\n- $count_300 / $count_100 / $count_50 / $count_miss\n\n$comment",
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