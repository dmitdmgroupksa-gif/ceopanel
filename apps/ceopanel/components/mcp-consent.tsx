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
import { ERP_READ_ONLY } from "@/lib/erp-access"
type Preview = {
  client: { name: string; redirectUri: string }
  context: DashboardContext
  agents: { id: string; name: string; ar: string }[]
  canPropose: boolean
  erpRead?: boolean
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
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const version = ++generation.current
    setPreview(null)
    setLoading(true)
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
    } finally {
      if (version === generation.current) setLoading(false)
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
                {preview.erpRead &&
                  (ar
                    ? "السماح بقراءة سجلات الأعمال والتقارير والأنواع المخصصة وحالات الاعتماد وتنزيل الملفات عبر نظام ERP، بما فيها الشركات الأخرى التي يستطيع حسابك الوصول إليها. يستثني ذلك كلمات المرور وإعدادات الأمان. "
                    : "Allow reading business records, reports, custom DocTypes, workflow states and files across this ERP, including other companies your account can access. Credentials and security settings are excluded. ")}
                {ar
                  ? `${preview.erpRead ? "الشركة المحددة لسياق الاتصال؛ تُطبق صلاحيات حسابك عبر نظام ERP." : "قراءة مصادر الشركة المعتمدة والمتاحة لحسابك فقط."} تنتهي صلاحية الاتصال بعد ثماني ساعات أو عند انتهاء جلسة ERPNext.`
                  : `${preview.erpRead ? "The selected company labels this connection; native permissions apply across the ERP." : "Read approved company sources permitted for your account."} Access expires after eight hours or when your ERPNext session ends.`}
              </p>
              {!ERP_READ_ONLY && preview.canPropose && (
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
                  ? "هذا الاتصال للقراءة فقط. إنشاء السجلات وتعديلها وإرسالها والموافقة عليها معطلة."
                  : "This application cannot approve or execute changes. Creating, editing and submitting ERP records are disabled."}
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
          ) : loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              {ar ? "جارٍ التحقق من الاتصال…" : "Checking connection…"}
            </p>
          ) : error ? (
            <Button variant="outline" onClick={() => void load()}>
              {ar ? "إعادة المحاولة" : "Try again"}
            </Button>
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
