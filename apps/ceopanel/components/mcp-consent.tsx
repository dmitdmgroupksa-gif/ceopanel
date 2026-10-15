"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "./ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card"
import { LanguageSwitch, useLocale } from "./locale-provider"
import { LoginDialog } from "./login-dialog"
import type { DashboardContext } from "@/lib/dashboard-server"
type Preview = {
  client: { name: string; redirectUri: string }
  context: DashboardContext
  agents: { id: string; name: string; ar: string }[]
  canPropose: boolean
}
export function MCPConsent({
  query,
  siteUrl,
}: {
  query: string
  siteUrl: string
}) {
  const { locale } = useLocale(),
    ar = locale === "ar"
  const generation = useRef(0)
  const [preview, setPreview] = useState<Preview | null>(null),
    [company, setCompany] = useState(""),
    [agent, setAgent] = useState(""),
    [propose, setPropose] = useState(false),
    [login, setLogin] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const version = ++generation.current
    setPreview(null)
    setError("")
    setAgent("")
    setPropose(false)
    try {
      const response = await fetch(
        `/api/mcp/oauth/consent?${new URLSearchParams({ query, ...(company ? { company } : {}) })}`,
        { cache: "no-store" },
      )
      const data = await response.json()
      if (version !== generation.current) return
      if (response.status === 401) {
        setLogin(true)
        return
      }
      if (!response.ok)
        throw new Error(data.error_description || "Unable to load consent.")
      setPreview(data)
      setAgent(data.agents[0]?.id || "")
    } catch (error) {
      if (version === generation.current)
        setError(
          error instanceof Error ? error.message : "Unable to load consent.",
        )
    }
  }, [query, company])
  useEffect(() => {
    void load()
    return () => {
      generation.current++
    }
  }, [load])
  async function decide(decision: "allow" | "deny") {
    if (!preview) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/mcp/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          company: preview.context.company,
          agent: agent || "executive",
          allowProposals: propose,
          decision,
        }),
      })
      const data = await response.json()
      if (!response.ok)
        throw new Error(data.error_description || "Authorization failed.")
      window.location.assign(data.redirect)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Authorization failed.")
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-5 p-5">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-semibold">
          Durar Masagh
        </Link>
        <LanguageSwitch />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {ar ? "السماح باتصال MCP" : "Authorize an MCP connection"}
          </CardTitle>
          <CardDescription>
            {ar
              ? "راجع التطبيق والشركة والصلاحيات قبل السماح بالوصول."
              : "Review the application, company, and permissions before allowing access."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {preview ? (
            <>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{preview.client.name}</p>
                <p className="break-all text-muted-foreground" dir="ltr">
                  {preview.client.redirectUri}
                </p>
                <p>{preview.context.user}</p>
              </div>
              <label className="grid gap-2 text-sm">
                {ar ? "الشركة" : "Company"}
                <select
                  aria-label={ar ? "الشركة" : "Company"}
                  className="h-10 rounded-md border bg-background px-3"
                  value={preview.context.company}
                  disabled={busy}
                  onChange={(e) => {
                    setPreview(null)
                    setCompany(e.target.value)
                  }}
                >
                  {preview.context.companies.map((c) => (
                    <option key={c.name}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                {ar ? "ملف الوكيل" : "Agent profile"}
                <select
                  aria-label={ar ? "ملف الوكيل" : "Agent profile"}
                  className="h-10 rounded-md border bg-background px-3"
                  value={agent}
                  disabled={busy}
                  onChange={(e) => setAgent(e.target.value)}
                >
                  {preview.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {ar ? a.ar : a.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-muted-foreground">
                {ar
                  ? "قراءة مصادر الشركة المعتمدة والمتاحة لحسابك فقط. تنتهي صلاحية الاتصال بعد ثماني ساعات أو عند انتهاء جلسة ERPNext."
                  : "Read approved company sources permitted for your account. Access expires after eight hours or when your ERPNext session ends."}
              </p>
              {preview.canPropose && (
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={propose}
                    disabled={busy}
                    onChange={(e) => setPropose(e.target.checked)}
                  />
                  {ar
                    ? "السماح بإعداد مقترحات للمراجعة البشرية"
                    : "Allow preparing proposals for human review"}
                </label>
              )}
              <p className="text-sm">
                {ar
                  ? "لا يمكن لهذا التطبيق الموافقة على التغييرات أو تنفيذها. تتم الموافقة البشرية من لوحة التحكم."
                  : "This application cannot approve or execute changes. Human approval takes place in the dashboard."}
              </p>
              <div className="flex gap-3">
                <Button
                  disabled={busy || !agent}
                  onClick={() => void decide("allow")}
                >
                  {ar ? "السماح بالوصول" : "Allow access"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void decide("deny")}
                >
                  {ar ? "رفض" : "Deny"}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" onClick={() => setLogin(true)}>
              {ar ? "تسجيل الدخول إلى ERPNext" : "Sign in to ERPNext"}
            </Button>
          )}
        </CardContent>
      </Card>
      <LoginDialog
        open={login}
        onOpenChange={setLogin}
        siteUrl={siteUrl}
        onConnected={load}
      />
    </main>
  )
}
