"use client"
import { useEffect, useRef, useState } from "react"
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useLocale } from "./locale-provider"

export function LoginForm({
  siteUrl,
  onConnected,
}: {
  siteUrl: string
  onConnected: () => Promise<void>
}) {
  const { t } = useLocale()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [method, setMethod] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    const abort = new AbortController()
    controller.current = abort
    try {
      const response = await fetch("/api/erpnext/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method ? { otp } : { username, password }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35000)]),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "Sign-in failed. Please try again.")
      setPassword("")
      setOtp("")
      setVisible(false)
      if (body.challenge) {
        setMethod(body.method)
        return
      }
      await onConnected()
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Sign-in failed. Please try again.",
        )
        setPassword("")
        setOtp("")
      }
    } finally {
      if (!abort.signal.aborted) setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      {method ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(
              method === "OTP App"
                ? "Enter the code from your authenticator app."
                : method === "SMS"
                  ? "Enter the code sent to your registered phone."
                  : "Check your registered email for your code or authenticator setup instructions.",
            )}
          </p>
          <label htmlFor="erp-otp" className="block text-sm font-medium">
            {t("Verification code")}
          </label>
          <Input
            id="erp-otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
            disabled={busy}
            className="h-12 text-center text-xl tracking-[0.4em]"
            dir="ltr"
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label htmlFor="erp-username" className="text-sm font-medium">
              {t("ERPNext email or username")}
            </label>
            <Input
              id="erp-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={320}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={busy}
              placeholder="you@company.com"
              className="h-11"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="erp-password" className="text-sm font-medium">
                {t("Password")}
              </label>
              <a
                href={`${siteUrl}/login#forgot`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("Forgot password?")}
              </a>
            </div>
            <div className="relative" dir="ltr">
              <Input
                id="erp-password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={512}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                className="h-11 pe-12"
                dir="ltr"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute end-1 top-1.5"
                aria-label={t(visible ? "Hide password" : "Show password")}
                aria-pressed={visible}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>
        </>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {t(error)}
        </p>
      )}
      <Button type="submit" className="h-11 w-full gap-2" disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {t(
          busy
            ? "Signing in…"
            : method
              ? "Verify and sign in"
              : "Sign in to ERPNext",
        )}
        {!busy && <ArrowRight className="size-4 rtl:rotate-180" />}
      </Button>
      {method && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={() => {
            setMethod(null)
            setOtp("")
            setError("")
          }}
        >
          {t("Use another account or restart sign-in")}
        </Button>
      )}
    </form>
  )
}
