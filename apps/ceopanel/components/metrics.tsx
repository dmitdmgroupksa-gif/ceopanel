import {
  ArrowDownLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Users,
} from "lucide-react"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { outstanding, sum, type Snapshot } from "@/lib/model"

export function money(value: number | null, currency: string, compact = false) {
  if (value === null) return "Unavailable"
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value)
}

export function MetricCards({
  snapshot,
  kind = "overview",
}: {
  snapshot: Snapshot
  kind?: "overview" | "finance" | "sales" | "purchasing" | "projects" | "people"
}) {
  const s = snapshot.sources
  const count = (key: keyof typeof s) =>
    s[key].error ? null : s[key].records.length
  const formatted = (value: number | null) =>
    value === null ? "Unavailable" : value.toLocaleString("en")
  const billing = [
    {
      label: "Billed sales",
      value: money(sum(s.salesInvoices, "base_net_total"), snapshot.currency),
      detail: "Submitted invoices · excluding tax",
      icon: ArrowUpRight,
    },
    {
      label: "Receivables",
      value: money(outstanding(s.receivables), snapshot.currency),
      detail: "Outstanding sales invoices · all dates",
      icon: ArrowDownLeft,
    },
  ]
  const purchasing = [
    {
      label: "Billed purchases",
      value: money(
        sum(s.purchaseInvoices, "base_net_total"),
        snapshot.currency
      ),
      detail: "Submitted invoices · excluding tax",
      icon: ArrowDownLeft,
    },
    {
      label: "Payables",
      value: money(outstanding(s.payables), snapshot.currency),
      detail: "Outstanding purchase invoices · all dates",
      icon: ArrowUpRight,
    },
  ]
  const projectMetrics = [
    {
      label: "Active projects",
      value: s.projects.error
        ? "Unavailable"
        : formatted(
            s.projects.records.filter((p) => p.status === "Open").length
          ),
      detail: "Company projects currently open",
      icon: BriefcaseBusiness,
    },
    {
      label: "Active team",
      value: formatted(count("employees")),
      detail: "Employees in your selected company",
      icon: Users,
    },
  ]
  const cards =
    kind === "finance"
      ? [...billing, ...purchasing]
      : kind === "sales"
        ? [
            ...billing,
            {
              label: "Open sales orders",
              value: formatted(count("salesOrders")),
              detail: "Submitted orders awaiting completion",
              icon: BriefcaseBusiness,
            },
          ]
        : kind === "purchasing"
          ? [
              ...purchasing,
              {
                label: "Open purchase orders",
                value: formatted(count("purchaseOrders")),
                detail: "Submitted orders awaiting completion",
                icon: BriefcaseBusiness,
              },
            ]
          : kind === "projects"
            ? [
                projectMetrics[0],
                {
                  label: "Completed projects",
                  value: s.projects.error
                    ? "Unavailable"
                    : formatted(
                        s.projects.records.filter(
                          (p) => p.status === "Completed"
                        ).length
                      ),
                  detail: "Company projects marked complete",
                  icon: BriefcaseBusiness,
                },
              ]
            : kind === "people"
              ? [
                  projectMetrics[1],
                  {
                    label: "Departments",
                    value: s.employees.error
                      ? "Unavailable"
                      : formatted(
                          new Set(
                            s.employees.records
                              .map((p) => p.department)
                              .filter(Boolean)
                          ).size
                        ),
                    detail: "Departments with active team members",
                    icon: Users,
                  },
                ]
              : [...billing, ...projectMetrics]
  return (
    <div
      className={`grid gap-4 ${cards.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : cards.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
    >
      {cards.map((card) => (
        <Card
          key={card.label}
          className="gap-4 bg-gradient-to-t from-muted/40 to-card shadow-xs"
        >
          <CardHeader className="relative gap-2">
            <CardDescription>{card.label}</CardDescription>
            <card.icon
              className="absolute right-6 top-0 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums xl:text-[27px]">
              {card.value}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">
            {card.detail}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
