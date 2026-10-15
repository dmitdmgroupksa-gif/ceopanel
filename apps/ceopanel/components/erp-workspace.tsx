"use client"
import { useLocale } from "./locale-provider"
import Link from "next/link"
import { PlatformLinks } from "./platform-links"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Building2,
  Download,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { DashboardContext } from "@/lib/dashboard-server"
import {
  pendingSchema,
  type ModuleSchema,
  type RecordValues,
  type ReportData,
  type ReportDefinition,
  type WorkspaceModule,
  type WorkspaceRecord,
} from "@/lib/workspace"
import { LoginDialog } from "./login-dialog"
import { downloadCSV } from "./records-table"
import { WorkspaceEditor } from "./workspace-editor"
import { WorkspaceFields } from "./workspace-fields"

export function ERPWorkspace({
  modules,
  reports,
  initial,
  initialError,
  config,
}: {
  modules: WorkspaceModule[]
  reports: ReportDefinition[]
  initial: DashboardContext | null
  initialError: string | null
  config: { companyName: string; siteUrl: string }
}) {
  const { t, locale } = useLocale()
  const [context, setContext] = useState(initial)
  const [mode, setMode] = useState("records")
  const [selected, setSelected] = useState(modules[0].id)
  const [schema, setSchema] = useState<ModuleSchema>(pendingSchema(modules[0]))
  const [records, setRecords] = useState<WorkspaceRecord[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const [connectOpen, setConnectOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [record, setRecord] = useState<WorkspaceRecord | null>(null)
  const [reportId, setReportId] = useState(reports[0]?.id || "")
  const [filters, setFilters] = useState<RecordValues>({})
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const requestId = useRef(0)
  const operationId = useRef(0)
  const abort = useRef<AbortController | null>(null)
  const custom = modules.filter((module) => module.custom)
  const shownModules =
    mode === "custom" ? custom : modules.filter((module) => !module.custom)
  const module = modules.find((item) => item.id === selected) ?? modules[0]
  const activeReport = reports.find((report) => report.id === reportId)
  const companyQuery = context?.company
    ? `company=${encodeURIComponent(context.company)}`
    : ""
  const ready = schema.module.id === selected && schema.ready && !!context
  const base = `/api/workspace/modules/${encodeURIComponent(selected)}`
  const effectiveSchema =
    schema.module.id === selected ? schema : pendingSchema(module)

  useEffect(() => {
    const follow = () => {
      const id = window.location.hash.slice(1)
      const target = modules.find((item) => item.id === id)
      if (target) {
        setSelected(target.id)
        setMode(target.custom ? "custom" : t("records"))
      }
    }
    follow()
    window.addEventListener("hashchange", follow)
    return () => {
      window.removeEventListener("hashchange", follow)
      abort.current?.abort()
    }
  }, [modules])

  const load = useCallback(async () => {
    if (mode === "reports" || (mode === "custom" && custom.length === 0)) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    const token = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`${base}?${companyQuery}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      const meta = await response.json()
      if (!response.ok)
        throw new Error(meta.error || "The module could not be loaded.")
      if (token !== requestId.current) return
      setSchema(meta)
      setRecords([])
      setHasMore(false)
      if (!meta.ready || !context || !meta.permissions.read) return
      const params = new URLSearchParams({
        offset: String(offset),
        limit: "20",
        search,
      })
      if (context.company) params.set("company", context.company)
      const listResponse = await fetch(`${base}/records?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      const body = await listResponse.json()
      if (!listResponse.ok)
        throw new Error(body.error || "Records could not be loaded.")
      if (token === requestId.current) {
        setRecords(body.records)
        setHasMore(body.hasMore)
      }
    } catch (cause) {
      if (token === requestId.current && !controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Records could not be loaded.",
        )
    } finally {
      if (token === requestId.current) setBusy(false)
    }
  }, [base, companyQuery, context, offset, search, mode, custom.length])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200)
    return () => {
      clearTimeout(timer)
      abort.current?.abort()
      ++requestId.current
    }
  }, [load])

  function chooseModule(id: string) {
    ++operationId.current
    abort.current?.abort()
    ++requestId.current
    setSelected(id)
    setRecords([])
    setOffset(0)
    setSearch("")
    setEditorOpen(false)
    setRecord(null)
    setError(null)
    window.history.pushState(null, "", `#${id}`)
  }
  function chooseMode(next: string) {
    ++operationId.current
    setBusy(false)
    setMode(next)
    setEditorOpen(false)
    setRecord(null)
    setError(null)
    setRecords([])
    const first =
      next === "custom" ? custom[0] : modules.find((item) => !item.custom)
    if (first) chooseModule(first.id)
  }
  async function connect(company?: string) {
    const token = ++operationId.current
    abort.current?.abort()
    ++requestId.current
    setBusy(true)
    setRecords([])
    setReportData(null)
    setEditorOpen(false)
    setSchema(pendingSchema(module))
    setError(null)
    try {
      const response = await fetch(
        `/api/erpnext/context${company ? `?company=${encodeURIComponent(company)}` : ""}`,
        { cache: "no-store" },
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Connection failed.")
      if (token !== operationId.current) return
      setContext(body)
      setRecords([])
      setReportData(null)
      setEditorOpen(false)
      setRecord(null)
      setOffset(0)
    } catch (cause) {
      if (token === operationId.current)
        setError(cause instanceof Error ? cause.message : "Connection failed.")
    } finally {
      if (token === operationId.current) setBusy(false)
    }
  }
  async function signOut() {
    ++operationId.current
    abort.current?.abort()
    ++requestId.current
    setBusy(true)
    try {
      const response = await fetch("/api/erpnext/session", { method: "DELETE" })
      if (!response.ok) throw new Error("Sign-out failed.")
      setContext(null)
      setRecords([])
      setReportData(null)
      setRecord(null)
      setEditorOpen(false)
      setSchema(pendingSchema(module))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed.")
    } finally {
      setBusy(false)
    }
  }
  async function openRecord(name: string) {
    const token = ++operationId.current
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(
        `${base}/records/${encodeURIComponent(name)}?${companyQuery}`,
        { cache: "no-store" },
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "The record could not be opened.")
      if (token !== operationId.current) return
      setRecord(body)
      setEditorOpen(true)
    } catch (cause) {
      if (token === operationId.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The record could not be opened.",
        )
    } finally {
      if (token === operationId.current) setBusy(false)
    }
  }
  async function runReport(event: React.FormEvent) {
    event.preventDefault()
    if (!activeReport) return
    const token = ++operationId.current
    setBusy(true)
    setError(null)
    setReportData(null)
    try {
      const response = await fetch(
        `/api/workspace/reports/${encodeURIComponent(activeReport.id)}?${companyQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters }),
        },
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "The report could not be loaded.")
      if (token === operationId.current) setReportData(body)
    } catch (cause) {
      if (token === operationId.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The report could not be loaded.",
        )
    } finally {
      if (token === operationId.current) setBusy(false)
    }
  }
  const stateText = ready ? t("ERPNext connected") : t("Awaiting API setup")
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex min-h-18 max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {config.companyName}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {t("ERP workspace")}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/" aria-label={t("Return to CEO dashboards")}>
                <LayoutDashboard />
                <span className="hidden sm:inline">{t("CEO Dashboards")}</span>
              </Link>
            </Button>
            {context ? (
              <Button
                variant="outline"
                size="sm"
                aria-label={t("Sign out")}
                disabled={busy}
                onClick={signOut}
              >
                <LogOut />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConnectOpen(true)}>
                {t("Connect ERPNext")}
              </Button>
            )}
          </div>
        </div>
        <PlatformLinks />
      </header>
      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("Company ERP workspace")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Manage company records and run reports from the same platform.",
            )}
          </p>
        </div>
        <Tabs
          dir={locale === "ar" ? "rtl" : "ltr"}
          value={mode}
          onValueChange={chooseMode}
          className="gap-5"
        >
          <div className="overflow-x-auto">
            <TabsList aria-label={t("ERP workspace sections")}>
              <TabsTrigger value="records">{t("Company records")}</TabsTrigger>
              <TabsTrigger value="custom">{t("Custom DocTypes")}</TabsTrigger>
              <TabsTrigger value="reports">{t("Custom reports")}</TabsTrigger>
            </TabsList>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300"
            >
              {t(error)}
            </p>
          )}
          {(mode === "records" || (mode === "custom" && custom.length > 0)) && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label={t("Choose record type")}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={selected}
                    onChange={(event) => chooseModule(event.target.value)}
                  >
                    {shownModules.map((item) => (
                      <option key={item.id} value={item.id}>
                        {t(item.title)}
                      </option>
                    ))}
                  </select>
                  {context && context.companies.length > 1 && (
                    <select
                      aria-label={t("Select company")}
                      className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm"
                      value={context.company}
                      onChange={(event) => void connect(event.target.value)}
                    >
                      {context.companies.map((company) => (
                        <option key={company.name} value={company.name}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <Badge variant="outline" className="font-normal">
                    {t(stateText)}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void load()}
                  >
                    {busy ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      !ready ||
                      !schema.permissions.read ||
                      !schema.permissions.create ||
                      busy
                    }
                    onClick={() => {
                      setRecord(null)
                      setEditorOpen(true)
                    }}
                  >
                    <Plus />
                    {t("New record")}
                  </Button>
                </div>
              </div>
              <Card className="gap-0 overflow-hidden">
                <CardHeader className="flex flex-col justify-between gap-4 pb-5 md:flex-row md:items-center">
                  <div className="space-y-1.5">
                    <CardTitle>{t(module.title)}</CardTitle>
                    <CardDescription>{t(module.description)}</CardDescription>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      aria-label="Search ERP records"
                      placeholder={t("Search records…")}
                      value={search}
                      disabled={!ready}
                      onChange={(event) => {
                        setSearch(event.target.value)
                        setOffset(0)
                      }}
                      className="h-9 pl-8 md:w-64"
                    />
                  </div>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        {effectiveSchema.columns.map((column) => (
                          <TableHead key={column.key} className="first:pl-6">
                            {t(column.label)}
                          </TableHead>
                        ))}
                        <TableHead>
                          <span className="sr-only">Open record</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((row) => (
                        <TableRow key={row.name}>
                          {effectiveSchema.columns.map((column, index) => (
                            <TableCell
                              key={column.key}
                              className="py-3.5 first:pl-6"
                            >
                              {index === 0 ? (
                                <button
                                  className="font-medium underline-offset-4 hover:underline"
                                  onClick={() => void openRecord(row.name)}
                                  disabled={busy}
                                >
                                  {String(
                                    column.key === "name"
                                      ? row.name
                                      : (row.values[column.key] ?? row.name),
                                  )}
                                </button>
                              ) : (
                                String(
                                  column.key === "modified"
                                    ? row.modified
                                    : (row.values[column.key] ?? "—"),
                                )
                              )}
                            </TableCell>
                          ))}
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void openRecord(row.name)}
                            >
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {records.length === 0 && (
                    <div className="px-6 py-12 text-center">
                      <FileText className="mx-auto mb-3 size-7 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {ready
                          ? "No records in this view"
                          : "Ready for your company API"}
                      </p>
                      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                        {ready
                          ? "Choose another search or create a record if your account allows it."
                          : "This module is prepared for browsing, creating, and editing records. Your company fields and permitted actions will appear after API setup."}
                      </p>
                    </div>
                  )}
                  {ready && (
                    <div className="flex items-center justify-between border-t px-6 py-3 text-xs text-muted-foreground">
                      <span>Page {Math.floor(offset / 20) + 1}</span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={offset === 0 || busy}
                          onClick={() => setOffset(offset - 20)}
                        >
                          {t("Previous")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!hasMore || busy}
                          onClick={() => setOffset(offset + 20)}
                        >
                          {t("Next")}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          <TabsContent value="custom">
            {custom.length === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("Custom DocTypes")}</CardTitle>
                  <CardDescription>
                    Your custom company records can be managed here with their
                    own fields and workflows.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Ready for your custom DocType names and API definitions.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="reports" className="space-y-5">
            {activeReport ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("Custom reports")}</CardTitle>
                  <CardDescription>
                    Choose a report and set its filters.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-5" onSubmit={runReport}>
                    <select
                      aria-label="Choose custom report"
                      className="h-9 max-w-full rounded-md border bg-background px-3 text-sm"
                      value={reportId}
                      onChange={(event) => {
                        ++operationId.current
                        setBusy(false)
                        setReportId(event.target.value)
                        setFilters({})
                        setReportData(null)
                      }}
                    >
                      {reports.map((report) => (
                        <option key={report.id} value={report.id}>
                          {report.title}
                        </option>
                      ))}
                    </select>
                    <WorkspaceFields
                      fields={activeReport.filters}
                      values={filters}
                      onChange={setFilters}
                      disabled={busy || !context}
                      prefix="report"
                    />
                    <Button type="submit" disabled={busy || !context}>
                      {busy && <LoaderCircle className="animate-spin" />}Run
                      report
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t("Custom reports")}</CardTitle>
                  <CardDescription>
                    Query reports, script reports, and company-specific
                    reporting.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Ready for your custom report names, filters, and data
                    sources.
                  </p>
                </CardContent>
              </Card>
            )}
            {reportData && (
              <Card className="gap-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                  <CardTitle>{activeReport?.title}</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reportData.rows.length === 0}
                    onClick={() =>
                      downloadCSV(`${reportId}.csv`, [
                        reportData.columns.map((column) => column.label),
                        ...reportData.rows.map((row) =>
                          reportData.columns.map(
                            (column) => row[column.key] ?? "",
                          ),
                        ),
                        ...(reportData.totalRow
                          ? [
                              reportData.columns.map(
                                (column) =>
                                  reportData.totalRow![column.key] ?? "",
                              ),
                            ]
                          : []),
                      ])
                    }
                  >
                    <Download />
                    {t("Export")}
                  </Button>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {reportData.columns.map((column) => (
                          <TableHead key={column.key} className="first:pl-6">
                            {t(column.label)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.rows.map((row, index) => (
                        <TableRow key={index}>
                          {reportData.columns.map((column) => (
                            <TableCell key={column.key} className="first:pl-6">
                              {row[column.key] ?? "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                    {reportData.totalRow && (
                      <TableFooter>
                        <TableRow>
                          {reportData.columns.map((column) => (
                            <TableCell
                              key={column.key}
                              className="first:pl-6 font-medium"
                            >
                              {reportData.totalRow![column.key] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                  {reportData.rows.length === 0 && (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      No report results for these filters.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
        <footer className="border-t pt-5 text-xs text-muted-foreground">
          {context
            ? `Signed in as ${context.user} · ${context.company}`
            : `Prepared for ${new URL(config.siteUrl).host}`}
        </footer>
      </main>
      <LoginDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        siteUrl={config.siteUrl}
        onConnected={() => connect()}
      />
      <WorkspaceEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        schema={effectiveSchema}
        record={record}
        company={context?.company}
        onSaved={load}
      />
    </div>
  )
}
