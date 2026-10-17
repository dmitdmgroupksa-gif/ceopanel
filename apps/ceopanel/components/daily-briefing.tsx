"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { LoaderCircle, RefreshCw, ArrowUpRight } from "lucide-react"
import { sessionFetch } from "@/lib/session-fetch"
import type { DailyBrief } from "@/lib/erp-native/brief"
import { useSession } from "./session-provider"
import { useLocale } from "./locale-provider"
import { Button } from "./ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card"

export function DailyBriefing() {
  const { context } = useSession()
  return context ? (
    <Briefing
      key={`${context.user}:${context.company}`}
      company={context.company}
    />
  ) : null
}
function Briefing({ company }: { company: string }) {
  const { t, locale } = useLocale()
  const [data, setData] = useState<DailyBrief | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setData(null)
    setError("")
    void sessionFetch(`/api/erp/brief?${new URLSearchParams({ company })}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok)
          throw new Error(body.error || "The briefing could not be loaded.")
        if (!abort.signal.aborted) setData(body)
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false)
      })
    return () => abort.abort()
  }, [company, refresh])
  return (
    <section className="min-w-0 space-y-5" aria-label={t("Daily briefing")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Daily briefing")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Live balances, workflow requests, delays and renewals from your ERP.",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw />
          {t("Refresh briefing")}
        </Button>
      </div>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          {t("Checking ERP sources…")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      {data && (
        <>
          <p className="text-xs text-muted-foreground">
            {company} · {t("As of")}: {data.asOf}.{" "}
            {t(
              "Account-scoped cards can include other companies. Each source states its scope and period.",
            )}
          </p>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            {data.cards.map((card) => (
              <Card key={card.id} className="min-w-0 gap-4">
                <CardHeader>
                  <CardTitle className="text-base">{t(card.title)}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {card.scope === "erp-account"
                      ? t("ERP account scope")
                      : company}{" "}
                    · {t(card.coverageLabel || "As of")}:{" "}
                    {card.coverage === "as-of"
                      ? card.period.to
                      : `${card.period.from} – ${card.period.to}`}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {card.status === "unavailable" ? (
                    <p role="status" className="text-sm text-destructive">
                      {t(card.error || "Source unavailable")}
                    </p>
                  ) : (
                    <dl className="grid gap-4 sm:grid-cols-2">
                      {card.metrics.map((metric) => (
                        <div key={metric.label}>
                          <dt className="text-xs text-muted-foreground">
                            {t(metric.label)}
                          </dt>
                          <dd className="mt-1 text-2xl font-semibold">
                            {metric.value === null
                              ? t("Unavailable")
                              : typeof metric.value === "number"
                                ? metric.format === "currency"
                                  ? new Intl.NumberFormat(locale, {
                                      style: "currency",
                                      currency: data.currency,
                                      maximumFractionDigits: 2,
                                    }).format(metric.value)
                                  : `${metric.value.toLocaleString(locale)}${metric.format === "percent" ? "%" : ""}`
                                : metric.value}
                          </dd>
                          {metric.note && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t(metric.note)}
                            </p>
                          )}
                        </div>
                      ))}
                    </dl>
                  )}
                  {card.note && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t(card.note)}
                    </p>
                  )}
                  {card.status === "ready" && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/#${card.id}`}>
                        {t("View source dashboard")}
                        <ArrowUpRight />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
