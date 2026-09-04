"use client"

import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ReplayCard } from "@/components/replay-card"
import { ReplayDownloadButton } from "@/components/replay-download-button"
import { VotingStatsDialog } from "@/components/voting-stats-dialog"
import { IconChartBar, IconLink } from "@tabler/icons-react"
import { replayFromApi, type Replay } from "@/components/app-shell"
import type { ReplayApi } from "@/lib/replay-types"

function AttachDialog({
  replay,
  onAttach,
}: {
  replay: Replay
  onAttach: (
    replay: Replay,
    videoUrl: string,
    videoComment: string | null,
  ) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [comment, setComment] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setUrl(replay.videoUrl ?? "")
      setComment(replay.videoComment ?? "")
      setError(null)
    }
    setOpen(nextOpen)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving || url.trim() === "") {
      return
    }
    const trimmedUrl = url.trim()
    try {
      const parsed = new URL(trimmedUrl)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("Not a valid URL")
        return
      }
    } catch {
      setError("Not a valid URL")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const trimmedComment = comment.trim()
      await onAttach(replay, trimmedUrl, trimmedComment === "" ? null : trimmedComment)
      setOpen(false)
    } catch {
      setError("Could not attach the video.")
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant={replay.videoUrl ? "outline" : "default"} size="sm" />
        }
      >
        <IconLink className="size-3.5" />
        {replay.videoUrl ? "Edit" : "Attach"}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Attach a video</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`video-url-${replay.id}`} className="text-sm font-medium">
                Video URL
              </label>
              <Input
                id={`video-url-${replay.id}`}
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`video-comment-${replay.id}`} className="text-sm font-medium">
                Comment
              </label>
              <Textarea
                id={`video-comment-${replay.id}`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="optional btw"
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            {error && (
              <p className="text-sm text-destructive sm:mr-auto sm:self-center">
                {error}
              </p>
            )}
            <Button type="submit" disabled={url.trim() === "" || saving}>
              {saving ? "Attaching…" : replay.videoUrl ? "Update" : "Attach"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RenderTab() {
  const [replays, setReplays] = useState<Replay[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/replays?scope=render")
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

  const attachVideo = async (
    replay: Replay,
    videoUrl: string,
    videoComment: string | null,
  ) => {
    const res = await fetch(`/replays/${replay.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl, videoComment }),
    })
    if (!res.ok) {
      throw new Error("attach-failed")
    }
    const updated = (await res.json()) as ReplayApi
    setReplays((prev) =>
      prev.map((r) => (r.id === updated.id ? replayFromApi(updated) : r)),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-xl font-semibold">Render</h1>
        <p className="text-sm text-muted-foreground">
          Passed quality control
        </p>
      </header>

      {failed ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Could not load the render pool.
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
            None yet
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
          {replays.map((replay) => (
            <ReplayCard
              key={replay.id}
              replay={replay}
              showManualBadge
              className={replay.videoUrl ? "opacity-60" : undefined}
              actions={
                <>
                  <ReplayDownloadButton replay={replay} />
                  {replay.manual && replay.status === "render" ? (
                    <Button variant="ghost" size="icon-sm" disabled>
                      <IconChartBar />
                    </Button>
                  ) : (
                    <VotingStatsDialog replay={replay} />
                  )}
                  <AttachDialog replay={replay} onAttach={attachVideo} />
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}
