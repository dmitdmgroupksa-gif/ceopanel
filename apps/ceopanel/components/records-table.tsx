"use client"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  ExternalLink,
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
} from "@/components/ui/table"
import {
  csv,
  numeric,
  type ERPDocument,
  type Snapshot,
  type SourceKey,
} from "@/lib/model"
import { money } from "./metrics"

type Column = {
  key: string
  label: string
  type?: "money" | "percent" | "status" | "outstanding"
}
export const tables: Record<
  SourceKey,
  { title: string; description: string; route: string; columns: Column[] }
> = {
  salesInvoices: {
    title: "Sales invoices",
    description: "Submitted invoices in the selected period",
    route: "sales-invoice",
    columns: [
      { key: "name", label: "Invoice" },
      { key: "customer_name", label: "Customer" },
      { key: "posting_date", label: "Date" },
      { key: "base_net_total", label: "Billed · excl. tax", type: "money" },
      { key: "status", label: "Status", type: "status" },
    ],
  },
  receivables: {
    title: "Receivables",
    description: "Outstanding sales invoices across all dates",
    route: "sales-invoice",
    columns: [
      { key: "name", label: "Invoice" },
      { key: "customer_name", label: "Customer" },
      { key: "due_date", label: "Due date" },
      { key: "outstanding_amount", label: "Outstanding", type: "outstanding" },
      { key: "status", label: "Status", type: "status" },
    ],
  },
  purchaseInvoices: {
    title: "Purchase invoices",
    description: "Submitted invoices in the selected period",
    route: "purchase-invoice",
    columns: [
      { key: "name", label: "Invoice" },
      { key: "supplier_name", label: "Supplier" },
      { key: "posting_date", label: "Date" },
      { key: "base_net_total", label: "Billed · excl. tax", type: "money" },
      { key: "status", label: "Status", type: "status" },
    ],
  },
  payables: {
    title: "Payables",
    description: "Outstanding purchase invoices across all dates",
    route: "purchase-invoice",
    columns: [
      { key: "name", label: "Invoice" },
      { key: "supplier_name", label: "Supplier" },
      { key: "due_date", label: "Due date" },
      { key: "outstanding_amount", label: "Outstanding", type: "outstanding" },
      { key: "status", label: "Status", type: "status" },
    ],
  },
  salesOrders: {
    title: "Open sales orders",
    description: "Submitted orders awaiting delivery or billing · all dates",
    route: "sales-order",
    columns: [
      { key: "name", label: "Order" },
      { key: "customer_name", label: "Customer" },
      { key: "delivery_date", label: "Delivery date" },
      {
        key: "base_net_total",
        label: "Order value · excl. tax",
        type: "money",
      },
      { key: "per_delivered", label: "Delivered", type: "percent" },
      { key: "status", label: "Status", type: "status" },
    ],
  },
  purchaseOrders: {
    title: "Open purchase orders",
    description: "Submitted orders awaiting receipt or billing · all dates",
    route: "purchase-order",
    columns: [
      { key: "name", label: "Order" },
      { key: "supplier_name", label: "Supplier" },
      { key: "schedule_date", label: "Required by" },
      {
        key: "base_net_total",
        label: "Order value · excl. tax",
        type: "money",
      },
      { key: "per_received", label: "Received", type: "percent" },
      { key: "status", label: "Status", type: "status" },
    ],
  },
  projects: {
    title: "Company projects",
    description: "Project status and progress across your selected company",
    route: "project",
    columns: [
      { key: "project_name", label: "Project" },
      { key: "priority", label: "Priority" },
      { key: "expected_end_date", label: "Target date" },
      { key: "percent_complete", label: "Progress", type: "percent" },
      { key: "status", label: "Status", type: "status" },
    ],
  },
  employees: {
    title: "Active team",
    description: "Active employees · access follows your ERPNext permissions",
    route: "employee",
    columns: [
      { key: "employee_name", label: "Team member" },
      { key: "designation", label: "Role" },
      { key: "department", label: "Department" },
      { key: "date_of_joining", label: "Joined" },
      { key: "status", label: "Status", type: "status" },
    ],
  },
}

