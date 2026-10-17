"use client"
import { sessionFetch as fetch } from "@/lib/session-fetch"
import dynamic from "next/dynamic"
import { useLocale } from "./locale-provider"
import { PlatformLinks, IconHint } from "./platform-links"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Building2,
  Download,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sun,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useSession } from "./session-provider"
import {
  pendingSchema,
  type ModuleSchema,
  type RecordValues,
  type ReportData,
  type ReportDefinition,
  type WorkspaceModule,
  type WorkspaceRecord,
} from "@/lib/workspace"
import { downloadCSV } from "./records-table"
import { WorkspaceEditor } from "./workspace-editor"
import { WorkspaceFields } from "./workspace-fields"
import { ERP_READ_ONLY } from "@/lib/erp-access"

const ERPExplorer = dynamic(() =>
  import("./erp-explorer").then((m) => m.ERPExplorer),
)
const DailyBriefing = dynamic(() =>
  import("./daily-briefing").then((m) => m.DailyBriefing),
)

export function ERPWorkspace({
  modules,
  reports,
}: {
  modules: WorkspaceModule[]
  reports: ReportDefinition[]
}) {
  const { t, locale } = useLocale()
  const { context, setContext, preview } = useSession()
  const [mode, setMode] = useState("records")
  const [selected, setSelected] = useState(modules[0].id)
  const [schema, setSchema] = useState<ModuleSchema>(pendingSchema(modules[0]))
  const [records, setRecords] = useState<WorkspaceRecord[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      if (id === "explorer" || id === "briefing") {
        ++operationId.current
        abort.current?.abort()
        ++requestId.current
        setBusy(false)
        setError(null)
        setEditorOpen(false)
        setRecord(null)
        setMode(id)
        return
      }
      const target = modules.find((item) => item.id === id)
      if (target) {
        setSelected(target.id)
        setMode(target.custom ? "custom" : "records")
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
    if (
      !["records", "custom"].includes(mode) ||
      (mode === "custom" && custom.length === 0)
    )
      return
    if (preview) {
      setSchema(pendingSchema(module))
      setRecords([])
      setHasMore(false)
      setBusy(false)
      return
    }
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
      if (!meta.ready || !context) return
      if (!meta.permissions.read)
        throw new Error(
          "Your ERPNext account does not have permission to read these records.",
        )
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
      if (token === requestId.current && !controller.signal.aborted) {
        ++operationId.current
        setSchema(pendingSchema(module))
        setRecords([])
        setHasMore(false)
        setRecord(null)
        setEditorOpen(false)
        setError(
          cause instanceof Error
            ? cause.message
            : "Records could not be loaded.",
        )
      }
    } finally {
      if (token === requestId.current) setBusy(false)
    }
  }, [
    base,
    companyQuery,
    context,
    offset,
    search,
    mode,
    custom.length,
    preview,
    module,
  ])
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
    if (next === "explorer" || next === "briefing") {
      abort.current?.abort()
      ++requestId.current
      window.history.pushState(null, "", `#${next}`)
      return
    }
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
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur lg:hidden">
        <PlatformLinks />
      </header>
      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("ERP workspace")}
          </h1>
        </div>
        <Tabs
          dir={locale === "ar" ? "rtl" : "ltr"}
          value={mode}
          onValueChange={chooseMode}
          className="gap-5"
        >
          <div className="overflow-x-auto">
            <TabsList aria-label={t("ERP workspace sections")}>
              <IconHint label={t("Company records")}>
                <TabsTrigger
                  value="records"
                  aria-label={t("Company records")}
                  className="dashboard-icon min-w-12"
                >
                  <Building2 aria-hidden="true" />
                </TabsTrigger>
              </IconHint>
              <IconHint label={t("Custom DocTypes")}>
                <TabsTrigger
                  value="custom"
                  aria-label={t("Custom DocTypes")}
                  className="dashboard-icon min-w-12"
                >
                  <Settings2 aria-hidden="true" />
                </TabsTrigger>
              </IconHint>
              <IconHint label={t("Custom reports")}>
                <TabsTrigger
                  value="reports"
                  aria-label={t("Custom reports")}
                  className="dashboard-icon min-w-12"
                >
                  <FileText aria-hidden="true" />
                </TabsTrigger>
              </IconHint>
              <IconHint label={t("Explorer")}>
                <TabsTrigger
                  value="explorer"
                  aria-label={t("Explorer")}
                  className="dashboard-icon min-w-12"
                >
                  <Search aria-hidden="true" />
                </TabsTrigger>
              </IconHint>
              <IconHint label={t("Daily briefing")}>
                <TabsTrigger
                  value="briefing"
                  aria-label={t("Daily briefing")}
                  className="dashboard-icon min-w-12"
                >
                  <Sun aria-hidden="true" />
                </TabsTrigger>
              </IconHint>
            </TabsList>
          </div>
          {(mode === "explorer" || mode === "briefing") &&
            context &&
            context.companies.length > 1 && (
              <select
                aria-label={t("Select company")}
                className="h-9 max-w-full self-start rounded-md border bg-background px-3 text-sm"
                value={context.company}
                disabled={busy}
                onChange={(event) => void connect(event.target.value)}
              >
                {context.companies.map((company) => (
                  <option key={company.name}>{company.name}</option>
                ))}
              </select>
            )}
          <TabsContent value="explorer">
            {mode === "explorer" && !busy && <ERPExplorer />}
          </TabsContent>
          <TabsContent value="briefing">
            {mode === "briefing" && !busy && <DailyBriefing />}
          </TabsContent>
          {(mode === "explorer" || mode === "briefing") && !context && (
            <p className="text-sm text-muted-foreground">
              {t("Sign in to read live ERP data.")}
            </p>
          )}
          {(mode === "explorer" || mode === "briefing") && busy && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("Checking source access…")}
            </p>
          )}
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
                  {!ERP_READ_ONLY && (
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
                  )}
                </div>
              </div>
              <Card className="gap-0 overflow-hidden">
                <CardHeader className="flex flex-col justify-between gap-4 pb-5 md:flex-row md:items-center">
                  <div className="space-y-1.5">
                    <CardTitle>{t(module.title)}</CardTitle>
                    {effectiveSchema.scope === "shared" && (
                      <p className="text-xs text-muted-foreground">
                        {t("Shared ERP catalog")}
                      </p>
                    )}
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
                      <p className="text-sm font-medium">
                        {t(
                          ready
                            ? "No records in this view."
                            : "This record type is not connected yet.",
                        )}
                      </p>
                    </div>
                  )}
                  {ready && (offset > 0 || hasMore) && (
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
                </CardHeader>
                <CardContent>
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {t("No custom record types configured.")}
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
                </CardHeader>
                <CardContent>
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {t("No custom reports configured.")}
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
      </main>
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
