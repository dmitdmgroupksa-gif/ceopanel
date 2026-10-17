import { readFile } from "node:fs/promises"
import { test, expect } from "./fixtures"
import { emptyDashboard, findDashboard } from "../lib/dashboards"

function stock() {
  const data = emptyDashboard(
    findDashboard("warehouse-stock")!,
    "2026-10-17",
    1,
    "Durar",
  )
  data.status = "ready"
  data.note =
    "Nonzero on-hand balances. Quantities retain each item's stock UOM."
  data.metrics.forEach((m, i) => {
    m.value = [70, 2, 1, 0][i]
  })
  data.table = {
    columns: [
      { key: "item", label: "Item" },
      { key: "warehouse", label: "Warehouse" },
      { key: "unit", label: "Stock UOM" },
      { key: "quantity", label: "On hand" },
    ],
    rows: [
      {
        id: "A",
        item: "Item One",
        warehouse: "Warehouse A",
        unit: "Nos",
        quantity: 5,
      },
      {
        id: "B",
        item: "Item Two",
        warehouse: "Warehouse B",
        unit: "Kg",
        quantity: -2,
      },
    ],
    links: { A: "https://example.frappe.cloud/app/item/ITEM-ONE" },
  }
  return data
}

test("warehouse balances retain company controls, units, native links and filtered exports", async ({
  page,
}) => {
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "test@example.com",
        company: "Durar",
        currency: "SAR",
        companies: [
          { name: "Durar", default_currency: "SAR" },
          { name: "Other", default_currency: "SAR" },
        ],
        siteUrl: "https://example.frappe.cloud",
      },
    }),
  )
  await page.route("**/api/dashboards/warehouse-stock?**", (route) =>
    route.fulfill({ json: stock() }),
  )
  await page.goto("/#warehouse-stock")
  await expect(
    page.getByRole("heading", { name: "Warehouse Stock", exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel("Reporting period")).toHaveCount(0)
  await expect(page.getByLabel("Select company", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "Kg", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "-2", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Item One", exact: true }),
  ).toHaveAttribute("href", "https://example.frappe.cloud/app/item/ITEM-ONE")
  await page.getByLabel("Search dashboard records").fill("Warehouse B")
  await expect(
    page.getByRole("cell", { name: "Kg", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Item One", exact: true }),
  ).toHaveCount(0)
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const file = await pending
  const csv = await readFile((await file.path())!, "utf8")
  expect(csv).toContain('"Durar","Warehouse Stock"')
  expect(csv).toContain("stock UOM")
  expect(csv).toContain('"Search","Warehouse B"')
  expect(csv).toContain("Item Two")
  expect(csv).not.toContain("Item One")
  const dimensions = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ])
  expect(dimensions[0]).toBeLessThanOrEqual(dimensions[1])
})

test("a denied stock refresh removes the former valuation and export", async ({
  page,
}) => {
  let denied = false
  await page.route("**/api/dashboards/warehouse-stock?**", (route) =>
    denied
      ? route.fulfill({
          status: 403,
          json: { error: "Stock access is no longer available." },
        })
      : route.fulfill({ json: stock() }),
  )
  await page.goto("/#warehouse-stock")
  await expect(
    page.getByRole("cell", { name: "Kg", exact: true }),
  ).toBeVisible()
  denied = true
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Stock access is no longer available." }),
  ).toBeVisible()
  await expect(page.getByRole("cell", { name: "Kg", exact: true })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toHaveCount(0)
})