export function downloadCSV(
  filename: string,
  rows: (string | number | null)[][]
) {
  const url = URL.createObjectURL(
    new Blob([csv(rows)], { type: "text/csv;charset=utf-8" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Status({ value }: { value: unknown }) {
  const text = String(value || "—")
  const good = ["Paid", "Completed", "Active"].includes(text)
  const bad = ["Overdue", "Cancelled", "On Hold"].includes(text)
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 font-normal ${bad ? "text-amber-700 dark:text-amber-400" : good ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
    >
      <span
        className={`size-1.5 rounded-full ${bad ? "bg-amber-500" : good ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
      />
      {text}
    </Badge>
  )
}

export function RecordsTable({
  snapshot,
  source,
  globalSearch = "",
  limit,
}: {
  snapshot: Snapshot
  source: SourceKey
  globalSearch?: string
  limit?: number
}) {
  const spec = tables[source]
  const dataset = snapshot.sources[source]
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: string; ascending: boolean } | null>(
    null
  )
  const pageSize = limit ?? 8
  useEffect(() => {
    setPage(0)
  }, [search, globalSearch, source, dataset.records])
  const rows = useMemo(() => {
    const terms = [
      search.trim().toLowerCase(),
      globalSearch.trim().toLowerCase(),
    ].filter(Boolean)
    const records = dataset.records.filter((row) =>
      terms.every((term) =>
        spec.columns.some((column) =>
          String(row[column.key] ?? "")
            .toLowerCase()
            .includes(term)
        )
      )
    )
    if (sort)
      records.sort((a, b) => {
        const column = spec.columns.find((item) => item.key === sort.key)
        const sortValue = (row: ERPDocument) =>
          column?.type === "outstanding"
            ? numeric(row[sort.key]) * numeric(row.conversion_rate ?? 1)
            : column?.type === "money" || column?.type === "percent"
              ? numeric(row[sort.key])
              : row[sort.key]
        const av = sortValue(a),
          bv = sortValue(b)
        const delta =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av ?? "").localeCompare(String(bv ?? ""), "en", {
                numeric: true,
              })
        return sort.ascending ? delta : -delta
      })
    return records
  }, [dataset.records, search, globalSearch, spec.columns, sort])
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const visible = rows.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const rawValue = (row: ERPDocument, column: Column) =>
    column.type === "outstanding"
      ? numeric(row[column.key]) * numeric(row.conversion_rate ?? 1)
      : (row[column.key] ?? "")
  const exportRows = () =>
    downloadCSV(
      `${snapshot.mode === "preview" ? "PREVIEW-" : ""}${source}-${snapshot.period.to}.csv`,
      [
        [
          snapshot.company,
          snapshot.currency,
          snapshot.mode === "preview" ? "PREVIEW DATA" : "ERPNext",
          spec.description,
        ],
        spec.columns.map((column) => column.label),
        ...rows.map((row) =>
          spec.columns.map((column) => rawValue(row, column))
        ),
      ]
    )
  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="gap-4 pb-5 md:flex md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            {spec.title}
            <Badge variant="secondary" className="tabular-nums">
              {dataset.error ? "—" : dataset.records.length}
            </Badge>
          </CardTitle>
          <CardDescription>{spec.description}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
            />
            <Input
              aria-label={`Search ${spec.title.toLowerCase()}`}
              placeholder="Search records…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full pl-8 md:w-48"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportRows}
            disabled={!!dataset.error || rows.length === 0}
          >
            <Download className="size-3.5" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {dataset.error ? (
          <div
            role="status"
            className="mx-6 mb-6 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            {dataset.error}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  {spec.columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className="first:pl-6"
                      aria-sort={
                        sort?.key === column.key
                          ? sort.ascending
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        className="inline-flex items-center gap-1.5 py-3 text-xs font-medium hover:text-foreground"
                        onClick={() => {
                          setSort({
                            key: column.key,
                            ascending:
                              sort?.key === column.key ? !sort.ascending : true,
                          })
                          setPage(0)
                        }}
                      >
                        {column.label}
                        {sort?.key === column.key ? (
                          sort.ascending ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                  ))}
                  {snapshot.mode === "live" && (
                    <TableHead className="pr-6 text-right">
                      <span className="sr-only">Open in ERPNext</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.name}>
                    {spec.columns.map((column, i) => (
                      <TableCell
                        key={column.key}
                        className={`py-3.5 first:pl-6 ${i === 0 ? "font-medium" : "text-muted-foreground"} ${column.type === "money" || column.type === "outstanding" ? "tabular-nums" : ""}`}
                      >
                        {column.type === "status" ? (
                          <Status value={row[column.key]} />
                        ) : column.type === "money" ||
                          column.type === "outstanding" ? (
                          money(
                            numeric(rawValue(row, column)),
                            snapshot.currency
                          )
                        ) : column.type === "percent" ? (
                          <span className="flex min-w-24 items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full bg-foreground/70"
                                style={{
                                  width: `${Math.min(100, Math.max(0, numeric(row[column.key])))}%`,
                                }}
                              />
                            </span>
                            <span className="text-xs tabular-nums">
                              {Math.round(numeric(row[column.key]))}%
                            </span>
                          </span>
                        ) : (
                          String(row[column.key] || "—")
                        )}
                      </TableCell>
                    ))}
                    {snapshot.mode === "live" && (
                      <TableCell className="pr-6 text-right">
                        <a
                          href={`${snapshot.siteUrl}/app/${spec.route}/${encodeURIComponent(row.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${row.name} in ERPNext`}
                          className="inline-flex rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {search || globalSearch
                  ? "No records match your search."
                  : "No records in this view."}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3 text-xs text-muted-foreground">
              <span>
                {rows.length > 0
                  ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, rows.length)} of ${rows.length} records`
                  : "0 records"}
              </span>
              <div className="flex items-center gap-3">
                <span>
                  Page {safePage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage + 1 >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
