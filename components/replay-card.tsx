"use client"

import Image from "next/image"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { IconFile, IconTool } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import type { SkinRuleset } from "@/lib/skin-upload"
import { RULESET_META } from "@/components/ruleset-icons"
import type { Replay, ScoreStats } from "@/components/app-shell"

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-md bg-muted/50 px-2.5 py-2",
        className
      )}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-nowrap text-sm font-medium">{value}</dd>
    </div>
  )
}

export function ScoreStatsPanel({
  score,
  beatmapMaxCombo,
  ruleset,
}: {
  score: ScoreStats
  beatmapMaxCombo: number
  ruleset?: SkinRuleset
}) {
  return (
    <dl className="flex w-full flex-col gap-2">
      <div className="flex gap-2">
        <Stat label="Grade" value={score.rank} className="flex-1" />
        <Stat
          label="Score"
          value={score.totalScore.toLocaleString()}
          className="flex-1"
        />
        <Stat
          label="Accuracy"
          value={`${score.isLazer ? (score.accuracyv2 * 100).toFixed(2) : (score.accuracy * 100).toFixed(2)}%`}
          className="flex-1"
        />
        <Stat
          label="Combo"
          value={`${score.maxCombo} / ${beatmapMaxCombo}`}
          className="flex-1"
        />
        <Stat
          label="Mods"
          value={score.mods.join("") || "NM"}
          className="flex-1"
        />
      </div>
      <div className="flex divide-x overflow-hidden rounded-md border bg-muted/50">
        {(ruleset === "osu"
          ? [
              { label: "300", value: score.count300 },
              { label: "100", value: score.count100 },
              { label: "50", value: score.count50 },
              { label: "Miss", value: score.countMiss },
            ] as const
          : ruleset === "taiko" 
          ? [
              { label: "300", value: score.count300 }, 
              { label: "100", value: score.count100 },
              { label: "Miss", value: score.countMiss },
            ] as const
          : ruleset === "catch" 
          ? [
              { label: "300", value: score.count300 },
              { label: "100", value: score.count100} , // blame peppy
              { label: "50", value: `${score.count50} / ${score.countKatu}`},
              { label: "Miss", value: score.countMiss}, // blame peppy
            ] as const
          : [
              { label: "MAX", value: score.countGeki },
              { label: "300", value: score.count300 },
              { label: "200", value: score.countKatu },
              { label: "100", value: score.count100 },
              { label: "50", value: score.count50 },
              { label: "Miss", value: score.countMiss },
            ] as const
        ).map((s) => (
          <div
            key={s.label}
            className="flex flex-1 flex-col items-center gap-0.5 px-2 py-2"
          >
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="whitespace-nowrap text-sm font-medium">{s.value}</dd>
          </div>
        ))}
      </div>
    </dl>
  )
}

export function ReplayCard({
  replay,
  actions,
  badges,
  as = "li",
  showSubmitter = false,
  clip = false,
}: {
  replay: Replay
  actions?: ReactNode
  badges?: ReactNode
  as?: "li" | "div"
  showSubmitter?: boolean
  clip?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          as === "div" ? (
            <div className="flex items-stretch" />
          ) : (
            <li className="flex items-stretch" />
          )
        }
      >
        <div className="relative w-28 shrink-0 bg-muted/50">
          {replay.beatmap.coverListUrl ? (
            <Image
              src={replay.beatmap.coverListUrl}
              alt={`${replay.beatmap.artist} - ${replay.beatmap.title} cover`}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <IconFile className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3">
          <div className="flex items-center gap-2">
            <a
              href={replay.beatmap.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "min-w-0 truncate text-sm font-medium hover:underline underline-offset-2",
                clip && "max-w-[80%]",
              )}
            >
              {replay.beatmap.artist} - {replay.beatmap.title} [
              {replay.beatmap.version}]
            </a>
            <Badge variant="outline">
              {replay.beatmap.starRating.toFixed(2)}★
            </Badge>
            {replay.score.maxCombo === replay.beatmap.maxCombo && (
              <Badge variant="secondary">PFC</Badge>
            )}
            {replay.manual && (
              <Tooltip>
                <TooltipTrigger
                  render={<Badge variant="secondary" aria-label="Manual" />}
                >
                  <IconTool className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {replay.status === "pool"
                    ? "This replay was manually demoted and can no longer be accepted for rendering."
                    : "This replay was manually promoted."}
                </TooltipContent>
              </Tooltip>
            )}
            {badges}
          </div>
          <p className="text-xs text-muted-foreground">
            Score set by{" "}
            <a
              href={`https://osu.ppy.sh/users/${encodeURIComponent(
                replay.score.username,
              )}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground hover:underline underline-offset-2"
            >
              {replay.score.username}
            </a>{" "}
            on {replay.score.date.toLocaleDateString()}
          </p>
          <p className="text-xs text-muted-foreground">
            {showSubmitter ? (
              <>
                Submitted by{" "}
                <a
                  href={`https://osu.ppy.sh/users/${replay.submitter.osuId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground hover:underline underline-offset-2"
                >
                  {replay.submitter.username}
                </a>{" "}
                on{" "}
              </>
            ) : (
              "Submitted on "
            )}
            {new Date(replay.createdAt).toLocaleDateString()}
          </p>
          {replay.notes !== "" && (
            <p className="text-sm text-muted-foreground">{replay.notes}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 px-4">{actions}</div>
        )}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        hideArrow
        className="w-fit max-w-none items-stretch gap-3 rounded-xl border bg-card px-4 py-3 text-foreground shadow-lg"
      >
        <div className="flex flex-col gap-2">
          <ScoreStatsPanel
            score={replay.score}
            beatmapMaxCombo={replay.beatmap.maxCombo}
            ruleset={replay.ruleset as SkinRuleset}
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            {(() => {
              const meta = RULESET_META[replay.ruleset as SkinRuleset]
              return meta ? (
                <span className="flex items-center gap-1.5 font-medium">
                  <meta.icon className="size-3.5" />
                  {meta.label}
                </span>
              ) : (
                <span />
              )
            })()}
            {replay.skinName && (
              <span className="text-muted-foreground">
                Skin:{" "}
                <span className="font-medium text-foreground">
                  {replay.skinName}
                </span>
              </span>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}