"use client"

import { useEffect, useState } from "react"

import { JudgeTab } from "@/components/judge-tab"
import { ManageTab } from "@/components/manage-tab"
import { RenderTab } from "@/components/render-tab"
import { ReplaysTab } from "@/components/replays-tab"
import { SiteNav } from "@/components/site-nav"
import { SkinsTab } from "@/components/skins-tab"
import { canAdmin, canJudge } from "@/lib/roles"
import type { SkinLimits } from "@/lib/judging"
import {
  uploadSkin,
  type SkinRuleset,
  type UploadProgress,
} from "@/lib/skin-upload"
import { cn } from "@/lib/utils"
import type { ReplayApi, ReplayStatus, Role, SkinApi } from "@/lib/replay-types"

export type Tab = "replays" | "skins" | "judge" | "render" | "manage"

export type SessionUser = {
  osuId: number
  username: string
  avatarUrl: string
  countryCode: string
  role: Role
  bannedAt: number | null
}

export type Skin = {
  id: number
  name: string
  rulesets: string[]
  scrollSpeed: number | null
  createdAt: number
  submitter: { osuId: number; username: string }
}

export type BeatmapInfo = {
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

export type ScoreStats = {
  rank: string
  osuId?: number | null
  username: string
  date: Date
  totalScore: number
  maxCombo: number
  accuracy: number
  accuracyv2: number
  mods: string[]
  countGeki: number
  countKatu: number
  count300: number
  count100: number
  count50: number
  countMiss: number
  isLazer: boolean
}

export type ReplayInput = {
  fileName: string
  skinName: string | null
  notes: string
  beatmapChecksum: string
  beatmap: BeatmapInfo
  score: ScoreStats
  ruleset: SkinRuleset
}

export type Replay = ReplayInput & {
  id: number
  createdAt: number
  submitter: { osuId: number; username: string }
  status: ReplayStatus
  manual: boolean
  myJudgment: { score: number; comment: string } | null
  judgmentSummary: { count: number; average: number | null }
}

export function replayFromApi(api: ReplayApi): Replay {
  return {
    id: api.id,
    createdAt: api.createdAt,
    fileName: api.fileName,
    skinName: api.skinName,
    notes: api.notes,
    beatmapChecksum: api.beatmapChecksum,
    beatmap: api.beatmap,
    score: { ...api.score, date: new Date(api.score.date) },
    status: api.status,
    manual: api.manual,
    myJudgment: api.myJudgment,
    judgmentSummary: api.judgmentSummary,
    submitter: api.submitter,
    ruleset: api.ruleset as SkinRuleset,
  }
}

export function AppShell({
  user,
  initialReplays,
  initialSkins,
  skinLimits,
}: {
  user: SessionUser
  initialReplays: ReplayApi[]
  initialSkins: SkinApi[]
  skinLimits: SkinLimits
}) {
  const [tab, setTab] = useState<Tab>("replays")
  const [replays, setReplays] = useState<Replay[]>(() =>
    initialReplays.map(replayFromApi),
  )
  const [skins, setSkins] = useState<Skin[]>(() =>
    initialSkins.map((skin) => ({ ...skin })),
  )
  const [limits, setLimits] = useState<SkinLimits>(skinLimits)

  useEffect(() => {
    let cancelled = false
    fetch("/settings/limits")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setLimits(data as SkinLimits)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tab])

  const addSkin = async (
    name: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    rulesets: SkinRuleset[] = [],
    scrollSpeed?: number,
  ) => {
    const created = await uploadSkin({
      name,
      file,
      rulesets,
      scrollSpeed,
      onProgress,
    })
    setSkins((prev) => [created, ...prev])
  }

  const addReplay = async (input: ReplayInput, file: File) => {
    const form = new FormData()
    form.append("file", file)
    form.append(
      "metadata",
      JSON.stringify({
        fileName: input.fileName,
        skinName: input.skinName,
        notes: input.notes,
        ruleset: input.ruleset,
        beatmapChecksum: input.beatmapChecksum,
        beatmap: input.beatmap,
        score: { ...input.score, date: input.score.date.getTime() },
      }),
    )
    const res = await fetch("/replays", { method: "POST", body: form })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string
      } | null
      throw new Error(
        body?.error === "replay-already-submitted"
          ? "duplicate-own"
          : body?.error === "replay-submitted-by-other"
            ? "duplicate-other"
            : "submit-failed",
      )
    }
    const created = (await res.json()) as ReplayApi
    setReplays((prev) => [replayFromApi(created), ...prev])
  }

  const canSubmit = user.bannedAt === null

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav tab={tab} onTabChange={setTab} user={user} />
      <main
        className={cn(
          "mx-auto w-full flex-1 px-4 py-8",
          tab === "manage" ? "max-w-5xl" : "max-w-3xl",
        )}
      >
        {tab === "replays" && (
          <ReplaysTab
            replays={replays}
            skins={skins}
            onSubmit={addReplay}
            canSubmit={canSubmit}
          />
        )}
        {tab === "skins" && (
          <SkinsTab
            skins={skins}
            onUpload={addSkin}
            canSubmit={canSubmit}
            skinLimits={limits}
          />
        )}
        {tab === "judge" && canJudge(user.role) && (
          <JudgeTab userOsuId={user.osuId} />
        )}
        {tab === "render" && canJudge(user.role) && <RenderTab />}
        {tab === "manage" && canAdmin(user.role) && <ManageTab user={user} />}
      </main>
    </div>
  )
}