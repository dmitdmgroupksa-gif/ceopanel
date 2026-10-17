import { describe, expect, it, vi } from "vitest"
import { inventoryDashboard } from "./inventory-dashboard"
import { ERPNextError } from "../erpnext-client"
import { makePeriod } from "../model"

const context = {
  user: "reader",
  roles: ["Stock User"],
  company: "A",
  currency: "SAR",
  companies: [],
  siteUrl: "https://erp.example",
}
const period = makePeriod(90, "2026-10-17")
const balance = (values: Record<string, unknown> = {}) => ({
  name: "BIN-1",
  item_code: "ITEM-1",
  warehouse: "WH-1",
  stock_uom: "Nos",
  actual_qty: 5,
  reserved_qty: 2,
  projected_qty: 8,
  stock_value: 50,
  ...values,
})
function fixture(
  bins = [balance()],
  warehouses = [{ name: "WH-1", company: "A" }],
) {
  const meta = {
    Warehouse: {
      name: "Warehouse",
      module: "Stock",
      fields: [
        {
          fieldname: "company",
          fieldtype: "Link",
          options: "Company",
          permlevel: 0,
        },
      ],
    },
    Bin: {
      name: "Bin",
      module: "Stock",
      fields: Object.keys(balance())
        .filter((key) => key !== "name")
        .map((fieldname) => ({
          fieldname,
          fieldtype: ["item_code", "warehouse", "stock_uom"].includes(fieldname)
            ? "Link"
            : "Float",
          options: (
            {
              item_code: "Item",
              warehouse: "Warehouse",
              stock_uom: "UOM",
            } as Record<string, string>
          )[fieldname],
          permlevel: 0,
        })),
    },
  }
  const erp = {
    roles: vi.fn(async () => context.roles),
    canRead: vi.fn(async (_name: string) => true),
    request: vi.fn(async (raw: string) => {
      const url = new URL(raw, context.siteUrl)
      return {
        docs: [meta[url.searchParams.get("doctype") as keyof typeof meta]],
      }
    }),
    page: vi.fn(async () => []),
    // Deliberately return the supplied rows without emulating query filters.
    // The adapter must reject ignored filters instead of trusting the server.
    list: vi.fn(
      async (doctype: string, _query: unknown): Promise<any[]> =>
        doctype === "Warehouse" ? warehouses : bins,
    ),
  }
  return {
    erp,
    meta,
    load: () => inventoryDashboard(erp, "warehouse-stock", context, period),
  }
}

