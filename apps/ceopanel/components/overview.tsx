import { ArrowRight, CalendarClock, CircleCheck, CircleDot } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { numeric, overdue, type Snapshot, type SourceKey } from "@/lib/model"
import { MetricCards, money } from "./metrics"
import { PerformanceChart } from "./performance-chart"
import { RecordsTable } from "./records-table"

export function Overview({
  snapshot,
  search,
  navigate,
}: {
  snapshot: Snapshot
  search: string
  navigate: (tab: string, source?: SourceKey) => void
}) {
  const s = snapshot.sources
  const overdueSales = overdue(s.receivables, snapshot.period.to)
  const overduePurchases = overdue(s.payables, snapshot.period.to)
  const delayed = s.projects.records.filter(
    (p) =>
      p.status === "Open" &&
      p.expected_end_date &&
      String(p.expected_end_date) < snapshot.period.to
  )
  const items: {
    label: string
    count: number | null
    detail: string
    tab: string
    source?: SourceKey
  }[] = [
    {
      label: "Overdue receivables",
      count: s.receivables.error ? null : overdueSales.length,
      detail: s.receivables.error
        ? "Data unavailable"
        : money(
            overdueSales.reduce(
              (total, row) =>
                total +
                numeric(row.outstanding_amount) *
                  numeric(row.conversion_rate ?? 1),
              0
            ),
            snapshot.currency
          ),
      tab: "finance",
      source: "receivables",
    },
    {
      label: "Overdue payables",
      count: s.payables.error ? null : overduePurchases.length,
      detail: s.payables.error
        ? "Data unavailable"
        : money(
            overduePurchases.reduce(
              (total, row) =>
                total +
                numeric(row.outstanding_amount) *
                  numeric(row.conversion_rate ?? 1),
              0
            ),
            snapshot.currency
          ),
      tab: "purchasing",
      source: "payables",
    },
    {
      label: "Projects past target date",
      count: s.projects.error ? null : delayed.length,
      detail: "Open projects only",
      tab: "projects",
    },
  ]
  const unavailable = Object.values(s).filter((source) => source.error).length
  return (
    <div className="space-y-6">
      <MetricCards snapshot={snapshot} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <PerformanceChart snapshot={snapshot} />
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              Needs attention
            </CardTitle>
            <CardDescription>
              Items to review with your management team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => navigate(item.tab, item.source)}
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted focus-visible:ring-2"
              >
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-medium tabular-nums ${item.count ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400" : "bg-muted/50 text-muted-foreground"}`}
                >
                  {item.count ?? "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </button>
            ))}
            <div className="mt-4 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
              {unavailable ? (
                <CircleDot className="size-3.5" />
              ) : (
                <CircleCheck className="size-3.5" />
              )}
              {snapshot.mode === "preview"
                ? "Preview data · connect to see company records"
                : unavailable
                  ? `${unavailable} data sources need attention`
                  : "All configured data sources loaded"}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Operations at a glance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track delivery, billing, and current commitments.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("sales")}>
          View sales
          <ArrowRight />
        </Button>
      </div>
      <RecordsTable
        snapshot={snapshot}
        source="salesOrders"
        globalSearch={search}
        limit={5}
      />
    </div>
  )
}
