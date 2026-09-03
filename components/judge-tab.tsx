"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ReplayCard } from "@/components/replay-card"
import { ReplayDownloadButton } from "@/components/replay-download-button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { IconCheck, IconScale } from "@tabler/icons-react"
import { replayFromApi, type Replay } from "@/components/app-shell"
import type { ReplayApi } from "@/lib/replay-types"

function JudgeDialog({
  replay,
  onJudged,
  disabled,
  userOsuId,
}: {
  replay: Replay
  onJudged: (updated: Replay) => void
  disabled: boolean
  userOsuId: number
}) {
  const isOwnScore = replay.score.osuId === userOsuId
  const [score, setScore] = useState(replay.myJudgment?.score ?? 0)
  const [comment, setComment] = useState(replay.myJudgment?.comment ?? "")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (saving) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/replays/${replay.id}/judgment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, comment }),
      })
      if (!res.ok) {
        throw new Error("judge-failed")
      }
      onJudged(replayFromApi((await res.json()) as ReplayApi))
      setOpen(false)
    } catch {
      setError("Could not save the judgment. Please try again.")
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {disabled || isOwnScore ? (
        isOwnScore && !disabled ? (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                variant={replay.myJudgment ? "secondary" : "default"}
                size="sm"
                disabled
                className="pointer-events-none"
              >
                <IconScale />
                {replay.myJudgment ? "Edit vote" : "Vote"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>You cannot vote for your own replay.</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant={replay.myJudgment ? "secondary" : "default"}
            size="sm"
            disabled
          >
            <IconScale />
            {replay.myJudgment ? "Edit vote" : "Vote"}
          </Button>
        )
      ) : (
        <DialogTrigger
          render={
            <Button variant={replay.myJudgment ? "secondary" : "default"} size="sm" />
          }
        >
          <IconScale />
          {replay.myJudgment ? "Edit vote" : "Vote"}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader className="mb-4">
          <DialogTitle>
            {replay.beatmap.artist} - {replay.beatmap.title} [
            {replay.beatmap.version}]
          </DialogTitle>
          <DialogDescription>
            Score set by {replay.score.username} on{" "}
            {replay.score.date.toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Score</span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.01}
                value={score}
                onChange={(e) => {
                  if (e.target.value === "") {
                    return
                  }
                  const raw = Number(e.target.value)
                  if (!Number.isFinite(raw)) {
                    return
                  }
                  setScore(
                    Math.min(5, Math.max(0, Math.round(raw * 100) / 100)),
                  )
                }}
                className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="judge-comment" className="text-sm font-medium">
              Comments
            </label>
            <Textarea
              id="judge-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="better than me"
              className="resize-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={handleSave} disabled={saving} className="px-4">
            {saving ? "Saving…" : "Vote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function JudgeTab({ userOsuId }: { userOsuId: number }) {
  const [replays, setReplays] = useState<Replay[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/replays?scope=judge")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ReplayApi[]) => {
        if (!cancelled) {
          setReplays(data.map(replayFromApi))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleJudged = (updated: Replay) => {
    setReplays((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-xl font-semibold">Judge</h1>
        <p className="text-sm text-muted-foreground">Fresh replays yummy yummy</p>
      </header>

      {failed ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Could not load the replay pool.
          </CardContent>
        </Card>
      ) : !loaded ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      ) : replays.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm font-medium">
            No replays in the pool yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
          {replays.map((replay) => (
            <ReplayCard
              key={replay.id}
              replay={replay}
              showManualBadge
              badges={
                replay.myJudgment ? (
                  <Badge variant="secondary" aria-label="Voted">
                    <IconCheck className="h-3.5 w-3.5" />
                  </Badge>
                ) : undefined
              }
              actions={
                <>
                  <ReplayDownloadButton replay={replay} />
                  <JudgeDialog
                    replay={replay}
                    onJudged={handleJudged}
                    disabled={replay.manual}
                    userOsuId={userOsuId}
                  />
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}