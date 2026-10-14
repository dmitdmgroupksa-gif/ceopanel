"use client"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { monthlyTrend, type Snapshot } from "@/lib/model"
import { money } from "./metrics"

export function PerformanceChart({ snapshot }: { snapshot: Snapshot }) {
  const errors = [
    snapshot.sources.salesInvoices.error,
    snapshot.sources.purchaseInvoices.error,
  ].filter(Boolean)
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>Business performance</CardTitle>
          <CardDescription>
            Billed sales and purchases, excluding tax · {snapshot.currency}
          </CardDescription>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-foreground" />
            Sales
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-foreground/30" />
            Purchases
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {errors.length > 0 ? (
          <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Performance is unavailable because invoice data could not be loaded.
          </div>
        ) : (
          <div
            className="h-[260px] w-full"
            role="img"
            aria-label="Monthly billed sales and purchases. Exact values are available in the Reports tab."
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 800, height: 260 }}
            >
              <AreaChart
                data={monthlyTrend(snapshot)}
                margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--foreground)"
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--foreground)"
                      stopOpacity={0.015}
                    />
                  </linearGradient>
                  <linearGradient
                    id="purchase-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--foreground)"
                      stopOpacity={0.08}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--foreground)"
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={12}
                  tickFormatter={(value) =>
                    new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en", {
                      month: "short",
                      year: "2-digit",
                      timeZone: "UTC",
                    })
                  }
                />
                <YAxis
                  width={48}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    new Intl.NumberFormat("en", { notation: "compact" }).format(
                      value
                    )
                  }
                />
                <Tooltip
                  formatter={(value, name) => [
                    money(Number(value), snapshot.currency),
                    name === "sales" ? "Sales" : "Purchases",
                  ]}
                  labelFormatter={(label) =>
                    new Date(`${label}-01T00:00:00Z`).toLocaleDateString("en", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })
                  }
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    fontSize: 12,
                  }}
                />
                <Area
                  dataKey="purchases"
                  type="monotone"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  fill="url(#purchase-fill)"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="sales"
                  type="monotone"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  fill="url(#sales-fill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