describe("company warehouse stock", () => {
  it("joins company warehouses, preserves item units and reports signed valuation", async () => {
    const f = fixture([
      balance({ stock_value: "50.25" }),
      balance({
        name: "BIN-2",
        item_code: "ITEM/2",
        stock_uom: "Kg",
        actual_qty: -2,
        reserved_qty: 0,
        stock_value: -10,
      }),
      balance({
        name: "BIN-3",
        item_code: "ITEM-3",
        actual_qty: 3,
        reserved_qty: 5,
        stock_value: 30,
      }),
    ])
    const data = await f.load()
    expect(data.status).toBe("ready")
    expect(data.company).toBe("A")
    expect(data.period).toEqual(makePeriod(1, period.to))
    expect(data.metrics.map((m) => m.value)).toEqual([70.25, 3, 1, 1])
    expect(data.table.rows.map((r) => r.stock_uom)).toContain("Kg")
    expect(data.table.rows.find((r) => r.id === "BIN-2")?.status).toBe(
      "Negative stock",
    )
    expect(data.table.links?.["BIN-2"]).toBe(
      "https://erp.example/app/item/ITEM%2F2",
    )
    expect(data.chart.points).toEqual([{ label: "WH-1", count: 3 }])
    expect(f.erp.list).toHaveBeenCalledWith(
      "Bin",
      expect.objectContaining({
        filters: [
          ["warehouse", "in", ["WH-1"]],
          ["actual_qty", "!=", 0],
        ],
        orderBy: "name asc",
      }),
    )
  })
  it("never requests unscoped balances when no company warehouse is readable", async () => {
    const f = fixture([], [])
    const data = await f.load()
    expect(data.metrics.map((m) => m.value)).toEqual([0, 0, 0, 0])
    expect(f.erp.list.mock.calls.map(([name]) => name)).toEqual(["Warehouse"])
  })
  it.each(["Warehouse", "Bin"])(
    "preserves native %s read denial",
    async (doctype) => {
      const f = fixture()
      f.erp.canRead.mockImplementation(async (name) => name !== doctype)
      await expect(f.load()).rejects.toMatchObject({ status: 403 })
      expect(f.erp.list).not.toHaveBeenCalled()
    },
  )
  it("does not read restricted valuation fields", async () => {
    const f = fixture()
    f.meta.Bin.fields.find(
      (field) => field.fieldname === "stock_value",
    )!.permlevel = 1
    await expect(f.load()).rejects.toMatchObject({ status: 403 })
    expect(f.erp.list.mock.calls.map(([name]) => name)).not.toContain("Bin")
  })
  it("requires the effective native warehouse/company relationship", async () => {
    const f = fixture()
    f.meta.Warehouse.fields[0].options = "Customer"
    await expect(f.load()).rejects.toMatchObject({ status: 403 })
    expect(f.erp.list).not.toHaveBeenCalled()
  })
  it.each(
    [
      [{ name: "WH-1", company: "B" }],
      [
        { name: "WH-1", company: "A" },
        { name: "WH-1", company: "A" },
      ],
    ].map((warehouses) => ({ warehouses })),
  )(
    "rejects cross-company and duplicate warehouses",
    async ({ warehouses }) => {
      await expect(fixture([], warehouses).load()).rejects.toThrow()
    },
  )
  it("rejects a balance from outside the verified warehouse group", async () => {
    await expect(
      fixture([balance({ warehouse: "OTHER" })]).load(),
    ).rejects.toMatchObject({ status: 403 })
  })
  it.each(
    [
      [balance(), balance()],
      [balance(), balance({ name: "DIFFERENT" })],
    ].map((rows) => ({ rows })),
  )(
    "rejects duplicate identities and item/warehouse pairs",
    async ({ rows }) => {
      await expect(fixture(rows).load()).rejects.toThrow("duplicate stock")
    },
  )
  it.each([null, "", "invalid", Infinity, undefined])(
    "rejects unavailable financial values: %s",
    async (value) => {
      await expect(
        fixture([balance({ stock_value: value })]).load(),
      ).rejects.toThrow()
    },
  )
  it.each([
    { actual_qty: 0 },
    { actual_qty: null },
    { stock_uom: "" },
    { item_code: null },
  ])(
    "rejects ignored filters and unavailable quantities/units",
    async (values) => {
      await expect(fixture([balance(values)]).load()).rejects.toThrow()
    },
  )
  it("propagates incomplete reads rather than displaying a partial valuation", async () => {
    const f = fixture()
    f.erp.list.mockImplementation(async (doctype) => {
      if (doctype === "Warehouse") return [{ name: "WH-1", company: "A" }]
      throw new ERPNextError("More than 10,000 records match this view.")
    })
    await expect(f.load()).rejects.toThrow("10,000")
  })
  it("bounds warehouse batches and checks the combined result cap", async () => {
    const warehouses = Array.from({ length: 21 }, (_, i) => ({
      name: `WH-${String(i).padStart(2, "0")}`,
      company: "A",
    }))
    const f = fixture([], warehouses)
    f.erp.list.mockImplementation(async (doctype, input: any) => {
      if (doctype === "Warehouse") return warehouses
      const group = input.filters[0][2] as string[]
      expect(group.length).toBeLessThanOrEqual(20)
      return Array.from({ length: group.length === 20 ? 10000 : 1 }, (_, i) =>
        balance({
          name: `${group[0]}-${i}`,
          item_code: `ITEM-${i}`,
          warehouse: group[0],
        }),
      )
    })
    await expect(f.load()).rejects.toThrow("10,000 stock balances")
  })
})
