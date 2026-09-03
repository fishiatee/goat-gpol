"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { IconDownload, IconFile, IconPalette } from "@tabler/icons-react"
import type { Replay } from "@/components/app-shell"

export function ReplayDownloadButton({ replay }: { replay: Replay }) {
  const [open, setOpen] = useState(false)

  if (!replay.skinName) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        render={<a href={`/replays/${replay.id}/file`} />}
        aria-label="Download replay"
      >
        <IconDownload />
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Download replay or skin"
          />
        }
      >
        <IconDownload />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download</DialogTitle>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            render={<a href={`/replays/${replay.id}/file`} />}
            onClick={() => setOpen(false)}
            className="flex h-auto flex-col items-center justify-center gap-2 px-4 py-6"
          >
            <IconFile className="size-6 text-muted-foreground" />
            <span>Replay</span>
          </Button>
          <Button
            variant="outline"
            render={<a href={`/replays/${replay.id}/skin/file`} />}
            onClick={() => setOpen(false)}
            className="flex h-auto flex-col items-center justify-center gap-2 px-4 py-6"
          >
            <IconPalette className="size-6 text-muted-foreground" />
            <span>Skin</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
