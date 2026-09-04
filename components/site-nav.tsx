"use client"

import { LogoutButton } from "@/components/logout-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { canAdmin, canJudge } from "@/lib/roles"
import type { SessionUser, Tab } from "@/components/app-shell"

export function SiteNav({
  tab,
  onTabChange,
  user,
}: {
  tab: Tab
  onTabChange: (tab: Tab) => void
  user: SessionUser
}) {
  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: "replays", label: "Replays" },
    { id: "skins", label: "Skins" },
  ]
  if (canJudge(user.role)) {
    tabs.push({ id: "judge", label: "Judge" }, { id: "render", label: "Render" })
  }
  if (canAdmin(user.role)) {
    tabs.push({ id: "manage", label: "Manage" })
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <span className="font-heading text-lg font-semibold tracking-tight">gpol</span>
        <nav className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={t.disabled}
              onClick={() => onTabChange(t.id)}
              aria-pressed={tab === t.id}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                tab === t.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <Avatar size="sm">
            <AvatarImage src={user.avatarUrl} alt={`${user.username} avatar`} />
            <AvatarFallback>{user.username.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:block">{user.username}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}