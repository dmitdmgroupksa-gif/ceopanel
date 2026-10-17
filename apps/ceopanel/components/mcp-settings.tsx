"use client"
import { sessionFetch as fetch } from "@/lib/session-fetch"
import { useCallback, useEffect, useRef, useState } from "react"
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
export function MCPSettings({ company }: { company: string }) {
  const { locale } = useLocale(),
    ar = locale === "ar"
  const [grants, setGrants] = useState<Grant[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const pendingLoad = useRef(0)
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const request = ++pendingLoad.current
      setGrants([])
      setMessage("")
      if (!company) return
      try {
        const response = await fetch(
          `/api/mcp/oauth/grants?${new URLSearchParams({ company })}`,
          { signal, cache: "no-store" },
        )
        const data = await response.json()
        if (!response.ok) throw new Error(data.error_description)
        if (!signal?.aborted && request === pendingLoad.current) setGrants(data)
      } catch (e) {
        if (!signal?.aborted && request === pendingLoad.current)
          setMessage(e instanceof Error ? e.message : "MCP unavailable.")
      }
    },
    [company],
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar ? "اتصالات MCP" : "MCP connections"}</CardTitle>
        <CardDescription>
          {ar
            ? "تستخدم الوكلاء أدوات الشركة المشتركة. تتطلب التطبيقات الخارجية تسجيل الدخول والموافقة."
            : "Agents use the shared business tools. External applications require sign-in and consent."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="break-all rounded-md border bg-muted p-3 text-sm"
          dir="ltr"
        >
          /api/mcp
        </p>
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
        {!message && grants.length === 0 && (
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
