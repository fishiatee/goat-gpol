"use client"

import { useRef, useState, type DragEvent } from "react"

import { cn } from "@/lib/utils"

export function FilePicker({
  accept,
  label,
  hint,
  fileName,
  onFileChange,
  disabled = false,
}: {
  accept: string
  label: string
  hint: string
  fileName?: string | null
  onFileChange?: (file: File | null) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localFileName, setLocalFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const displayedFileName = fileName !== undefined ? fileName : localFileName

  const selectFile = (file: File | null) => {
    if (disabled) return
    setLocalFileName(file?.name ?? null)
    onFileChange?.(file)
  }

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (disabled) return
    setDragging(false)
    const file = e.dataTransfer.files?.[0] ?? null
    selectFile(file)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (disabled) return
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50",
        dragging
          ? "border-ring bg-muted/60"
          : displayedFileName
            ? "border-ring bg-muted/40"
            : "border-border hover:border-ring hover:bg-muted/30"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        disabled={disabled}
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          selectFile(e.target.files?.[0] ?? null)
          e.target.value = ""
        }}
      />
      {displayedFileName ? (
        <>
          <span className="max-w-full px-2 text-sm font-medium break-all">
            {displayedFileName}
          </span>
          <span className="text-xs text-muted-foreground">
            Click to choose a different file
          </span>
        </>
      ) : (
        <>
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </>
      )}
    </button>
  )
}
