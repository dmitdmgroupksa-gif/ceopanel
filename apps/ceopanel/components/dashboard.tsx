"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Eye,
  FileText,
  HandCoins,
  Landmark,
  LoaderCircle,
  LogOut,
  Moon,
  RefreshCw,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  Wallet,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  dashboards,
  emptyDashboard,
  findDashboard,
  type DashboardData,
  type DashboardId,
} from "@/lib/dashboards"
import type { DashboardContext } from "@/lib/dashboard-server"
import { DashboardPanel } from "./dashboard-panel"
import { LoginDialog } from "./login-dialog"

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
}
type Config = {
  companyName: string
  siteUrl: string
  timezone: string
  today: string
}

export function Dashboard({
  initial,
  initialError,
  config,
}: {
  initial: DashboardContext | null
  initialError: string | null
  config: Config
}) {
  const [context, setContext] = useState(initial)
  const [active, setActive] = useState<DashboardId>(dashboards[0].id)
  const [days, setDays] = useState(90)
  const [data, setData] = useState<DashboardData>(() =>
    emptyDashboard(dashboards[0], config.today)
  )
  const [error, setError] = useState(initialError)
  const [connectionError, setConnectionError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const nav = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ left: false, right: false })
  const controller = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const { resolvedTheme, setTheme } = useTheme()
  const definition = findDashboard(active)!
  const visibleData =
    data.dashboardId === active && data.company === (context?.company ?? null)
      ? data
      : emptyDashboard(definition, config.today, days, context?.company)

  useEffect(() => {
    setMounted(true)
    const followHash = () => {
      const selected = findDashboard(window.location.hash.slice(1))
      if (selected) setActive(selected.id)
    }
    followHash()
    window.addEventListener("hashchange", followHash)
    return () => {
      window.removeEventListener("hashchange", followHash)
      controller.current?.abort()
    }
  }, [])

  useEffect(() => {
    const element = nav.current
    if (!element) return
    const update = () =>
      setScroll({
        left: element.scrollLeft > 2,
        right:
          element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
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
    try {
      const params = new URLSearchParams({ days: String(days) })
      if (context?.company) params.set("company", context.company)
      const response = await fetch(`/api/dashboards/${active}?${params}`, {
        cache: "no-store",
        signal: abort.signal,
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "Dashboard data could not be loaded.")
      if (token === sequence.current)
        setData({
          ...body,
          company:
            body.status === "awaiting-data"
              ? (context?.company ?? null)
              : body.company,
        })
    } catch (cause) {
      if (token === sequence.current && !abort.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Dashboard data could not be loaded."
        )
    } finally {
      if (token === sequence.current) setBusy(false)
    }
  }, [active, days, context?.company])

  useEffect(() => {
    void refresh()
    return () => controller.current?.abort()
  }, [refresh])
  useEffect(() => {
    if (data.status !== "ready" || busy) return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 60000)
    return () => clearInterval(timer)
  }, [data.status, busy, refresh])

  function navigate(id: string) {
    const selected = findDashboard(id)
    if (selected) {
      setActive(selected.id)
      window.history.pushState(null, "", `#${selected.id}`)
    }
  }

  async function connect(company?: string) {
    setConnectionError(null)
    try {
      const params = company ? `?company=${encodeURIComponent(company)}` : ""
      const response = await fetch(`/api/erpnext/context${params}`, {
        cache: "no-store",
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "ERPNext connection could not be loaded.")
      setContext(body)
    } catch (cause) {
      setConnectionError(
        cause instanceof Error
          ? cause.message
          : "ERPNext connection could not be loaded."
      )
    }
  }

  async function signOut() {
    controller.current?.abort()
    ++sequence.current
    setBusy(true)
    try {
      const response = await fetch("/api/erpnext/session", { method: "DELETE" })
      if (!response.ok) throw new Error("Sign-out failed. Please try again.")
      setContext(null)
      setData(emptyDashboard(definition, config.today, days))
      setError(null)
      setConnectionError(null)
    } catch (cause) {
      setConnectionError(
        cause instanceof Error ? cause.message : "Sign-out failed."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen" data-hydrated={mounted}>
      <Tabs value={active} onValueChange={navigate} className="gap-0">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex min-h-18 max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <a
              href="#sales-comparison"
              onClick={(event) => {
                event.preventDefault()
                navigate("sales-comparison")
              }}
              className="flex min-w-0 items-center gap-3 rounded focus-visible:ring-2"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Building2 className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold sm:text-base">
                  {config.companyName}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  CEO management platform
                </span>
              </span>
            </a>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Badge
                variant="outline"
                className="hidden font-normal md:inline-flex"
              >
                {dashboards.length} CEO dashboards
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle color theme"
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
              >
                {mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
              </Button>
              {context ? (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Sign out"
                  onClick={signOut}
                  disabled={busy}
                >
                  <LogOut />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              ) : (
                <Button size="sm" onClick={() => setConnectOpen(true)}>
                  Connect ERPNext
                </Button>
              )}
            </div>
          </div>
          <div className="mx-auto flex max-w-[1600px] items-center gap-1 px-3 sm:px-6 lg:px-8">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Scroll dashboard tabs left"
              disabled={!scroll.left}
              onClick={() =>
                nav.current?.scrollBy({ left: -400, behavior: "smooth" })
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
                className="h-12 gap-2"
              >
                {dashboards.map((item) => {
                  const Icon = icons[item.icon]
                  return (
                    <TabsTrigger
                      key={item.id}
                      value={item.id}
                      className="flex-none gap-2 px-3"
                    >
                      <Icon className="size-4" />
                      {item.title}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Scroll dashboard tabs right"
              disabled={!scroll.right}
              onClick={() =>
                nav.current?.scrollBy({ left: 400, behavior: "smooth" })
              }
            >
              <ChevronRight />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">
                Dashboard data setup pending.
              </span>{" "}
              Your company data will appear as each dashboard is connected.
            </p>
            <Badge variant="outline" className="gap-1.5 font-normal">
              <span
                className={`size-1.5 rounded-full ${context ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
              />
              {context ? "ERPNext connected" : "ERPNext ready to connect"}
            </Badge>
          </div>
          {(connectionError || error) && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
            >
              {connectionError || error}
              {error && visibleData.status === "ready" && (
                <span className="block pt-1 text-xs">
                  Showing the last successful data for {visibleData.company}.
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
            <div className="min-w-0">
              <p className="mb-2 text-xs text-muted-foreground">
                {context?.company || config.companyName} / Dashboards
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
                {definition.title}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {definition.description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select
                  aria-label="Choose dashboard"
                  className="h-9 max-w-full appearance-none rounded-md border bg-background py-1 pl-3 pr-8 text-sm shadow-xs"
                  value={active}
                  onChange={(event) => navigate(event.target.value)}
                >
                  {dashboards.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-3.5 text-muted-foreground" />
              </div>
              {context && context.companies.length > 1 && (
                <select
                  aria-label="Select company"
                  className="h-9 max-w-48 rounded-md border bg-background px-3 text-sm"
                  value={context.company}
                  onChange={(event) => void connect(event.target.value)}
                >
                  {context.companies.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Reporting period"
                className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last 12 months</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={busy}
                onClick={() => void refresh()}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                {busy ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {visibleData.period.from} – {visibleData.period.to}
            </span>
            <span role="status" aria-live="polite">
              {busy
                ? "Loading dashboard…"
                : visibleData.updatedAt
                  ? `Last updated ${new Date(visibleData.updatedAt).toLocaleTimeString("en", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit" })}`
                  : "Awaiting your data source"}
            </span>
          </div>
          {dashboards.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              <DashboardPanel definition={item} data={visibleData} />
            </TabsContent>
          ))}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-5 text-[11px] text-muted-foreground">
            <span>{config.companyName} · CEO Panel</span>
            <span>
              {context
                ? `Signed in as ${context.user}`
                : `Prepared for ${new URL(config.siteUrl).host}`}
            </span>
          </footer>
        </main>
      </Tabs>
      <LoginDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        siteUrl={config.siteUrl}
        onConnected={() => connect()}
      />
    </div>
  )
}
