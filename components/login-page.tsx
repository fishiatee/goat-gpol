"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

const authErrorMessages: Record<string, string> = {
  access_denied: "You chose not to authorize the application. Try again whenever you're ready.",
  invalid_authorization: "The login attempt could not be verified. Please try again.",
  authorization_failed: "osu! could not be reached during login. Please try again.",
}

export function LoginPage({ authError }: { authError?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/auth/login")
      if (!res.ok) {
        throw new Error("login request failed")
      }
      const data = (await res.json()) as { url: string }
      window.location.href = data.url
    } catch {
      setError("Something went wrong while starting the login. Please try again.")
      setLoading(false)
    }
  }

  const displayError =
    (authError ? authErrorMessages[authError] ?? authError : null) ?? error

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <p className="text-balance text-xl font-medium">haiiiii :3</p>
        <p className="text-balance text-sm text-muted-foreground">
          login with ur osu account to start idk :waduh:
        </p>
        {displayError && <p className="text-sm text-destructive">{displayError}</p>}
        <Button onClick={handleLogin} disabled={loading} className="w-full">
          login
        </Button>
      </div>
    </div>
  )
}