"use client"
import { useLocale } from "./locale-provider"
import { useEffect, useState } from "react"
import { BarChart3, Download, Search } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
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
      maximumFractionDigits: 0,
    }).format(metric.value)
  if (metric.format === "percent")
    return `${metric.value.toLocaleString(locale)}%`
  return metric.value.toLocaleString(locale)
}

export function DashboardPanel({
  definition,
  data,
}: {
  definition: DashboardDefinition
  data: DashboardData
}) {
  const { t, locale } = useLocale()
  const ready = data.status === "ready"
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  useEffect(() => {
    setSearch("")
    setPage(0)
  }, [definition.id, data.company])
  const rows = data.table.rows.filter((row) =>
    data.table.columns.some((column) =>
      String(row[column.key] ?? "")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ),
  )
  const totalPages = Math.max(1, Math.ceil(rows.length / 10))
  const currentPage = Math.min(page, totalPages - 1)
  const exportRows = () =>
    downloadCSV(`${definition.id}-${data.period.to}.csv`, [
      [data.company, definition.title, data.period.from, data.period.to],
      data.table.columns.map((column) => column.label),
      ...rows.map((row) =>
        data.table.columns.map((column) => row[column.key] ?? ""),
      ),
    ])
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <Card
            key={metric.label}
            className="gap-3 bg-gradient-to-t from-muted/40 to-card shadow-xs"
          >
            <CardHeader className="gap-3">
              <CardDescription>{t(metric.label)}</CardDescription>
              <CardTitle className="text-3xl font-semibold tabular-nums">
                {formatMetric(metric, data.currency, locale)}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {ready ? metric.note || "Company data" : t("Awaiting data")}
              </p>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="gap-4">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t(data.chart.title)}</CardTitle>
            <CardDescription>
              {ready
                ? t("Performance in the selected reporting period")
                : t("Your dashboard chart will appear here")}
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-normal">
            {ready ? t("Connected") : t("Data source pending")}
          </Badge>
        </CardHeader>
        <CardContent>
          {ready && data.chart.points.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 800, height: 256 }}
              >
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
                      name={series.label}
                      stroke={
                        index ? "var(--muted-foreground)" : "var(--foreground)"
                      }
                      fill="var(--foreground)"
                      fillOpacity={index ? 0.04 : 0.1}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl border bg-background">
                <BarChart3 className="size-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">
                {ready
                  ? t("No chart data in this period")
                  : t("Ready for your company data")}
              </p>
              <p className="max-w-sm px-4 text-xs leading-relaxed text-muted-foreground">
                {ready
                  ? t(
                      "Choose another reporting period to review more activity.",
                    )
                  : t(
                      "The source and calculations will be connected when you share how this dashboard gets its data.",
                    )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden">
        <CardHeader className="flex flex-col justify-between gap-4 pb-5 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <CardTitle>
              {t(definition.title)} {t("records")}
            </CardTitle>
            <CardDescription>
              {ready
                ? `${rows.length} records in this view`
                : t("Record layout prepared · data setup pending")}
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
                disabled={!ready}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(0)
                }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!ready || rows.length === 0}
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
              {ready &&
                rows
                  .slice(currentPage * 10, (currentPage + 1) * 10)
                  .map((row) => (
                    <TableRow key={row.id}>
                      {data.table.columns.map((column) => (
                        <TableCell key={column.key} className="py-4 first:pl-6">
                          {row[column.key] ?? "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
          {(!ready || rows.length === 0) && (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {ready
                ? t("No records in this view.")
                : t(
                    "Awaiting your data source. No company records have been loaded for this dashboard.",
                  )}
            </div>
          )}
          {ready && rows.length > 10 && (
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
