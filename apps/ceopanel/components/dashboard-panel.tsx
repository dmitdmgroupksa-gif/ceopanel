"use client"
import { useLocale } from "./locale-provider"
import { useEffect, useMemo, useState } from "react"
import { Download, Search } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
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
} from "@/components/ui/table"
import type {
  DashboardData,
  DashboardDefinition,
  MetricValue,
} from "@/lib/dashboards"
import { downloadCSV } from "./records-table"

function formatMetric(metric: MetricValue, currency: string, locale: string) {
  if (metric.value === null) return "—"
  if (typeof metric.value === "string") return metric.value
  if (metric.format === "currency")
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(metric.value)
  if (metric.format === "percent")
    return `${metric.value.toLocaleString(locale, { maximumFractionDigits: 2 })}%`
  return metric.value.toLocaleString(locale)
}
const chartColor = (index: number) => `var(--chart-${(index % 8) + 1})`
function recordHref(value: string | undefined, siteUrl: string | undefined) {
  if (!value || !siteUrl) return undefined
  try {
    const url = new URL(value)
    return ["https:", "http:"].includes(url.protocol) &&
      url.origin === new URL(siteUrl).origin &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/app/")
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

export function DashboardPanel({
  definition,
  data,
  loading = false,
  failed = false,
  siteUrl,
}: {
  definition: DashboardDefinition
  data: DashboardData
  loading?: boolean
  failed?: boolean
  siteUrl?: string
}) {
  const { t, locale } = useLocale()
  const ready = data.status === "ready"
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  useEffect(() => {
    setSearch("")
    setPage(0)
  }, [definition.id, data.company])
  useEffect(() => {
    setPage(0)
  }, [data.period.from, data.period.to])
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data.table.rows
    return data.table.rows.filter((row) =>
      data.table.columns.some((column) =>
        String(row[column.key] ?? "")
          .toLowerCase()
          .includes(query)
      )
    )
  }, [data.table.rows, data.table.columns, search])
  const totalPages = Math.max(1, Math.ceil(rows.length / 10))
  const currentPage = Math.min(page, totalPages - 1)
  const exportRows = () =>
    downloadCSV(`${definition.id}-${data.period.to}.csv`, [
      [
        data.scope === "erp-account" ? "ERP account scope" : data.company,
        definition.title,
        data.period.from,
        data.period.to,
      ],
      ...(data.note ? [[data.note]] : []),
      ...(search.trim() ? [["Search", search.trim()]] : []),
      data.table.columns.map((column) => column.label),
      ...rows.map((row) =>
        data.table.columns.map((column) => row[column.key] ?? "")
      ),
    ])
  if (data.companyResults)
    return (
      <div className="space-y-8">
        {data.companyResults.map((result) => (
          <section key={result.company} className="space-y-3">
            <h2 className="text-lg font-semibold">
              {data.scope === "erp-account"
                ? t("ERP account scope")
                : result.company}
            </h2>
            {result.error ? (
              <p role="alert" className="text-sm text-destructive">
                {t(result.error)}
              </p>
            ) : (
              result.data && (
                <DashboardPanel
                  definition={definition}
                  data={result.data}
                  siteUrl={siteUrl}
                />
              )
            )}
          </section>
        ))}
      </div>
    )
  if (!ready && failed) return null
  if (!ready)
    return (
      <section
        className="rounded-lg border px-6 py-20 text-center"
        aria-label={t("Dashboard data")}
      >
        <h2 className="text-sm font-medium">
          {t(loading ? "Loading dashboard…" : "No data yet")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {!loading && t("This dashboard is not connected yet.")}
        </p>
      </section>
    )
  return (
    <div className="space-y-6">
      {data.note && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t(data.note)}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <Card key={metric.label} className="gap-3 shadow-none">
            <CardHeader className="gap-3">
              <CardDescription>{t(metric.label)}</CardDescription>
              <CardTitle className="text-3xl font-semibold tabular-nums">
                {formatMetric(metric, data.currency, locale)}
              </CardTitle>
              {metric.note && (
                <p className="text-xs text-muted-foreground">
                  {t(metric.note)}
                </p>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="gap-4">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t(data.chart.title)}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.chart.series.length > 1 && (
            <div
              aria-label={t("Chart series")}
              className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"
            >
              {data.chart.series.map((series, index) => (
                <span key={series.key} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: chartColor(index) }}
                  />
                  {t(series.label)}
                </span>
              ))}
            </div>
          )}
          {ready && data.chart.points.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 800, height: 256 }}
              >
                {data.chart.type === "bar" ? (
                  <BarChart
                    data={data.chart.points}
                    layout="vertical"
                    margin={{ left: 0, right: 12 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={140}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => {
                        const label = t(String(value))
                        return label.length > 22
                          ? `${label.slice(0, 21)}…`
                          : label
                      }}
                    />
                    <Tooltip
                      labelFormatter={(label) => t(String(label))}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    {data.chart.series.map((series, index) => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        name={t(series.label)}
                        fill={chartColor(index)}
                        radius={[0, 3, 3, 0]}
                        isAnimationActive={false}
                      >
                        {data.chart.series.length === 1 &&
                          data.chart.points.map((point, i) => (
                            <Cell
                              key={`${point.label}:${i}`}
                              fill={chartColor(i)}
                            />
                          ))}
                      </Bar>
                    ))}
                  </BarChart>
                ) : (
                  <AreaChart data={data.chart.points}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    {data.chart.series.map((series, index) => (
                      <Area
                        key={series.key}
                        dataKey={series.key}
                        name={t(series.label)}
                        stroke={chartColor(index)}
                        strokeWidth={2}
                        fill={chartColor(index)}
                        fillOpacity={0.14}
                        isAnimationActive={false}
                      />
                    ))}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {t("No chart data in this period")}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden">
        <CardHeader className="flex flex-col justify-between gap-4 pb-5 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <CardTitle>{t("Records")}</CardTitle>
            <CardDescription>
              {rows.length.toLocaleString(locale)} {t("records")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                aria-label={t("Search dashboard records")}
                placeholder={t("Search records…")}
                className="h-9 pl-8 md:w-48"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(0)
                }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={rows.length === 0}
              onClick={exportRows}
            >
              <Download />
              {t("Export")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                {data.table.columns.map((column) => (
                  <TableHead key={column.key} className="first:pl-6">
                    {t(column.label)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows
                .slice(currentPage * 10, (currentPage + 1) * 10)
                .map((row) => (
                  <TableRow key={row.id}>
                    {data.table.columns.map((column, index) => (
                      <TableCell key={column.key} className="py-4 first:pl-6">
                        {index === 0 &&
                        recordHref(data.table.links?.[row.id], siteUrl) ? (
                          <a
                            href={recordHref(
                              data.table.links?.[row.id],
                              siteUrl
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                          >
                            {row[column.key] ?? "—"}
                          </a>
                        ) : (
                          (row[column.key] ?? "—")
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {t("No records in this view.")}
            </div>
          )}
          {rows.length > 10 && (
            <div className="flex items-center justify-between border-t px-6 py-3 text-xs text-muted-foreground">
              <span>
                {t("Page")} {currentPage + 1} {t("of")} {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  {t("Previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage + 1 >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {t("Next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
