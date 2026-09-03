"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconSearch, IconX } from "@tabler/icons-react"

import {
  FILTER_META,
  availableKinds,
  describeToken,
  extractFilterTokens,
  parseSingleToken,
  tokenizeQuery,
  type FilterKind,
} from "@/lib/search-filters"
import { cn } from "@/lib/utils"

function stripFragment(value: string, fragment: string): string {
  if (fragment === "") {
    return value
  }
  const idx = value.lastIndexOf(fragment)
  if (idx === -1) {
    return value
  }
  return value.slice(0, idx).replace(/\s+$/, "")
}

function shouldReplaceFragment(
  fragment: string,
  available: readonly FilterKind[],
): boolean {
  if (fragment === "") {
    return false
  }
  if (fragment.includes(":")) {
    return true
  }
  const q = fragment.toLowerCase()
  return available.some(
    (k) =>
      k.startsWith(q) ||
      FILTER_META[k].label.toLowerCase().startsWith(q),
  )
}

export function HeaderSearch({
  onChange,
  context,
  admin = false,
}: {
  onChange: (query: string) => void
  context: "replays" | "skins"
  admin?: boolean
}) {
  const available = useMemo(
    () => availableKinds(context, admin),
    [context, admin],
  )
  const [text, setText] = useState("")
  const [chips, setChips] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const focusOnMountRef = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el
    el?.focus()
  }, [])

  const showBox = expanded || open || text !== "" || chips.length > 0

  const endsWithSpace = /\s$/.test(text)
  const fragment = useMemo(() => {
    if (endsWithSpace) {
      return ""
    }
    const tokens = tokenizeQuery(text)
    return tokens[tokens.length - 1] ?? ""
  }, [text, endsWithSpace])

  const emitQuery = (nextChips: string[], nextText: string) => {
    onChange([...nextChips, nextText].join(" ").replace(/\s+/g, " ").trim())
  }

  const removeChip = (index: number) => {
    const next = chips.filter((_, i) => i !== index)
    setChips(next)
    emitQuery(next, text)
  }

  const enterKind = (kind: FilterKind) => {
    if (fragment.toLowerCase().startsWith(`${kind}:`)) {
      inputRef.current?.focus()
      return
    }
    const replace = shouldReplaceFragment(fragment, available)
    const base = replace
      ? stripFragment(text, fragment)
      : text.replace(/\s+$/, "")
    setText(base ? `${base} ${kind}:` : `${kind}:`)
    inputRef.current?.focus()
  }

  const addChipAndStripFragment = (token: string) => {
    const next = chips.includes(token) ? chips : [...chips, token]
    const rest = stripFragment(text, fragment)
    setChips(next)
    setText(rest)
    emitQuery(next, rest)
  }

  const promoteAll = (value: string) => {
    const { text: rest, tokens } = extractFilterTokens(value, available)
    const next = [...chips, ...tokens.filter((t) => !chips.includes(t))]
    const changed = rest !== value || next.length !== chips.length
    if (!changed) {
      return { rest, next, changed }
    }
    setChips(next)
    setText(rest)
    emitQuery(next, rest)
    return { rest, next, changed }
  }

  const catalogQuery = fragment.includes(":")
    ? fragment.slice(0, fragment.indexOf(":")).toLowerCase()
    : fragment.toLowerCase()
  const catalog = useMemo(() => {
    const q = catalogQuery
    return available.filter(
      (kind) =>
        q === "" ||
        kind.includes(q) ||
        FILTER_META[kind].label.toLowerCase().includes(q),
    )
  }, [catalogQuery, available])

  type Selectable = { key: string; run: () => void }
  const selectables: Selectable[] = useMemo(() => {
    return catalog.map((kind) => ({
      key: `kind-${kind}`,
      run: () => {
        if (kind === "is_pfc") {
          addChipAndStripFragment("is_pfc")
        } else {
          enterKind(kind)
        }
      },
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, chips, text])

  const clampedIndex =
    selectables.length === 0
      ? 0
      : Math.min(Math.max(activeIndex, 0), selectables.length - 1)

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false)
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      if (fragment !== "") {
        const exact = parseSingleToken(fragment)
        if (
          exact &&
          (available as readonly string[]).includes(exact.kind) &&
          !chips.includes(fragment)
        ) {
          const next = [...chips, fragment]
          const rest = stripFragment(text, fragment)
          setChips(next)
          setText(rest)
          emitQuery(next, rest)
          setOpen(false)
          return
        }
      }
      if (fragment !== "" && selectables[clampedIndex]) {
        selectables[clampedIndex].run()
        return
      }
      promoteAll(text)
      setOpen(false)
      return
    }
    if (e.key === " ") {
      const tokens = tokenizeQuery(text)
      const last = tokens[tokens.length - 1]
      if (last) {
        const parsed = parseSingleToken(last)
        if (
          parsed &&
          (available as readonly string[]).includes(parsed.kind) &&
          !chips.includes(last)
        ) {
          e.preventDefault()
          const next = [...chips, last]
          const rest = text.slice(0, text.lastIndexOf(last)).replace(/\s+$/, "")
          setChips(next)
          setText(rest)
          emitQuery(next, rest)
        }
      }
      return
    }
    if (e.key === "ArrowDown" && selectables.length > 0) {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % selectables.length)
      return
    }
    if (e.key === "ArrowUp" && selectables.length > 0) {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + selectables.length) % selectables.length)
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setOpen(false)
      const { rest, next } = promoteAll(text)
      if (rest === "" && next.length === 0) {
        setExpanded(false)
      }
    }
  }

  if (!showBox) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search"
              onClick={() => {
                setExpanded(true)
                setOpen(true)
              }}
            />
          }
        >
          <IconSearch />
        </TooltipTrigger>
        <TooltipContent>Search</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className="relative"
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false)
          if (text === "" && chips.length === 0) {
            setExpanded(false)
          }
        }
      }}
    >
      <div className="flex min-h-9 w-52 flex-nowrap items-center gap-1 overflow-x-auto rounded-md border border-input bg-transparent px-2 py-1 transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-64">
        <IconSearch className="size-4 shrink-0 text-muted-foreground" />
        {chips.map((token, i) => (
          <span
            key={`${token}-${i}`}
            className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium"
          >
            {describeToken(token) ?? token}
            <button
              type="button"
              aria-label={`Remove filter ${token}`}
              onClick={() => removeChip(i)}
              className="rounded text-muted-foreground hover:text-foreground"
            >
              <IconX className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={focusOnMountRef}
          value={text}
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            setOpen(true)
            emitQuery(chips, next)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder={chips.length > 0 ? "" : "Search"}
          aria-label="Search"
          className="min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {(text !== "" || chips.length > 0) && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText("")
              setChips([])
              emitQuery([], "")
              inputRef.current?.focus()
            }}
            className="shrink-0 rounded text-muted-foreground hover:text-foreground"
          >
            <IconX className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-1/2 z-50 mt-2 max-h-96 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
              <p className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
                Filters
              </p>
              {catalog.map((kind, i) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    if (kind === "is_pfc") {
                      addChipAndStripFragment("is_pfc")
                    } else {
                      enterKind(kind)
                    }
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-muted",
                    i === clampedIndex && "bg-muted",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {FILTER_META[kind].label}
                    <code className="rounded bg-muted px-1 text-xs font-normal text-muted-foreground">
                      {kind === "is_pfc" ? "is_pfc" : `${kind}:`}
                    </code>
                  </span>
                </button>
              ))}
              {catalog.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No filters match.
                </p>
              )}
        </div>
      )}
    </div>
  )
}
