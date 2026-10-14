import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { monthlyTrend, type Snapshot } from "@/lib/model"
import { MetricCards, money } from "./metrics"
import { PerformanceChart } from "./performance-chart"
import { downloadCSV } from "./records-table"

export function Reports({ snapshot }: { snapshot: Snapshot }) {
  const rows = monthlyTrend(snapshot)
  const salesError = !!snapshot.sources.salesInvoices.error
  const purchaseError = !!snapshot.sources.purchaseInvoices.error
  const exportReport = () =>
    downloadCSV(
      `${snapshot.mode === "preview" ? "PREVIEW-" : ""}company-report-${snapshot.period.to}.csv`,
      [
        [
          snapshot.company,
          snapshot.currency,
          snapshot.mode === "preview" ? "PREVIEW DATA" : "ERPNext",
        ],
        [
          "Period",
          snapshot.period.from,
          snapshot.period.to,
          "Submitted invoices, excluding tax. This is billing activity, not profit or cash flow.",
        ],
        ["Month", "Billed sales", "Billed purchases"],
        ...rows.map((row) => [
          row.date,
          salesError ? "Unavailable" : row.sales,
          purchaseError ? "Unavailable" : row.purchases,
        ]),
      ]
    )
  return (
    <div className="space-y-6">
      <MetricCards snapshot={snapshot} kind="finance" />
      <PerformanceChart snapshot={snapshot} />
      <Card className="gap-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-5">
          <div className="space-y-1.5">
            <CardTitle>Management report</CardTitle>
            <CardDescription>
              Monthly billing activity within {snapshot.period.from} –{" "}
              {snapshot.period.to}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportReport}>
            <Download />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="pl-6">Month</TableHead>
                <TableHead>Billed sales · {snapshot.currency}</TableHead>
                <TableHead>Billed purchases · {snapshot.currency}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.date}>
                  <TableCell className="py-4 pl-6 font-medium">
                    {new Date(`${row.date}-01T00:00:00Z`).toLocaleDateString(
                      "en",
                      { month: "long", year: "numeric", timeZone: "UTC" }
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money(salesError ? null : row.sales, snapshot.currency)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money(
                      purchaseError ? null : row.purchases,
                      snapshot.currency
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-6 py-4 text-xs leading-relaxed text-muted-foreground">
            Amounts use company base currency and exclude tax. Returns reduce
            billed totals. Billing activity does not represent profit or cash
            flow; those require the corresponding ERPNext accounting reports.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
