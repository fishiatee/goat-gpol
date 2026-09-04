"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

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
import { Input } from "@/components/ui/input"
import { HeaderSearch } from "@/components/header-search"
import {
  matchesReplayFilters,
  matchesSkinFilters,
  parseSearchQuery,
} from "@/lib/search-filters"
import { Slider } from "@/components/ui/slider"
import { ReplayCard } from "@/components/replay-card"
import { RulesetIcon } from "@/components/ruleset-icons"
import {
  Select,
  SelectItem,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { VotingStatsDialog } from "@/components/voting-stats-dialog"
import {
  IconDeviceFloppy,
  IconDownload,
  IconFileMusic,
  IconInfoCircle,
  IconPalette,
  IconSettings,
  IconTrash,
  IconUserCheck,
  IconUserOff,
  IconUsers,
  IconWebhook,
} from "@tabler/icons-react"
import type { Icon } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { isManager } from "@/lib/roles"
import {
  replayFromApi,
  type SessionUser,
  type Replay,
  type Skin,
} from "@/components/app-shell"
import type { ReplayApi } from "@/lib/replay-types"
import {
  DEFAULT_SKIN_LIMITS,
  DEFAULT_WEBHOOK_SETTINGS,
  type AppSettings,
  type JudgeSettings,
  type SkinLimits,
} from "@/lib/judging"
import type { SkinRuleset } from "@/lib/skin-upload"

type ManageUser = {
  osuId: number
  username: string
  avatarUrl: string
  role: "basic" | "judge" | "admin" | "manager"
  bannedAt: number | null
}

type ManageSection = "thresholds" | "users" | "replays" | "skins" | "webhooks"

const MANAGE_SECTIONS: { id: ManageSection; label: string; icon: Icon }[] = [
  { id: "thresholds", label: "Thresholds", icon: IconSettings },
  { id: "users", label: "Users", icon: IconUsers },
  { id: "replays", label: "Replays", icon: IconFileMusic },
  { id: "skins", label: "Skins", icon: IconPalette },
  { id: "webhooks", label: "Webhooks", icon: IconWebhook },
]

function RoleSelect({
  user,
  actor,
  onChange,
}: {
  user: ManageUser
  actor: SessionUser
  onChange: (role: string) => void
}) {
  const isManagerTarget = user.role === "manager"
  const canChangeAdmin = isManager(actor.role)
  const isSelf = user.osuId === actor.osuId
  const disabled =
    isSelf || isManagerTarget || (user.role === "admin" && !canChangeAdmin)

  if (isManagerTarget) {
    return <span className="text-xs font-medium">manager</span>
  }
  return (
    <Select
      value={user.role}
      disabled={disabled}
      onValueChange={(value) => onChange(value ?? "")}
    >
      <SelectTrigger className="h-8 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        <SelectItem value="basic">
          <SelectItemText>basic</SelectItemText>
        </SelectItem>
        <SelectItem value="judge">
          <SelectItemText>judge</SelectItemText>
        </SelectItem>
        {canChangeAdmin && (
          <SelectItem value="admin">
            <SelectItemText>admin</SelectItemText>
          </SelectItem>
        )}
      </SelectPopup>
    </Select>
  )
}

function ThresholdsPanel({
  settings,
  scoreDraft,
  percentDraft,
  onScoreChange,
  onPercentChange,
  onSave,
  saving,
  error,
}: {
  settings: JudgeSettings | null
  scoreDraft: string
  percentDraft: string
  onScoreChange: (value: string) => void
  onPercentChange: (value: string) => void
  onSave: () => void
  saving: boolean
  error: string | null
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">Judging thresholds</h2>
      <div className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">
          A replay moves to the Render pool when{" "}
          <span className="font-medium text-foreground">
            more than {settings?.thresholdPercent ?? 50}%
          </span>{" "}
          of all judges (users with Judge, Admin or Manager level) score it above{" "}
          <span className="font-medium text-foreground">
            {settings?.thresholdScore ?? 3}
          </span>
          .
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="threshold-score" className="text-sm font-medium">
              Vote must be above
            </label>
            <Input
              id="threshold-score"
              type="number"
              min={0}
              max={4}
              value={scoreDraft}
              onChange={(e) => onScoreChange(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="threshold-percent" className="text-sm font-medium">
              Percent of judges
            </label>
            <Input
              id="threshold-percent"
              type="number"
              min={1}
              max={100}
              value={percentDraft}
              onChange={(e) => onPercentChange(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save thresholds"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </section>
  )
}

function UsersPanel({
  users,
  actor,
  onChangeRole,
  onToggleBan,
}: {
  users: ManageUser[]
  actor: SessionUser
  onChangeRole: (user: ManageUser, role: string) => void
  onToggleBan: (user: ManageUser) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">Users</h2>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
        {users.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No users yet.</p>
        ) : (
          users.map((u) => (
            <div
              key={u.osuId}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{u.username}</span>
                {u.bannedAt !== null && (
                  <Badge variant="destructive">banned</Badge>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <RoleSelect
                  user={u}
                  actor={actor}
                  onChange={(role) => onChangeRole(u, role)}
                />
                {u.role !== "manager" && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={
                            u.osuId === actor.osuId ||
                            (u.role === "admin" && !isManager(actor.role))
                          }
                          onClick={() => onToggleBan(u)}
                        />
                      }
                    >
                      {u.bannedAt === null ? <IconUserOff /> : <IconUserCheck />}
                    </TooltipTrigger>
                    <TooltipContent>
                      {u.bannedAt === null ? "Ban" : "Unban"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function RemoveReplayDialog({
  replay,
  onRemove,
}: {
  replay: Replay
  onRemove: (replay: Replay) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async () => {
    if (removing) {
      return
    }
    setRemoving(true)
    setError(null)
    try {
      await onRemove(replay)
      setOpen(false)
    } catch {
      setError("Could not remove the replay.")
      setRemoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="destructive"
            size="icon-sm"
            aria-label="Remove replay"
          />
        }
      >
        <IconTrash />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove replay</DialogTitle>
          <DialogDescription>
            {replay.beatmap.artist} - {replay.beatmap.title} [
            {replay.beatmap.version}]
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Remove this replay and its file permanently? This cannot be undone.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-4">
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReplaysPanel({
  replays,
  onChangeStatus,
  onRemove,
}: {
  replays: Replay[]
  onChangeStatus: (replay: Replay, status: "pool" | "render") => void
  onRemove: (replay: Replay) => Promise<void>
}) {
  const [query, setQuery] = useState("")

  const parsedQuery = parseSearchQuery(query)
  const normalizedText = parsedQuery.text.trim().toLowerCase()
  const filteredReplays = replays.filter((replay) => {
    if (!matchesReplayFilters(replay, parsedQuery)) {
      return false
    }
    if (normalizedText === "") {
      return true
    }
    return [
      replay.fileName,
      replay.notes,
      replay.skinName,
      replay.beatmap.title,
      replay.beatmap.artist,
      replay.beatmap.creator,
      replay.beatmap.version,
      replay.score.username,
      replay.submitter.username,
    ].some((value) => value?.toLowerCase().includes(normalizedText))
  })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">Replays</h2>
        <HeaderSearch onChange={setQuery} context="replays" admin />
      </div>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
        {replays.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No replays submitted yet.
          </p>
        ) : filteredReplays.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No replays match your search.
          </p>
        ) : (
          filteredReplays.map((replay) => (
              <ReplayCard
                key={replay.id}
                as="div"
                replay={replay}
                showManualBadge
                showSubmitter
              actions={
                <>
                  {replay.state !== "uploaded" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onChangeStatus(
                          replay,
                          replay.status === "render" ? "pool" : "render",
                        )
                      }
                    >
                      {replay.status === "render" ? "Demote" : "Promote"}
                    </Button>
                  )}
                  <VotingStatsDialog replay={replay} />
                  <RemoveReplayDialog replay={replay} onRemove={onRemove} />
                </>
              }
            />
          ))
        )}
      </div>
    </section>
  )
}

function RemoveSkinDialog({
  skin,
  onRemove,
}: {
  skin: Skin
  onRemove: (skin: Skin) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async () => {
    if (removing) {
      return
    }
    setRemoving(true)
    setError(null)
    try {
      await onRemove(skin)
      setOpen(false)
    } catch {
      setError("Could not remove the skin.")
      setRemoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="destructive"
            size="icon-sm"
            aria-label="Remove skin"
          />
        }
      >
        <IconTrash />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove skin</DialogTitle>
          <DialogDescription>{skin.name}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Remove this skin and its file permanently? This cannot be undone.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-4">
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MAX_SKINS_SLIDER = 100
const MAX_SIZE_SLIDER = 500

function SkinLimitsSection({
  limits,
  onSave,
}: {
  limits: AppSettings | null
  onSave: (limits: Partial<SkinLimits>) => Promise<void>
}) {
  const [skinsDraft, setSkinsDraft] = useState(() =>
    String(limits?.maxSkinsPerUser ?? DEFAULT_SKIN_LIMITS.maxSkinsPerUser),
  )
  const [sizeDraft, setSizeDraft] = useState(() =>
    String(limits?.maxSkinSizeMb ?? DEFAULT_SKIN_LIMITS.maxSkinSizeMb),
  )
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    const maxSkins = Number(skinsDraft)
    const maxSize = Number(sizeDraft)
    const body: Partial<SkinLimits> = {}
    if (Number.isInteger(maxSkins)) {
      body.maxSkinsPerUser = maxSkins
    }
    if (Number.isInteger(maxSize)) {
      body.maxSkinSizeMb = maxSize
    }
    if (Object.keys(body).length === 0) {
      return
    }
    const timer = setTimeout(() => {
      setError(null)
      onSave(body).catch(() => {
        setError("Could not save the limits.")
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [skinsDraft, sizeDraft, onSave])

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max)
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-heading text-base font-semibold">Limits</h3>
      <div className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="limit-max-skins" className="text-sm font-medium">
              Maximum skins allowed per player
            </label>
            <Input
              id="limit-max-skins"
              type="number"
              min={0}
              value={skinsDraft}
              onChange={(e) => setSkinsDraft(e.target.value)}
              className="h-8 w-20 text-right tabular-nums"
            />
          </div>
          <Slider
            value={clamp(Number(skinsDraft) || 0, 0, MAX_SKINS_SLIDER)}
            onValueChange={(value) =>
              setSkinsDraft(String(Array.isArray(value) ? value[0] : value))
            }
            min={0}
            max={MAX_SKINS_SLIDER}
            step={1}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="limit-size" className="text-sm font-medium">
              Maximum size per skin (MB)
            </label>
            <Input
              id="limit-size"
              type="number"
              min={1}
              value={sizeDraft}
              onChange={(e) => setSizeDraft(e.target.value)}
              className="h-8 w-20 text-right tabular-nums"
            />
          </div>
          <Slider
            value={clamp(Number(sizeDraft) || DEFAULT_SKIN_LIMITS.maxSkinSizeMb, 1, MAX_SIZE_SLIDER)}
            onValueChange={(value) =>
              setSizeDraft(String(Array.isArray(value) ? value[0] : value))
            }
            min={1}
            max={MAX_SIZE_SLIDER}
            step={5}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  )
}

function WebhooksPanel({
  settings,
  onUpdate,
}: {
  settings: AppSettings | null
  onUpdate: (settings: AppSettings) => void
}) {
  const enabled = settings?.renderWebhookEnabled ?? false
  const [urlEdit, setUrlEdit] = useState<string | null>(null)
  const urlDraft = urlEdit ?? settings?.renderWebhookUrl ?? ""
  const serverFormat =
    settings?.renderWebhookMessageFormat ??
    DEFAULT_WEBHOOK_SETTINGS.renderWebhookMessageFormat
  const [formatEdit, setFormatEdit] = useState<string | null>(null)
  const formatDraft = formatEdit ?? serverFormat
  const [formatError, setFormatError] = useState<string | null>(null)

  useEffect(() => {
    if (formatDraft === serverFormat) {
      return
    }
    const timer = setTimeout(() => {
      fetch("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renderWebhookMessageFormat: formatDraft }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("save-failed")
          }
          return res.json()
        })
        .then((data) => onUpdate(data as AppSettings))
        .catch(() => {
          setFormatError("Could not save the message format.")
        })
    }, 500)
    return () => clearTimeout(timer)
  }, [formatDraft, serverFormat, onUpdate])
  const [toggling, setToggling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const handleToggle = async (checked: boolean) => {
    setToggling(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renderWebhookEnabled: checked }),
      })
      if (!res.ok) {
        throw new Error("save-failed")
      }
      onUpdate((await res.json()) as AppSettings)
    } catch {
      setError("Could not update the webhook setting.")
    } finally {
      setToggling(false)
    }
  }

  const handleSave = async () => {
    if (saving || urlDraft.trim() === "") {
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch("/settings/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlDraft.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error ?? "save-failed")
      }
      onUpdate((await res.json()) as AppSettings)
      setUrlEdit(null)
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof Error && err.message === "invalid webhook url"
          ? "That does not look like a valid Discord webhook URL."
          : "Could not send the test message. Check the URL and try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">Webhooks</h2>
      <h3 className="font-heading text-base font-semibold">Render</h3>
      <div className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={enabled}
            disabled={toggling}
            onChange={(e) => handleToggle(e.target.checked)}
            className="size-4 shrink-0 accent-primary"
          />
          Send webhook when attached
        </label>
        {enabled && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="render-webhook-url" className="text-sm font-medium">
                Webhook URL
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="render-webhook-url"
                  type="text"
                  inputMode="url"
                  placeholder="https://discord.com/api/webhooks/…"
                  value={urlDraft}
                  onChange={(e) => {
                    setUrlEdit(e.target.value)
                    setSaved(false)
                  }}
                />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={urlDraft.trim() === "" || saving}
                        onClick={handleSave}
                        aria-label="Save"
                      />
                    }
                  >
                    <IconDeviceFloppy />
                  </TooltipTrigger>
                  <TooltipContent>Save</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="render-webhook-format"
                  className="text-sm font-medium"
                >
                  Template
                </label>
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex" />}>
                    <IconInfoCircle className="size-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Placeholders: $url (video URL) and $comment (comment, if
                    provided)
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                id="render-webhook-format"
                rows={4}
                maxLength={2000}
                value={formatDraft}
                onChange={(e) => {
                  setFormatEdit(e.target.value)
                  setFormatError(null)
                }}
                className="resize-none overflow-y-auto"
                style={{
                  fieldSizing: "content",
                  minHeight: "calc(4lh + 1rem + 2px)",
                  maxHeight: "calc(5lh + 1rem + 2px)",
                }}
              />
              {formatError && (
                <p className="text-sm text-destructive">{formatError}</p>
              )}
            </div>
          </>
        )}
        {saved && (
          <p className="text-sm text-muted-foreground">
            Test message sent and webhook saved.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  )
}

function SkinsPanel({
  skins,
  limitsSection,
  onRemove,
}: {
  skins: Skin[]
  limitsSection: ReactNode
  onRemove: (skin: Skin) => Promise<void>
}) {
  const [query, setQuery] = useState("")

  const parsedQuery = parseSearchQuery(query)
  const normalizedText = parsedQuery.text.trim().toLowerCase()
  const filteredSkins = skins.filter((skin) => {
    if (!matchesSkinFilters(skin, parsedQuery)) {
      return false
    }
    if (normalizedText === "") {
      return true
    }
    return [skin.name, skin.submitter.username].some((value) =>
      value.toLowerCase().includes(normalizedText),
    )
  })

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">Skins</h2>
      {limitsSection}
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-heading text-base font-semibold">Uploaded</h3>
        <HeaderSearch onChange={setQuery} context="skins" admin />
      </div>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
        {skins.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No skins uploaded yet.
          </p>
        ) : filteredSkins.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No skins match your search.
          </p>
        ) : (
          filteredSkins.map((skin) => (
            <div
              key={skin.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-start gap-2">
                <IconPalette className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{skin.name}</span>
                    {skin.rulesets.map((ruleset) => (
                      <RulesetIcon
                        key={ruleset}
                        ruleset={ruleset as SkinRuleset}
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    ))}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Uploaded by{" "}
                    <a
                      href={`https://osu.ppy.sh/users/${skin.submitter.osuId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground hover:underline underline-offset-2"
                    >
                      {skin.submitter.username}
                    </a>{" "}
                    on {new Date(skin.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  render={<a href={`/skins/${skin.id}/file`} />}
                  aria-label="Download skin"
                >
                  <IconDownload />
                </Button>
                <RemoveSkinDialog skin={skin} onRemove={onRemove} />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export function ManageTab({ user }: { user: SessionUser }) {
  const [section, setSection] = useState<ManageSection>("thresholds")
  const [users, setUsers] = useState<ManageUser[]>([])
  const [replays, setReplays] = useState<Replay[]>([])
  const [skins, setSkins] = useState<Skin[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [scoreDraft, setScoreDraft] = useState("")
  const [percentDraft, setPercentDraft] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const refreshReplays = async () => {
    const res = await fetch("/replays?scope=all")
    if (!res.ok) {
      throw new Error("load-failed")
    }
    const data = (await res.json()) as ReplayApi[]
    setReplays(data.map(replayFromApi))
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/users"),
      fetch("/replays?scope=all"),
      fetch("/settings"),
      fetch("/skins?scope=all"),
    ])
      .then(([usersRes, replaysRes, settingsRes, skinsRes]) =>
        Promise.all([
          usersRes.ok ? usersRes.json() : [],
          replaysRes.ok ? replaysRes.json() : [],
          settingsRes.ok ? settingsRes.json() : null,
          skinsRes.ok ? skinsRes.json() : [],
        ]),
      )
      .then(([usersData, replaysData, settingsData, skinsData]) => {
        if (cancelled) {
          return
        }
        setUsers(usersData as ManageUser[])
        setReplays((replaysData as ReplayApi[]).map(replayFromApi))
        setSkins(skinsData as Skin[])
        if (settingsData) {
          const s = settingsData as AppSettings
          setSettings(s)
          setScoreDraft(String(s.thresholdScore))
          setPercentDraft(String(s.thresholdPercent))
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

  const saveSettings = async () => {
    const body: Partial<JudgeSettings> = {}
    const score = Number(scoreDraft)
    const percent = Number(percentDraft)
    if (Number.isInteger(score)) {
      body.thresholdScore = score
    }
    if (Number.isInteger(percent)) {
      body.thresholdPercent = percent
    }
    setSavingSettings(true)
    setSettingsError(null)
    try {
      const res = await fetch("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error("save-failed")
      }
      const updated = (await res.json()) as AppSettings
      setSettings(updated)
      setScoreDraft(String(updated.thresholdScore))
      setPercentDraft(String(updated.thresholdPercent))
      await refreshReplays()
    } catch {
      setSettingsError("Could not save the thresholds.")
    } finally {
      setSavingSettings(false)
    }
  }

  const saveLimits = useCallback(
    async (input: Partial<SkinLimits>) => {
      const res = await fetch("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        throw new Error("save-failed")
      }
      setSettings((await res.json()) as AppSettings)
    },
    [],
  )

  const changeUserRole = async (target: ManageUser, role: string) => {
    const res = await fetch("/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ osuId: target.osuId, role }),
    })
    if (!res.ok) {
      window.alert("Could not change the user's role.")
      return
    }
    const updated = (await res.json()) as ManageUser
    setUsers((prev) => prev.map((u) => (u.osuId === updated.osuId ? updated : u)))
  }

  const toggleBan = async (target: ManageUser) => {
    const res = await fetch("/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ osuId: target.osuId, banned: target.bannedAt === null }),
    })
    if (!res.ok) {
      window.alert("Could not update the user.")
      return
    }
    const updated = (await res.json()) as ManageUser
    setUsers((prev) => prev.map((u) => (u.osuId === updated.osuId ? updated : u)))
  }

  const setReplayStatus = async (replay: Replay, status: "pool" | "render") => {
    const res = await fetch(`/replays/${replay.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      window.alert("Could not change the replay's status.")
      return
    }
    const updated = (await res.json()) as ReplayApi
    setReplays((prev) => prev.map((r) => (r.id === updated.id ? replayFromApi(updated) : r)))
  }

  const removeReplay = async (replay: Replay) => {
    const res = await fetch(`/replays/${replay.id}`, { method: "DELETE" })
    if (!res.ok) {
      throw new Error("remove-failed")
    }
    setReplays((prev) => prev.filter((r) => r.id !== replay.id))
  }

  const removeSkin = async (skin: Skin) => {
    const res = await fetch(`/skins/${skin.id}`, { method: "DELETE" })
    if (!res.ok) {
      throw new Error("remove-failed")
    }
    setSkins((prev) => prev.filter((s) => s.id !== skin.id))
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-xl font-semibold">Manage</h1>
        <p className="text-sm text-muted-foreground">
          Don&apos;t abuse please...
        </p>
      </header>

      {failed ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Could not load the dashboard.
          </CardContent>
        </Card>
      ) : !loaded ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-[200px_1fr] md:items-start">
          <nav className="flex flex-col gap-1 pb-6 md:sticky md:top-20 md:border-r md:pb-0 md:pr-8">
            {MANAGE_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-pressed={section === s.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  section === s.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <s.icon className="size-4" />
                {s.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 md:pl-8">
            {section === "thresholds" && (
              <ThresholdsPanel
                settings={settings}
                scoreDraft={scoreDraft}
                percentDraft={percentDraft}
                onScoreChange={setScoreDraft}
                onPercentChange={setPercentDraft}
                onSave={saveSettings}
                saving={savingSettings}
                error={settingsError}
              />
            )}
            {section === "users" && (
              <UsersPanel
                users={users}
                actor={user}
                onChangeRole={changeUserRole}
                onToggleBan={toggleBan}
              />
            )}
            {section === "replays" && (
              <ReplaysPanel
                replays={replays}
                onChangeStatus={setReplayStatus}
                onRemove={removeReplay}
              />
            )}
            {section === "skins" && (
              <SkinsPanel
                skins={skins}
                limitsSection={
                  <SkinLimitsSection
                    limits={settings}
                    onSave={saveLimits}
                  />
                }
                onRemove={removeSkin}
              />
            )}
            {section === "webhooks" && (
              <WebhooksPanel settings={settings} onUpdate={setSettings} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}