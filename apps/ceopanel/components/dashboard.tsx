"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  ShoppingCart,
  Sun,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { demoSnapshot } from "@/lib/demo"
import { type Snapshot, type SourceKey } from "@/lib/model"
import { LoginDialog } from "./login-dialog"
import { MetricCards } from "./metrics"
import { Overview } from "./overview"
import { RecordsTable, tables } from "./records-table"
import { Reports } from "./reports"

const modules = [
  {
    id: "overview",
    title: "Overview",
    description:
      "A clear view of company performance and what needs your attention.",
    icon: LayoutDashboard,
  },
  {
    id: "finance",
    title: "Finance",
    description:
      "Monitor billing, receivables, and payables across your company.",
    icon: Wallet,
  },
  {
    id: "sales",
    title: "Sales",
    description: "Track customer orders, delivery progress, and billed sales.",
    icon: TrendingUp,
  },
  {
    id: "purchasing",
    title: "Purchasing",
    description:
      "Review supplier commitments, incoming orders, and payments due.",
    icon: ShoppingCart,
  },
  {
    id: "projects",
    title: "Projects",
    description: "Keep current work, priorities, and project progress in view.",
    icon: BriefcaseBusiness,
  },
  {
    id: "people",
    title: "People",
    description: "Your company’s active team, roles, and departments.",
    icon: Users,
  },
  {
    id: "reports",
    title: "Reports",
    description: "Review monthly performance and export management reports.",
    icon: BarChart3,
  },
]

type Config = {
  companyName: string
  siteUrl: string
  timezone: string
  today: string
}

