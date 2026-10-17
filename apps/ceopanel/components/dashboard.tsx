"use client"
import { ALL_COMPANIES } from "@/lib/company-scope"
import { sessionFetch as fetch } from "@/lib/session-fetch"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Eye,
  FileText,
  Building2,
  Factory,
  MonitorCog,
  HandCoins,
  Landmark,
  LoaderCircle,
  RefreshCw,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  dashboards,
  emptyDashboard,
  findDashboard,
  type DashboardData,
  type DashboardId,
} from "@/lib/dashboards"
import { DashboardPanel } from "./dashboard-panel"
import { PlatformLinks, IconHint } from "./platform-links"
import { useSession } from "./session-provider"
import { useLocale } from "./locale-provider"

const icons = {
  comparison: ArrowLeftRight,
  quotations: ClipboardList,
  insights: ChartNoAxesCombined,
  payments: HandCoins,
  hr: Users,
  analytics: Eye,
  reports: Bell,
  logistics: Truck,
  attendance: CalendarDays,
  approvals: CircleCheck,
  purchase: ShoppingCart,
  sales: FileText,
  tasks: BriefcaseBusiness,
  stock: Boxes,
  accounts: Landmark,
  receivables: Wallet,
  salespeople: Users,
  crm: BarChart3,
  facilities: Building2,
  it: MonitorCog,
  factory: Factory,
}
type Config = {
  timezone: string
  today: string
}

