"use client"
import { useState } from "react"
import { ExternalLink, LoaderCircle, LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function LoginDialog({
  open,
  onOpenChange,
  siteUrl,
  onConnected,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  siteUrl: string
  onConnected: () => Promise<void>
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changeOpen = (value: boolean) => {
    if (!busy) {
      setPassword("")
      setError(null)
      onOpenChange(value)
    }
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/erpnext/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Sign-in failed.")
      setPassword("")
      onOpenChange(false)
      await onConnected()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sign-in failed. Please try again."
      )
      setPassword("")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl border bg-muted">
            <LockKeyhole className="size-5" />
          </div>
          <DialogTitle>Connect to your company</DialogTitle>
          <DialogDescription>
            Sign in with your ERPNext account at {new URL(siteUrl).host}. Your
            existing permissions determine which company records you can view.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={signIn} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="erp-username" className="text-sm font-medium">
              ERPNext email or username
            </label>
            <Input
              id="erp-username"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="erp-password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="erp-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            {busy ? "Connecting…" : "Sign in to ERPNext"}
          </Button>
        </form>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your password is sent to your company’s ERPNext site and is not saved
          by this platform.
        </p>
        <a
          className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
          href={`${siteUrl}/login`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open company ERPNext
          <ExternalLink className="size-3" />
        </a>
      </DialogContent>
    </Dialog>
  )
}
