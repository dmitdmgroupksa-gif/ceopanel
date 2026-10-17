"use client"
import { sessionFetch as fetch } from "@/lib/session-fetch"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Copy, RefreshCw } from "lucide-react"
import type { MCPConnectionSettings } from "@/lib/mcp/settings"
import { Button } from "./ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card"
import { useLocale } from "./locale-provider"
type Grant = {
  id: string
  client: string
  agent: string
  scopes: string[]
  expires_at: string
  revoked_at: string | null
}
export function MCPSettings({ company, user }: { company: string; user: string }) {
  const { locale } = useLocale(),
    ar = locale === "ar"
  const [grants, setGrants] = useState<Grant[]>([]),
    [settings, setSettings] = useState<MCPConnectionSettings | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const pendingLoad = useRef(0)
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const request = ++pendingLoad.current
      setGrants([])
      setSettings(null)
      setMessage("")
      if (!company) return
      setLoading(true)
      try {
        const configuration = await fetch(`/api/platform/mcp-settings?${new URLSearchParams({ company })}`, { signal, cache: "no-store" })
        const connection = await configuration.json()
        if (signal?.aborted || request !== pendingLoad.current) return
        if (!configuration.ok) throw new Error(connection.error || "MCP settings could not be loaded.")
        if (connection.user !== user || connection.company !== company)
          throw new Error("MCP identity does not match the signed-in account.")
        setSettings(connection)
        if (!connection.ready) return
        const response = await fetch(
          `/api/mcp/oauth/grants?${new URLSearchParams({ company })}`,
          { signal, cache: "no-store" },
        )
        const data = await response.json()
        if (!response.ok) throw new Error(data.error_description || "MCP connections could not be loaded.")
        if (!signal?.aborted && request === pendingLoad.current) setGrants(data)
      } catch (e) {
        if (!signal?.aborted && request === pendingLoad.current)
          setMessage(e instanceof Error ? e.message : "MCP unavailable.")
      } finally {
        if (!signal?.aborted && request === pendingLoad.current) setLoading(false)
      }
    },
    [company, user],
  )
  useEffect(() => {
    const controller = new AbortController()
    generation.current++
    setBusy(false)
    void load(controller.signal)
    return () => {
      controller.abort()
      generation.current++
      pendingLoad.current++
    }
  }, [load])
  async function revoke(id: string) {
    const version = generation.current
    setBusy(true)
    try {
      const response = await fetch("/api/mcp/oauth/revoke-owned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, company }),
      })
      const data = await response.json()
      if (version !== generation.current) return
      if (!response.ok) throw new Error(data.error_description)
      await load()
    } catch (e) {
      if (version === generation.current)
        setMessage(e instanceof Error ? e.message : "Unable to revoke access.")
    } finally {
      if (version === generation.current) setBusy(false)
    }
  }
  async function copyEndpoint() {
    if (!settings?.endpoint) return
    try {
      await navigator.clipboard.writeText(settings.endpoint)
      setMessage(ar ? "تم نسخ رابط الخادم." : "Server URL copied.")
    } catch {
      setMessage(ar ? "حدد رابط الخادم وانسخه يدوياً." : "Select the server URL and copy it manually.")
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar ? "اتصالات MCP" : "MCP connections"}</CardTitle>
        <CardDescription>
          {ar
            ? "تستخدم اتصالاتك صلاحيات حسابك في ERP. لا يمكن للموظفين الآخرين الاطلاع على اتصالاتك أو إلغاؤها."
            : "Your connections use your own ERP permissions. Other employees cannot view or revoke them."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{ar ? "حساب ERP" : "ERP account"}</dt><dd className="break-all" dir="auto">{user}</dd></div>
          <div><dt className="text-muted-foreground">{ar ? "الشركة المحددة" : "Selected company"}</dt><dd dir="auto">{company}</dd></div>
        </dl>
        {settings?.endpoint && <div className="flex flex-wrap gap-2">
          <input aria-label={ar ? "رابط خادم MCP" : "MCP server URL"} readOnly value={settings.endpoint} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 text-sm" dir="ltr" />
          <Button variant="outline" size="sm" onClick={() => void copyEndpoint()}><Copy />{ar ? "نسخ الرابط" : "Copy URL"}</Button>
        </div>}
        {settings?.ready && <div className="space-y-2 text-sm">
          <p>{ar ? "أضف هذا الرابط إلى تطبيق MCP الخارجي واختر OAuth. سجل الدخول بحساب ERP الخاص بك ووافق على صلاحية القراءة." : "Add this URL in your external MCP client and choose OAuth. Sign in with your own ERP account and approve read access."}</p>
          <p className="text-muted-foreground">{ar ? "يتاح لك فقط ما تسمح به صلاحياتك في Frappe، بما فيه الأنواع والتقارير المخصصة. إنشاء وتعديل واعتماد المستندات معطل." : "You can read only what your Frappe permissions allow, including custom DocTypes and reports. Creating, editing and submitting ERP records is disabled."}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">OAuth · {settings.scopes.join(" ")}</p>
          <Link href="/workspace#explorer" className="underline underline-offset-4">{ar ? "استعراض مصادر ERP المتاحة لك" : "Browse your ERP sources"}</Link>
        </div>}
        {settings?.reason && <p role="status" className="text-sm text-muted-foreground">{settings.reason}</p>}
        <Button variant="outline" size="sm" disabled={loading || busy || !company} onClick={() => void load()}><RefreshCw />{ar ? "تحديث الاتصالات" : "Refresh connections"}</Button>
        {loading && <p role="status" className="text-sm text-muted-foreground">{ar ? "جارٍ تحميل الاتصالات…" : "Loading connections…"}</p>}
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
        {!loading && !message && settings?.ready && grants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {ar ? "لا توجد اتصالات مصرح بها." : "No authorized connections."}
          </p>
        )}
        {grants.map((g) => (
          <div
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {g.client} · {g.agent}
              </p>
              <p className="text-muted-foreground">
                {g.revoked_at
                  ? ar
                    ? "تم الإلغاء"
                    : "Revoked"
                  : new Date(g.expires_at).toLocaleString(locale)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy || !!g.revoked_at || Date.parse(g.expires_at) <= Date.now()
              }
              onClick={() => void revoke(g.id)}
            >
              {ar ? "إلغاء الوصول" : "Revoke access"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