export function Dashboard({
  config,
  initialDashboard = dashboards[0].id,
}: {
  config: Config
  initialDashboard?: DashboardId
}) {
  const { t, locale } = useLocale()
  const { context, setContext, preview } = useSession()
  const [active, setActive] = useState<DashboardId>(initialDashboard)
  const [days, setDays] = useState(initialDashboard === "approvals" ? 30 : 90)
  const [data, setData] = useState<DashboardData>(() =>
    emptyDashboard(findDashboard(initialDashboard)!, config.today)
  )
  const [error, setError] = useState<string | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [explicitDashboard, setExplicitDashboard] = useState(
    initialDashboard !== dashboards[0].id
  )
  const nav = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ left: false, right: false })
  const controller = useRef<AbortController | null>(null)
  const connection = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const definition = findDashboard(active)!
  const queryKey = JSON.stringify([
    active,
    context?.user,
    context?.company,
    days,
  ])
  const permitted =
    !context?.dashboardIds || context.dashboardIds.includes(active)
  const visibleDashboards = context?.dashboardIds
    ? dashboards.filter((item) => context.dashboardIds!.includes(item.id))
    : dashboards
  const visibleData =
    permitted &&
    loadedKey === queryKey &&
    data.dashboardId === active &&
    data.company === (context?.company ?? null)
      ? data
      : emptyDashboard(definition, config.today, days, context?.company)

  useEffect(() => {
    setMounted(true)
    const followHash = () => {
      const selected = findDashboard(window.location.hash.slice(1))
      if (selected) {
        setExplicitDashboard(true)
        setActive(selected.id)
        if (selected.id === "approvals") setDays(30)
      }
    }
    followHash()
    window.addEventListener("hashchange", followHash)
    return () => {
      window.removeEventListener("hashchange", followHash)
      controller.current?.abort()
      connection.current?.abort()
    }
  }, [])

  useEffect(() => {
    const element = nav.current
    if (!element) return
    const update = () =>
      setScroll({
        left: Math.abs(element.scrollLeft) > 2,
        right:
          Math.abs(element.scrollLeft) + element.clientWidth <
          element.scrollWidth - 2,
      })
    update()
    element.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      element.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    nav.current
      ?.querySelector(`[data-state="active"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  const refresh = useCallback(async () => {
    controller.current?.abort()
    const token = ++sequence.current
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError(null)
    if (preview) {
      setData(emptyDashboard(definition, config.today, days))
      setLoadedKey(queryKey)
      setBusy(false)
      return
    }
    if (!permitted) {
      setBusy(false)
      return
    }
    try {
      const params = new URLSearchParams({ days: String(days) })
      if (context?.company) params.set("company", context.company)
      const response = await fetch(`/api/dashboards/${active}?${params}`, {
        cache: "no-store",
        signal: abort.signal,
      })
      if (token !== sequence.current || abort.signal.aborted) return
      // sessionFetch notifies the shared provider before any body parsing.
      if (response.status === 401) return
      const body = await response.json()
      if (token !== sequence.current || abort.signal.aborted) return
      if (!response.ok)
        throw new Error(body.error || "Dashboard data could not be loaded.")
      if (token === sequence.current) {
        setData({
          ...body,
          company:
            body.status === "awaiting-data"
              ? (context?.company ?? null)
              : body.company,
        })
        setLoadedKey(queryKey)
      }
    } catch (cause) {
      if (token === sequence.current && !abort.signal.aborted) {
        setData(
          emptyDashboard(definition, config.today, days, context?.company)
        )
        setLoadedKey(null)
        setError(
          cause instanceof Error
            ? cause.message
            : "Dashboard data could not be loaded."
        )
      }
    } finally {
      if (token === sequence.current) setBusy(false)
    }
  }, [
    active,
    days,
    context?.company,
    permitted,
    queryKey,
    preview,
    definition,
    config.today,
  ])

  useEffect(() => {
    void refresh()
    return () => controller.current?.abort()
  }, [refresh])
  useEffect(() => {
    if (data.status !== "ready" || busy) return
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") void refresh()
      },
      active === "approvals" ? 300000 : 60000
    )
    return () => clearInterval(timer)
  }, [data.status, busy, refresh, active])

  useEffect(() => {
    if (
      !explicitDashboard &&
      !findDashboard(window.location.hash.slice(1)) &&
      visibleDashboards.length &&
      !visibleDashboards.some((item) => item.id === active)
    )
      setActive(visibleDashboards[0].id)
  }, [context?.dashboardIds, active, explicitDashboard])

  function navigate(id: string) {
    const selected = findDashboard(id)
    if (selected && visibleDashboards.some((d) => d.id === selected.id)) {
      setExplicitDashboard(true)
      if (selected.id === "approvals" && active !== selected.id) setDays(30)
      setActive(selected.id)
      window.history.pushState(null, "", `#${selected.id}`)
    }
  }

  async function connect(company?: string) {
    connection.current?.abort()
    const abort = new AbortController()
    connection.current = abort
    setConnectionError(null)
    try {
      const params = company ? `?company=${encodeURIComponent(company)}` : ""
      const response = await fetch(`/api/erpnext/context${params}`, {
        cache: "no-store",
        signal: abort.signal,
      })
      if (
        abort.signal.aborted ||
        connection.current !== abort ||
        response.status === 401
      )
        return
      const body = await response.json()
      if (abort.signal.aborted || connection.current !== abort) return
      if (!response.ok)
        throw new Error(body.error || "ERPNext connection could not be loaded.")
      setContext(body)
    } catch (cause) {
      if (abort.signal.aborted || connection.current !== abort) return
      setConnectionError(
        cause instanceof Error
          ? cause.message
          : "ERPNext connection could not be loaded."
      )
    }
  }

  return (
    <div className="min-h-screen" data-hydrated={mounted}>
      <Tabs
        value={active}
        onValueChange={navigate}
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="gap-0"
      >
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center gap-1 px-3 sm:px-6 lg:px-8">
            <PlatformLinks compact />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Scroll dashboard tabs left"
              className={!scroll.left && !scroll.right ? "hidden" : undefined}
              disabled={!scroll.left}
              onClick={() =>
                nav.current?.scrollBy({
                  left: locale === "ar" ? 400 : -400,
                  behavior: "smooth",
                })
              }
            >
              <ChevronLeft />
            </Button>
            <div
              ref={nav}
              className="min-w-0 flex-1 overflow-x-auto pb-[5px] [scrollbar-width:none]"
            >
              <TabsList
                variant="line"
                aria-label="CEO dashboards"
                className="min-h-14 gap-2"
              >
                {visibleDashboards.map((item) => {
                  const Icon = icons[item.icon]
                  return (
                    <IconHint key={item.id} label={t(item.title)}>
                      <TabsTrigger
                        value={item.id}
                        aria-label={t(item.title)}
                        className="dashboard-icon flex-none size-11 min-h-11 max-h-11 rounded-lg px-0"
                      >
                        <Icon aria-hidden="true" className="size-[18px]" />
                      </TabsTrigger>
                    </IconHint>
                  )
                })}
              </TabsList>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Scroll dashboard tabs right"
              className={!scroll.left && !scroll.right ? "hidden" : undefined}
              disabled={!scroll.right}
              onClick={() =>
                nav.current?.scrollBy({
                  left: locale === "ar" ? -400 : 400,
                  behavior: "smooth",
                })
              }
            >
              <ChevronRight />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {(connectionError || error) && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
            >
              {t(connectionError || error || "")}
            </div>
          )}
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
                {t(
                  visibleDashboards.length || explicitDashboard
                    ? definition.title
                    : "No dashboards assigned."
                )}
              </h1>
              {!visibleDashboards.length && !explicitDashboard && (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t(
                    "Ask your administrator to configure your department views."
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select
                  aria-label={t("Choose dashboard")}
                  className="h-9 max-w-full appearance-none rounded-md border bg-background py-1 pl-3 pr-8 text-sm shadow-xs"
                  value={permitted ? active : ""}
                  disabled={!visibleDashboards.length}
                  onChange={(event) => navigate(event.target.value)}
                >
                  {!permitted && (
                    <option value="" disabled>
                      {t("Choose dashboard")}
                    </option>
                  )}
                  {visibleDashboards.map((item) => (
                    <option key={item.id} value={item.id}>
                      {t(item.title)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-3.5 text-muted-foreground" />
              </div>
              {definition.scope === "erp-account" ? (
                <span className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                  {t("ERP account scope")}
                </span>
              ) : (
                context &&
                context.companies.length > 1 && (
                  <select
                    aria-label={t("Select company")}
                    className="h-9 max-w-48 rounded-md border bg-background px-3 text-sm"
                    value={context.company}
                    onChange={(event) => void connect(event.target.value)}
                  >
                    <option value={ALL_COMPANIES}>{t("All Companies")}</option>
                    {context.companies.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )
              )}
              {definition.window !== "current" && (
                <select
                  aria-label={t("Reporting period")}
                  className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs"
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                >
                  <option value={30}>
                    {t(
                      definition.window === "upcoming"
                        ? "Next 30 days"
                        : "Last 30 days"
                    )}
                  </option>
                  <option value={90}>
                    {t(
                      definition.window === "upcoming"
                        ? "Next 90 days"
                        : "Last 90 days"
                    )}
                  </option>
                  <option value={365}>
                    {t(
                      definition.window === "upcoming"
                        ? "Next 12 months"
                        : "Last 12 months"
                    )}
                  </option>
                </select>
              )}
              <Button
                variant="outline"
                size="icon-sm"
                className="h-9"
                aria-label={t("Refresh")}
                title={t("Refresh")}
                aria-busy={busy}
                disabled={busy || !visibleDashboards.length}
                onClick={() => void refresh()}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {definition.window === "current"
                ? `${t("As of")} ${visibleData.period.to}`
                : `${visibleData.period.from} – ${visibleData.period.to}`}
            </span>
            <span role="status" aria-live="polite">
              {busy
                ? t("Loading dashboard…")
                : visibleData.updatedAt
                  ? `${t("Last updated")} ${new Date(visibleData.updatedAt).toLocaleTimeString(locale, { timeZone: config.timezone, hour: "2-digit", minute: "2-digit" })}`
                  : null}
            </span>
          </div>
          {!permitted && explicitDashboard ? (
            <section role="alert" className="rounded-lg border bg-muted/20 p-8">
              <h2 className="font-medium">{t("No access")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  "Your Frappe permissions do not allow this dashboard. Choose an available dashboard or ask your ERP administrator."
                )}
              </p>
            </section>
          ) : (
            visibleDashboards.map((item) => (
              <TabsContent key={item.id} value={item.id}>
                <DashboardPanel
                  definition={item}
                  data={visibleData}
                  siteUrl={context?.siteUrl}
                  loading={busy}
                  failed={!!error}
                />
              </TabsContent>
            ))
          )}
        </main>
      </Tabs>
    </div>
  )
}