function SourceTabs({
  snapshot,
  sources,
  search,
  selected,
}: {
  snapshot: Snapshot
  sources: SourceKey[]
  search: string
  selected?: SourceKey
}) {
  return (
    <Tabs
      key={selected}
      defaultValue={
        selected && sources.includes(selected) ? selected : sources[0]
      }
      className="gap-4"
    >
      <div className="overflow-x-auto">
        <TabsList aria-label="Record types">
          {sources.map((source) => (
            <TabsTrigger value={source} key={source} className="px-4">
              {tables[source].title}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {sources.map((source) => (
        <TabsContent value={source} key={source}>
          <RecordsTable
            snapshot={snapshot}
            source={source}
            globalSearch={search}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}

export function Dashboard({
  initial,
  initialError,
  config,
}: {
  initial: Snapshot | null
  initialError: string | null
  config: Config
}) {
  const [snapshot, setSnapshot] = useState(initial)
  const [active, setActive] = useState("overview")
  const [days, setDays] = useState(initial?.period.days ?? 90)
  const [company, setCompany] = useState(
    initial?.mode === "live" ? initial.company : ""
  )
  const [search, setSearch] = useState("")
  const [selectedSource, setSelectedSource] = useState<SourceKey | undefined>()
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const hash = window.location.hash.slice(1)
    if (modules.some((module) => module.id === hash)) setActive(hash)
    return () => controller.current?.abort()
  }, [])

  const refresh = useCallback(
    async (nextDays = days, nextCompany = company, forceLive = false) => {
      controller.current?.abort()
      const token = ++sequence.current
      if (snapshot?.mode === "preview" && !forceLive) {
        setSnapshot(
          demoSnapshot(
            config.today,
            nextDays,
            config.siteUrl,
            config.timezone,
            config.companyName
          )
        )
        setError(null)
        return
      }
      const abort = new AbortController()
      controller.current = abort
      setBusy(true)
      setError(null)
      try {
        const params = new URLSearchParams({ days: String(nextDays) })
        if (nextCompany) params.set("company", nextCompany)
        const response = await fetch(`/api/erpnext/snapshot?${params}`, {
          cache: "no-store",
          signal: abort.signal,
        })
        const body = await response.json()
        if (!response.ok) {
          if (response.status === 401 && token === sequence.current)
            setSessionExpired(true)
          throw new Error(body.error || "Company data could not be loaded.")
        }
        if (token === sequence.current) {
          setSnapshot(body)
          setCompany(body.company)
          setDays(body.period.days)
          setSessionExpired(false)
        }
      } catch (cause) {
        if (token === sequence.current && !abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Company data could not be loaded."
          )
      } finally {
        if (token === sequence.current) setBusy(false)
      }
    },
    [days, company, snapshot?.mode, config]
  )

  useEffect(() => {
    if (snapshot?.mode !== "live" || sessionExpired || busy) return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 60000)
    return () => clearInterval(timer)
  }, [snapshot?.mode, sessionExpired, busy, refresh])

  function navigate(tab: string, source?: SourceKey) {
    setActive(tab)
    setSelectedSource(source)
    setSearch("")
    window.history.replaceState(null, "", `#${tab}`)
  }
  async function signOut() {
    controller.current?.abort()
    ++sequence.current
    setBusy(true)
    try {
      const response = await fetch("/api/erpnext/session", { method: "DELETE" })
      if (!response.ok) throw new Error("Sign-out failed. Please try again.")
      setSnapshot(
        demoSnapshot(
          config.today,
          days,
          config.siteUrl,
          config.timezone,
          config.companyName
        )
      )
      setCompany("")
      setError(null)
      setSessionExpired(false)
      setSearch("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed.")
    } finally {
      setBusy(false)
    }
  }
  const module = modules.find((item) => item.id === active) ?? modules[0]
  const live = snapshot?.mode === "live"
  const unavailable = snapshot
    ? Object.values(snapshot.sources).filter((source) => source.error).length
    : 0
  return (
    <div className="min-h-screen">
      <Tabs value={active} onValueChange={navigate} className="gap-0">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <a
              href="#overview"
              onClick={(event) => {
                event.preventDefault()
                navigate("overview")
              }}
              className="flex shrink-0 items-center gap-3 rounded-md focus-visible:ring-2"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Building2 className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold tracking-tight sm:text-base">
                  {config.companyName}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  CEO management platform
                </span>
              </span>
            </a>
            <div className="relative hidden max-w-xs flex-1 lg:block">
              <Search
                className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="Search current view"
                placeholder="Search current view…"
                className="bg-muted/40 pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={active === "reports"}
              />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Badge
                variant="outline"
                className="hidden gap-1.5 font-normal sm:inline-flex"
              >
                <span
                  className={`size-1.5 rounded-full ${live && !error && !unavailable ? "bg-emerald-500" : "bg-amber-500"}`}
                />
                {live
                  ? error
                    ? "Refresh failed"
                    : unavailable
                      ? "Partially loaded"
                      : "ERPNext connected"
                  : "Preview"}
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
              {live ? (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Sign out"
                  disabled={busy}
                  onClick={signOut}
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
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="min-w-0 overflow-x-auto pb-[5px]">
              <TabsList
                variant="line"
                aria-label="Company management"
                className="h-12 gap-2 sm:gap-4"
              >
                {modules.map((item) => (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className="flex-none gap-2 px-3"
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <span className="ml-8 hidden shrink-0 pb-1 text-xs text-muted-foreground xl:block">
              Company workspace
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {snapshot?.mode === "preview" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">
                  Preview data.
                </span>{" "}
                Connect ERPNext to see your company’s live records.
              </p>
              <button
                className="text-xs font-medium underline underline-offset-4"
                onClick={() => setConnectOpen(true)}
              >
                Connect {new URL(config.siteUrl).host}
              </button>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
            >
              {error}
              {live && (
                <span className="block pt-1 text-xs">
                  Displaying the last successful snapshot for {snapshot.company}
                  , {snapshot.period.from} – {snapshot.period.to}.
                </span>
              )}
              {sessionExpired && (
                <button
                  onClick={() => setConnectOpen(true)}
                  className="mt-2 underline underline-offset-4"
                >
                  Sign in again
                </button>
              )}
            </div>
          )}
          {unavailable > 0 && (
            <div
              role="status"
              className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
            >
              {unavailable} data source{unavailable === 1 ? " is" : "s are"}{" "}
              unavailable. Affected totals are shown as unavailable; details
              appear in each module.
            </div>
          )}
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{snapshot?.company || config.companyName}</span>
                <span>/</span>
                <span>{module.title}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
                {active === "overview" ? "Company overview" : module.title}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {module.description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {live && snapshot.companies.length > 1 && (
                <div className="relative">
                  <select
                    aria-label="Select company"
                    className="h-9 max-w-48 appearance-none rounded-md border bg-background py-1 pl-3 pr-8 text-sm"
                    value={company}
                    onChange={(event) => {
                      const next = event.target.value
                      setCompany(next)
                      void refresh(days, next)
                    }}
                  >
                    {snapshot.companies.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="relative">
                <select
                  aria-label="Reporting period"
                  className="h-9 appearance-none rounded-md border bg-background py-1 pl-3 pr-8 text-sm shadow-xs"
                  value={days}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    setDays(next)
                    void refresh(next)
                  }}
                >
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={365}>Last 12 months</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-3.5 text-muted-foreground" />
              </div>
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
                <span>{busy ? "Refreshing…" : "Refresh"}</span>
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a
                  href={`${config.siteUrl}/app`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open company ERPNext"
                >
                  <ExternalLink />
                </a>
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {snapshot
                ? `${snapshot.period.from} – ${snapshot.period.to} · ${snapshot.currency}`
                : "Waiting for company data"}
            </span>
            <span role="status" aria-live="polite">
              {busy
                ? "Loading company records…"
                : snapshot?.syncedAt
                  ? `Last refreshed ${new Date(snapshot.syncedAt).toLocaleTimeString("en", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit" })} ${sessionExpired ? "· refresh paused" : "· auto-refresh every minute"}`
                  : "Illustrative records · not company data"}
            </span>
          </div>
          <div className="relative lg:hidden">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search current view"
              placeholder="Search current view…"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={active === "reports"}
            />
          </div>
          {snapshot ? (
            <>
              <TabsContent value="overview">
                <Overview
                  snapshot={snapshot}
                  search={search}
                  navigate={navigate}
                />
              </TabsContent>
              <TabsContent value="finance" className="space-y-6">
                <MetricCards snapshot={snapshot} kind="finance" />
                <SourceTabs
                  selected={selectedSource}
                  snapshot={snapshot}
                  sources={[
                    "receivables",
                    "payables",
                    "salesInvoices",
                    "purchaseInvoices",
                  ]}
                  search={search}
                />
              </TabsContent>
              <TabsContent value="sales" className="space-y-6">
                <MetricCards snapshot={snapshot} kind="sales" />
                <SourceTabs
                  selected={selectedSource}
                  snapshot={snapshot}
                  sources={["salesOrders", "salesInvoices"]}
                  search={search}
                />
              </TabsContent>
              <TabsContent value="purchasing" className="space-y-6">
                <MetricCards snapshot={snapshot} kind="purchasing" />
                <SourceTabs
                  selected={selectedSource}
                  snapshot={snapshot}
                  sources={["purchaseOrders", "payables", "purchaseInvoices"]}
                  search={search}
                />
              </TabsContent>
              <TabsContent value="projects" className="space-y-6">
                <MetricCards snapshot={snapshot} kind="projects" />
                <RecordsTable
                  snapshot={snapshot}
                  source="projects"
                  globalSearch={search}
                />
              </TabsContent>
              <TabsContent value="people" className="space-y-6">
                <MetricCards snapshot={snapshot} kind="people" />
                <RecordsTable
                  snapshot={snapshot}
                  source="employees"
                  globalSearch={search}
                />
              </TabsContent>
              <TabsContent value="reports">
                <Reports snapshot={snapshot} />
              </TabsContent>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <Building2 className="mx-auto mb-4 size-8 text-muted-foreground" />
              <h2 className="font-medium">Your company workspace</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Connect your ERPNext account to load company records. If you
                have signed in, try refreshing or check your company
                permissions.
              </p>
              <Button className="mt-5" onClick={() => setConnectOpen(true)}>
                Connect ERPNext
              </Button>
              <Button
                className="ml-2 mt-5"
                variant="outline"
                onClick={signOut}
                disabled={busy}
              >
                Sign out
              </Button>
            </div>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-5 text-[11px] text-muted-foreground">
            <span>{config.companyName} · CEO Panel</span>
            <span>
              {live
                ? `Signed in as ${snapshot.user} · ERPNext is the source of record`
                : `Prepared for ${new URL(config.siteUrl).host}`}
            </span>
          </footer>
        </main>
      </Tabs>
      <LoginDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        siteUrl={config.siteUrl}
        onConnected={async () => {
          setSnapshot(null)
          setCompany("")
          setSessionExpired(false)
          await refresh(days, "", true)
        }}
      />
    </div>
  )
}
