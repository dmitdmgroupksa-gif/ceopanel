"use client"
import { sessionFetch as fetch } from "@/lib/session-fetch"
import { useEffect, useState } from "react"
import type { configurationReadiness } from "@/lib/platform/readiness"
import { useLocale } from "./locale-provider"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"

type Report = ReturnType<typeof configurationReadiness>
export function RolloutReadiness({ company }: { company?: string }) {
  const { t } = useLocale()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    setReport(null)
    setError("")
    setBusy(false)
    if (!company || refresh === 0) return
    setBusy(true)
    void fetch(`/api/platform/readiness?${new URLSearchParams({ company })}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok)
          throw new Error(
            data.error || "Unable to check rollout configuration.",
          )
        if (!abort.signal.aborted) setReport(data)
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Unable to check rollout configuration.",
          )
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false)
      })
    return () => abort.abort()
  }, [company, refresh])
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Rollout checklist")}</CardTitle>
        <CardDescription>
          {t(
            "ERP reads work without AI. Review optional assistants, approvals and channels when needed. System Manager access is required.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          disabled={!company || busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {t(busy ? "Checking configuration…" : "Check rollout configuration")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(error)}
          </p>
        )}
        {report && (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              {t(
                "Configuration checks do not replace live ERP, KPI, AI and delivery acceptance tests.",
              )}
            </p>
            <ol className="space-y-3">
              {report.checks.map((check) => (
                <li key={check.id} className="space-y-1 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {t(check.title)}
                    </span>
                    <Badge variant="outline">
                      {t(
                        check.state === "pass"
                          ? "Configured"
                          : check.state === "disabled"
                            ? "Disabled"
                            : "Needs configuration",
                      )}
                    </Badge>
                  </div>
                  <p className="break-words text-xs text-muted-foreground">
                    {t(check.detail)}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  )
}
