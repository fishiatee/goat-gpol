"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { IconChartBar } from "@tabler/icons-react"
import type { Replay } from "@/components/app-shell"
import type { JudgmentApi } from "@/lib/replay-types"

export function VotingStatsDialog({ replay }: { replay: Replay }) {
  const [open, setOpen] = useState(false)
  const [judgments, setJudgments] = useState<JudgmentApi[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    fetch(`/replays/${replay.id}/judgment`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("load-failed")
        }
        const data = (await res.json()) as JudgmentApi[]
        if (!cancelled) {
          setJudgments(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, replay.id])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setJudgments(null)
          setFailed(false)
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <IconChartBar />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="mb-4">
          <DialogTitle>Voting stats</DialogTitle>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-muted-foreground">
            Could not load the votes.
          </p>
        ) : judgments === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : judgments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No votes yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Average Score
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {(
                  judgments.reduce((sum, judgment) => sum + judgment.score, 0) /
                  judgments.length
                ).toFixed(2)}
              </span>
            </div>
            <ul className="flex flex-col divide-y overflow-hidden rounded-md border">
              {judgments.map((judgment) => (
                <li key={judgment.id} className="flex flex-col gap-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar size="sm">
                        <AvatarImage
                          src={judgment.judgeAvatarUrl}
                          alt={`${judgment.judgeUsername} avatar`}
                        />
                        <AvatarFallback>
                          {judgment.judgeUsername.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm font-medium">
                        {judgment.judgeUsername}
                      </span>
                    </span>
                    <span className="text-sm font-medium tabular-nums">
                      {judgment.score.toFixed(2)}
                    </span>
                  </div>
                  {judgment.comment && (
                    <p className="text-sm text-muted-foreground">
                      {judgment.comment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}