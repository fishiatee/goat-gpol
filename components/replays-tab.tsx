"use client"

import Image from "next/image"
import { useState, type FormEvent } from "react"

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FilePicker } from "@/components/file-picker"
import { HeaderSearch } from "@/components/header-search"
import { ReplayCard, ScoreStatsPanel } from "@/components/replay-card"
import {
  Select,
  SelectItem,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  IconExternalLink,
  IconFile,
  IconLink,
  IconMessageCircle,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react"
import { decodeReplayFile, type DecodedScore } from "@/lib/replay-decode"
import type { SkinRuleset } from "@/lib/skin-upload"
import { cn } from "@/lib/utils"
import { RULESET_META } from "@/components/ruleset-icons"
import type {
  BeatmapInfo,
  Replay,
  ReplayInput,
  Skin,
} from "@/components/app-shell"

const DEFAULT_SKIN_ID = "default"

type ConfirmData = {
  file: File
  fileName: string
  beatmapChecksum: string
  beatmap: BeatmapInfo
  score: DecodedScore
  skinName: string | null
  notes: string
}

function ReplaySubmitForm({
  skins,
  onSubmit,
}: {
  skins: Skin[]
  onSubmit: (input: ReplayInput, file: File) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [ruleset, setRuleset] = useState<SkinRuleset | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [skinId, setSkinId] = useState(DEFAULT_SKIN_ID)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmData | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleFileChange = async (picked: File | null) => {
    setFile(picked)
    setRuleset(null)
    setSkinId(DEFAULT_SKIN_ID)
    if (!picked) {
      return
    }
    setDetecting(true)
    try {
      const score = await decodeReplayFile(picked)
      setRuleset(score.ruleset)
    } catch {
      setRuleset(null)
    } finally {
      setDetecting(false)
    }
  }

  const compatibleSkins = ruleset
    ? skins.filter((skin) => skin.rulesets.includes(ruleset))
    : []

  const rulesetMeta = ruleset ? RULESET_META[ruleset] : null

  const selectedSkinName =
    skinId === DEFAULT_SKIN_ID
      ? "Default"
      : compatibleSkins.find((skin) => String(skin.id) === skinId)?.name

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const score = await decodeReplayFile(file)
      const modsParam = score.mods.length
        ? `&mods=${encodeURIComponent(score.mods.join(","))}`
        : ""
      const res = await fetch(
        `/beatmap/lookup?checksum=${encodeURIComponent(score.beatmapHash)}${modsParam}`,
      )
      if (!res.ok) {
        throw new Error("beatmap-lookup-failed")
      }
      const beatmap = (await res.json()) as BeatmapInfo
      setConfirm({
        file,
        fileName: file.name,
        beatmapChecksum: score.beatmapHash,
        beatmap,
        score,
        skinName:
          skinId === DEFAULT_SKIN_ID
            ? null
            : skins.find((s) => s.id === Number(skinId))?.name ?? null,
        notes: notes.trim(),
      })
    } catch (err) {
      setError(
        err instanceof Error && err.message === "beatmap-lookup-failed"
          ? "Could not find the beatmap for this replay. It may have been deleted or the replay is too old."
          : "That file could not be decoded as an osu! replay.",
      )
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmSubmit = async () => {
    if (!confirm || submitting) {
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit(
        {
          fileName: confirm.fileName,
          skinName: confirm.skinName,
          notes: confirm.notes,
          beatmapChecksum: confirm.beatmapChecksum,
          beatmap: confirm.beatmap,
          score: confirm.score,
          ruleset: confirm.score.ruleset,
        },
        confirm.file,
      )
    } catch (err) {
      setSubmitError(
        err instanceof Error && err.message === "duplicate-own"
          ? "You cannot submit a replay twice."
          : err instanceof Error && err.message === "duplicate-other"
            ? "This replay has already been submitted by another user."
            : "Could not submit the replay. Please try again.",
      )
      setSubmitting(false)
    }
  }

  if (confirm) {
    const { beatmap, score, skinName, notes: confirmNotes } = confirm
    return (
      <div className="flex flex-col gap-5">
        <div className="relative -mx-6 -mt-8 h-40 w-[calc(100%+3rem)] overflow-hidden rounded-t-xl">
          <Image
            src={beatmap.backgroundUrl}
            alt={`${beatmap.artist} - ${beatmap.title} background`}
            fill
            unoptimized
            className="object-cover"
          />
        </div>
        <DialogHeader>
          <DialogDescription className="text-xs">
            Mapped by {beatmap.creator}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg">
              {beatmap.artist} - {beatmap.title} [{beatmap.version}]
            </DialogTitle>
            <Badge variant="secondary">
              {beatmap.starRating.toFixed(2)}★
            </Badge>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    render={
                      <a
                        href={beatmap.url}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  />
                }
              >
                <IconExternalLink />
                <span className="sr-only">View beatmap</span>
              </TooltipTrigger>
              <TooltipContent>View beatmap</TooltipContent>
            </Tooltip>
          </div>
          <DialogDescription>
            Score set by {score.username} on {score.date.toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <ScoreStatsPanel
            score={score}
            beatmapMaxCombo={beatmap.maxCombo}
            ruleset={score.ruleset}
          />
          {(skinName || confirmNotes !== "") && (
            <div className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm">
              {skinName && (
                <p className="text-muted-foreground">
                  Skin: <span className="font-medium text-foreground">{skinName}</span>
                </p>
              )}
              {confirmNotes !== "" && (
                <p className="text-muted-foreground">{confirmNotes}</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          {submitError && (
            <p className="text-sm text-destructive sm:mr-auto sm:self-center">
              {submitError}
            </p>
          )}
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Back
          </Button>
          <Button onClick={handleConfirmSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit replay"}
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Submit a replay</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Replay file</span>
          <FilePicker
            accept=".osr"
            label="Choose a .osr replay"
            hint="or drag and drop it here"
            fileName={file?.name ?? null}
            onFileChange={handleFileChange}
          />
          {file && detecting && (
            <p className="text-xs text-muted-foreground">
              Detecting ruleset…
            </p>
          )}
          {file && !detecting && rulesetMeta && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <rulesetMeta.icon className="size-3.5" />
              {rulesetMeta.label}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="replay-skin" className="text-sm font-medium">
            Skin
          </label>
          <Select
            value={skinId}
            onValueChange={(value) => setSkinId(value ?? "")}
            disabled={!ruleset || compatibleSkins.length === 0}
          >
            <SelectTrigger id="replay-skin">
              <SelectValue
                placeholder={
                  !ruleset
                    ? "Pick a replay first"
                    : compatibleSkins.length === 0
                      ? "No skins for this ruleset"
                      : "Select a skin"
                }
              >
                {selectedSkinName}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value={DEFAULT_SKIN_ID}>
                <SelectItemText>Default</SelectItemText>
              </SelectItem>
              {compatibleSkins.map((skin) => (
                <SelectItem key={skin.id} value={String(skin.id)}>
                  <SelectItemText>{skin.name}</SelectItemText>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="replay-notes" className="text-sm font-medium">
            Comments
          </label>
          <Textarea
            id="replay-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="goated score frfr"
          />
        </div>
        {busy && (
          <p className="text-sm text-muted-foreground">Decoding replay…</p>
        )}
      </div>
      <DialogFooter>
        {error && (
          <p className="text-sm text-destructive sm:mr-auto sm:self-center">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!file || busy}>
          Next
        </Button>
      </DialogFooter>
    </form>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <IconFile className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No replays yet</p>
      </CardContent>
    </Card>
  )
}

function VideoCommentDialog({ comment }: { comment: string }) {
  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="View comment" />
              }
            />
          }
        >
          <IconMessageCircle />
        </TooltipTrigger>
        <TooltipContent>View comment</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader className="mb-4">
          <DialogTitle>Comment</DialogTitle>
        </DialogHeader>
        <div className="max-h-48 overflow-y-auto">
          <p className="text-sm whitespace-pre-wrap">{comment}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ReplaySubtab = "submissions" | "uploaded"

const REPLAY_SUBTABS: { id: ReplaySubtab; label: string }[] = [
  { id: "submissions", label: "Pending" },
  { id: "uploaded", label: "Uploaded" },
]

export function ReplaysTab({
  replays,
  skins,
  onSubmit,
  canSubmit,
}: {
  replays: Replay[]
  skins: Skin[]
  onSubmit: (input: ReplayInput, file: File) => Promise<void>
  canSubmit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [subtab, setSubtab] = useState<ReplaySubtab>("submissions")

  const tabbedReplays = replays.filter((replay) =>
    subtab === "uploaded"
      ? replay.state === "uploaded"
      : replay.state !== "uploaded",
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredReplays =
    normalizedQuery === ""
      ? tabbedReplays
      : tabbedReplays.filter((replay) =>
          [
            replay.fileName,
            replay.notes,
            replay.skinName,
            replay.beatmap.title,
            replay.beatmap.artist,
            replay.beatmap.creator,
            replay.beatmap.version,
            replay.score.username,
          ].some((value) => value?.toLowerCase().includes(normalizedQuery)),
        )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading text-xl font-semibold">Replays</h1>
          <p className="text-sm text-muted-foreground">
            Replays you have submitted will show here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HeaderSearch onChange={setQuery} />
          {canSubmit ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button />}>
                <IconUpload />
                Submit
              </DialogTrigger>
              <DialogContent className="w-fit min-w-[min(24rem,calc(100%-2rem))] max-w-[min(42rem,calc(100%-2rem))] py-8">
                <ReplaySubmitForm
                  skins={skins}
                  onSubmit={async (input, file) => {
                    await onSubmit(input, file)
                    setOpen(false)
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are banned from submitting new replays.
            </p>
          )}
        </div>
      </header>

      <div
        className="mx-auto flex w-fit gap-0.5 rounded-lg bg-muted p-0.5"
        role="tablist"
        aria-label="Replay lists"
      >
        {REPLAY_SUBTABS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={subtab === s.id}
            onClick={() => setSubtab(s.id)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              subtab === s.id
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {replays.length === 0 ? (
        <EmptyState />
      ) : filteredReplays.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            {subtab === "uploaded" && normalizedQuery === "" ? (
              <>
                <IconLink className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  No uploaded replays yet.
                </p>
              </>
            ) : (
              <>
                <IconSearch className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  No replays match your search
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
          {filteredReplays.map((replay) =>
            subtab === "uploaded" && replay.videoUrl ? (
              <ReplayCard
                key={replay.id}
                replay={replay}
                clip
                actions={
                  <>
                    {replay.videoComment ? (
                      <VideoCommentDialog comment={replay.videoComment} />
                    ) : null}
                    <Button
                      variant="default"
                      size="sm"
                      render={
                        <a
                          href={replay.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      <IconExternalLink className="size-3.5" />
                      Watch
                    </Button>
                  </>
                }
              />
            ) : (
              <ReplayCard
                key={replay.id}
                replay={replay}
                clip
                showState
              />
            ),
          )}
        </ul>
      )}
    </div>
  )
}