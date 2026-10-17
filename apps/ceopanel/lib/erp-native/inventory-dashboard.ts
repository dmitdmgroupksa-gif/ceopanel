import type { DashboardContext } from "../dashboard-server"
import { emptyDashboard, findDashboard, type DashboardId } from "../dashboards"
import { ERPNextError } from "../erpnext-client"
import type { Period } from "../model"
import {
  permissionedReader,
  type NativeReadClient,
} from "./permissioned-reader"

export const inventoryDashboardIds = [
  "warehouse-stock",
] as const satisfies readonly DashboardId[]
const maximumBalances = 10000
export const stockBalanceFields = [
  "name", "item_code", "warehouse", "stock_uom", "actual_qty", "reserved_qty", "projected_qty", "stock_value",
]

function numeric(value: unknown): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim()) ||
    !Number.isFinite(Number(value))
  )
    throw new ERPNextError(
      "A required stock quantity or valuation is unavailable. Totals cannot be calculated.",
      409,
    )
  return Number(value)
}

function identity(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 180)
    throw new ERPNextError(
      "A required stock identity or unit is unavailable.",
      409,
    )
  return value
}

export async function inventoryDashboard(
  erp: NativeReadClient,
  id: DashboardId,
  context: DashboardContext,
  period: Period,
) {
  if (!inventoryDashboardIds.some((value) => value === id))
    throw new ERPNextError("Dashboard not connected.", 409)
  const reader = permissionedReader(erp, context)
  const warehouseSchema = await reader.describe("Warehouse")
  const binSchema = await reader.describe("Bin")
  for (const [schema, field, target] of [
    [warehouseSchema, "company", "Company"],
    [binSchema, "warehouse", "Warehouse"],
    [binSchema, "item_code", "Item"],
    [binSchema, "stock_uom", "UOM"],
  ] as const) {
    if (
      !schema.fields.some(
        (f) =>
          f.fieldname === field &&
          f.fieldtype === "Link" &&
          f.options === target,
      )
    )
      throw new ERPNextError(
        "The stock source relationships are missing or restricted. This view cannot be loaded.",
        403,
      )
  }
  const warehouses = await reader.list("Warehouse", {
    fields: ["name", "company"],
    filters: [["company", "=", context.company]],
    orderBy: "name asc",
  })
  const names = new Set<string>()
  for (const warehouse of warehouses) {
    const name = identity(warehouse.name)
    if (warehouse.company !== context.company)
      throw new ERPNextError(
        "ERP returned a warehouse for a different company.",
        403,
      )
    if (names.has(name))
      throw new ERPNextError(
        "ERP returned duplicate warehouse identities. Refresh this view.",
        409,
      )
    names.add(name)
  }
  const data = emptyDashboard(findDashboard(id)!, period.to, 1, context.company)
  data.currency = context.currency
  const balances = [] as {
    id: string
    item_code: string
    warehouse: string
    stock_uom: string
    actual_qty: number
    reserved_qty: number
    projected_qty: number
    stock_value: number
    status: string
  }[]
  const seenNames = new Set<string>(),
    seenPairs = new Set<string>()
  const warehouseCounts = new Map<string, number>()
  const orderedWarehouses = [...names].sort()
  let stockValue = 0
  // Keep URL filters small, and never query Bin without a verified company scope.
  for (let offset = 0; offset < orderedWarehouses.length; offset += 20) {
    const group = orderedWarehouses.slice(offset, offset + 20)
    const rows = await reader.list("Bin", {
      fields: stockBalanceFields,
      filters: [
        ["warehouse", "in", group],
        ["actual_qty", "!=", 0],
      ],
      orderBy: "name asc",
    })
    if (balances.length + rows.length > maximumBalances)
      throw new ERPNextError(
        "More than 10,000 stock balances match. Use a filtered ERP stock report; partial totals are unavailable.",
        409,
      )
    for (const row of rows) {
      const name = identity(row.name),
        warehouse = identity(row.warehouse)
      const item = identity(row.item_code),
        unit = identity(row.stock_uom)
      if (!group.includes(warehouse))
        throw new ERPNextError(
          "ERP returned stock outside the selected company warehouses.",
          403,
        )
      const pair = JSON.stringify([item, warehouse])
      if (seenNames.has(name) || seenPairs.has(pair))
        throw new ERPNextError(
          "ERP returned duplicate stock balances. Totals are unavailable.",
          409,
        )
      seenNames.add(name)
      seenPairs.add(pair)
      const actual = numeric(row.actual_qty),
        reserved = numeric(row.reserved_qty)
      const projected = numeric(row.projected_qty),
        value = numeric(row.stock_value)
      if (actual === 0)
        throw new ERPNextError(
          "ERP returned stock outside the nonzero on-hand filter.",
          409,
        )
      stockValue += value
      if (!Number.isFinite(stockValue))
        throw new ERPNextError(
          "Stock valuation exceeds the supported range.",
          409,
        )
      warehouseCounts.set(warehouse, (warehouseCounts.get(warehouse) || 0) + 1)
      balances.push({
        id: name,
        item_code: item,
        warehouse,
        stock_uom: unit,
        actual_qty: actual,
        reserved_qty: reserved,
        projected_qty: projected,
        stock_value: value,
        status:
          actual < 0
            ? "Negative stock"
            : reserved > actual
              ? "Reserved above on-hand"
              : "On hand",
      })
    }
  }
  balances.sort(
    (a, b) =>
      a.warehouse.localeCompare(b.warehouse) ||
      a.item_code.localeCompare(b.item_code),
  )
  const counts = [...warehouseCounts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  const points = counts.slice(0, 7).map(([label, count]) => ({ label, count }))
  if (counts.length > 7)
    points.push({
      label: "Other",
      count: counts.slice(7).reduce((sum, [, count]) => sum + count, 0),
    })
  data.metrics = [
    { label: "On-hand stock value", value: stockValue, format: "currency" },
    {
      label: "Item-warehouse balances",
      value: balances.length,
      format: "number",
    },
    {
      label: "Negative stock balances",
      value: balances.filter((r) => r.actual_qty < 0).length,
      format: "number",
    },
    {
      label: "Reserved above on-hand",
      value: balances.filter(
        (r) => r.reserved_qty > 0 && r.reserved_qty > r.actual_qty,
      ).length,
      format: "number",
    },
  ]
  data.chart = {
    type: "bar",
    title: "Balances by warehouse",
    series: [{ key: "count", label: "Item-warehouse balances" }],
    points,
  }
  data.table = {
    columns: [
      ["item_code", "Item"],
      ["warehouse", "Warehouse"],
      ["stock_uom", "Stock UOM"],
      ["actual_qty", "On hand"],
      ["reserved_qty", "Reserved"],
      ["projected_qty", "Projected"],
      ["stock_value", "Stock value"],
      ["status", "Status"],
    ].map(([key, label]) => ({ key, label })),
    rows: balances,
    links: Object.fromEntries(
      balances.map((r) => [
        r.id,
        new URL(`/app/item/${encodeURIComponent(r.item_code)}`, context.siteUrl)
          .href,
      ]),
    ),
  }
  data.note =
    "Current nonzero on-hand Bin balances in readable warehouses of the selected company, including disabled warehouses. Zero on-hand balances are excluded, even if reservations remain. Quantities use each item's stock UOM and are not summed across items. Reserved and projected quantities are ERP values, not available-to-promise guarantees. Valuation is in company currency and is not a historical stock report."
  data.updatedAt = new Date().toISOString()
  data.status = "ready"
  return data
}
