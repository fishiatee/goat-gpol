"use client"

import { useState, type FormEvent } from "react"

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
import { FilePicker } from "@/components/file-picker"
import { HeaderSearch } from "@/components/header-search"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  IconChevronDown,
  IconDownload,
  IconPalette,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react"
import type { SkinLimits } from "@/lib/judging"
import type { SkinRuleset, UploadProgress } from "@/lib/skin-upload"
import { cn } from "@/lib/utils"
import {
  OsuCatchIcon,
  OsuIcon,
  OsuManiaIcon,
  OsuTaikoIcon,
  RulesetIcon,
} from "@/components/ruleset-icons"
import type { Skin } from "@/components/app-shell"

const RULESET_OPTIONS: {
  id: SkinRuleset
  label: string
  icon: typeof OsuIcon
}[] = [
  { id: "osu", label: "osu!", icon: OsuIcon },
  { id: "mania", label: "osu!mania", icon: OsuManiaIcon },
  { id: "catch", label: "osu!catch", icon: OsuCatchIcon },
  { id: "taiko", label: "osu!taiko", icon: OsuTaikoIcon },
]

function SkinUploadForm({
  onUpload,
  maxSkinSizeMb,
}: {
  onUpload: (
    name: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    rulesets?: SkinRuleset[],
    scrollSpeed?: number,
  ) => Promise<void>
  maxSkinSizeMb: number
}) {
  const [name, setName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [rulesets, setRulesets] = useState<SkinRuleset[]>(["osu"])
  const [scrollSpeed, setScrollSpeed] = useState(25)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sizeExceeded, setSizeExceeded] = useState(false)

  const toggleRuleset = (id: SkinRuleset, checked: boolean) => {
    setRulesets((prev) =>
      checked ? [...prev, id] : prev.filter((r) => r !== id),
    )
  }

  const handleFileChange = (picked: File | null) => {
    setFile(picked)
    setSizeExceeded(picked !== null && picked.size > maxSkinSizeMb * 1024 * 1024)
  }

  const selectedLabels = RULESET_OPTIONS.filter((option) =>
    rulesets.includes(option.id),
  ).map((option) => option.label)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file || name.trim() === "" || uploading || rulesets.length === 0) {
      return
    }
    setUploading(true)
    setError(null)
    try {
      await onUpload(
        name.trim(),
        file,
        setProgress,
        [...rulesets],
        rulesets.includes("mania") ? scrollSpeed : undefined,
      )
    } catch (err) {
      setError(
        err instanceof Error && err.message === "skin-limit-reached"
          ? "You have reached the maximum number of skins."
          : err instanceof Error && err.message === "file too large"
            ? "The skin file exceeds the maximum allowed size."
            : "Could not upload the skin. Please try again.",
      )
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Upload a skin</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Skin file</span>
          <FilePicker
            accept=".osk"
            label="Pick a skin file"
            hint="or drag and drop it here"
            fileName={file?.name ?? null}
            onFileChange={handleFileChange}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Ruleset</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Ruleset"
              className={cn(
                "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:border-ring data-popup-open:ring-3 data-popup-open:ring-ring/50",
                rulesets.length === 0 && "text-muted-foreground",
              )}
            >
              <span className="line-clamp-1 truncate">
                {selectedLabels.length > 0 ? selectedLabels.join(", ") : "None selected"}
              </span>
              <IconChevronDown className="size-4 shrink-0 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {RULESET_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={rulesets.includes(option.id)}
                  onCheckedChange={(checked) =>
                    toggleRuleset(option.id, checked === true)
                  }
                  closeOnClick={false}
                >
                  <span className="flex items-center gap-2">
                    <option.icon className="size-3.5 shrink-0" />
                    {option.label}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {rulesets.includes("mania") && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Scroll Speed</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {scrollSpeed.toFixed(1)}
              </span>
            </div>
            <Slider
              value={scrollSpeed}
              onValueChange={(value) =>
                setScrollSpeed(Array.isArray(value) ? value[0] : value)
              }
              min={1}
              max={40}
              step={0.5}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="skin-name" className="text-sm font-medium">
            Skin name
          </label>
          <Input
            id="skin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="leaked owc skin"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        {sizeExceeded && (
          <p className="text-sm text-destructive sm:mr-auto sm:self-center">
            Skin exceeded size limit ({maxSkinSizeMb} MB)
          </p>
        )}
        {uploading && progress && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground sm:mr-auto">
            <Spinner />
            {progress.percent}% done ({progress.mbps.toFixed(1)}mb/s)
          </p>
        )}
        <Button
          type="submit"
          disabled={
            !file ||
            name.trim() === "" ||
            rulesets.length === 0 ||
            uploading ||
            sizeExceeded
          }
        >
          {uploading ? "Uploading…" : "Upload skin"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <IconPalette className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No skins yet</p>
      </CardContent>
    </Card>
  )
}

export function SkinsTab({
  skins,
  onUpload,
  canSubmit,
  skinLimits,
}: {
  skins: Skin[]
  onUpload: (
    name: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    rulesets?: SkinRuleset[],
    scrollSpeed?: number,
  ) => Promise<void>
  canSubmit: boolean
  skinLimits: SkinLimits
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const limitReached =
    canSubmit && skins.length >= skinLimits.maxSkinsPerUser

  const normalizedQuery = query.trim().toLowerCase()
  const filteredSkins =
    normalizedQuery === ""
      ? skins
      : skins.filter((skin) =>
          [skin.name, skin.submitter.username].some((value) =>
            value.toLowerCase().includes(normalizedQuery),
          ),
        )

  const handleUpload = async (
    name: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    rulesets?: SkinRuleset[],
    scrollSpeed?: number,
  ) => {
    await onUpload(name, file, onProgress, rulesets, scrollSpeed)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading text-xl font-semibold">Skins</h1>
          <p className="text-sm text-muted-foreground">
            Custom skins to be used when rendering.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HeaderSearch onChange={setQuery} />
          {canSubmit ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <DialogTrigger render={<Button disabled={limitReached} />}>
                    <IconUpload />
                    Upload
                  </DialogTrigger>
                </TooltipTrigger>
                {limitReached && (
                  <TooltipContent>
                    You cannot upload more skins.
                  </TooltipContent>
                )}
              </Tooltip>
              <DialogContent>
                <SkinUploadForm
                  onUpload={handleUpload}
                  maxSkinSizeMb={skinLimits.maxSkinSizeMb}
                />
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are banned from uploading new skins.
            </p>
          )}
        </div>
      </header>

      {skins.length === 0 ? (
        <EmptyState />
      ) : filteredSkins.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <IconSearch className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No skins match your search</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
          {filteredSkins.map((skin) => (
            <li
              key={skin.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
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
                    Uploaded on {new Date(skin.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  render={<a href={`/skins/${skin.id}/file`} />}
                  aria-label="Download skin"
                >
                  <IconDownload />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}