import { test, expect, type Page } from "@playwright/test"
import { dashboards, emptyDashboard } from "../lib/dashboards"

async function openLogin(page: Page) {
  await page
    .getByRole("button", { name: "Connect ERPNext", exact: true })
    .click()
  await page.getByLabel("ERPNext email or username").fill("test@example.com")
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password")
}

test("all 18 CEO tabs are reachable without loading guessed business data", async ({
  page,
}, info) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => requests.push(request.url()))
  await page.goto("/")
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible()
  const tabs = page.getByRole("tablist", { name: "CEO dashboards" })
  await expect(tabs.getByRole("tab")).toHaveCount(18)
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0)
  for (const dashboard of dashboards) {
    await tabs.getByRole("tab", { name: dashboard.title, exact: true }).click()
    await expect(
      page.getByRole("heading", { name: dashboard.title, exact: true })
    ).toBeVisible()
    await expect(
      page.getByText(
        "Awaiting your data source. No company records have been loaded for this dashboard."
      )
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Export", exact: true })
    ).toBeDisabled()
    await expect(page.getByText("Awaiting data", { exact: true })).toHaveCount(
      4
    )
  }
  expect(requests.some((url) => url.includes("/api/erpnext/snapshot"))).toBe(
    false
  )
  expect(
    requests.some((url) => url.startsWith("https://dmgroup.frappe.cloud"))
  ).toBe(false)
  const width = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }))
  expect(width.doc).toBeLessThanOrEqual(width.view)
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/${info.project.name}-ceo-crm.png`,
    fullPage: true,
  })
  await page.getByRole("button", { name: "Toggle color theme" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  expect(errors).toEqual([])
})

test("direct links, quick dashboard selection, and period filters work", async ({
  page,
}) => {
  await page.goto("/#stock")
  await expect(
    page.getByRole("heading", { name: "Stock Dashboard", exact: true })
  ).toBeVisible()
  await page.getByLabel("Choose dashboard").selectOption("attendance")
  await expect(
    page.getByRole("heading", { name: "Attendance Dashboard", exact: true })
  ).toBeVisible()
  await expect(page).toHaveURL(/#attendance$/)
  const loaded = page.waitForResponse(
    (response) =>
      response.url().includes("/api/dashboards/attendance?") &&
      response.url().includes("days=30") &&
      response.status() === 200
  )
  await page.getByLabel("Reporting period").selectOption("30")
  await loaded
  await expect(page.getByLabel("Reporting period")).toHaveValue("30")
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true })
  ).toBeEnabled()
  await page.goBack()
  await expect(
    page.getByRole("heading", { name: "Stock Dashboard", exact: true })
  ).toBeVisible()
})

test("ERPNext sign-in does not assign any dashboard's data source", async ({
  page,
}) => {
  await page.route("**/api/erpnext/session", (route) =>
    route.fulfill({ json: { ok: true } })
  )
  await page.route("**/api/erpnext/context**", (route) => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({
      json: {
        user: "test@example.com",
        company: params.get("company") || "Durar Masagh LLC",
        currency: "SAR",
        siteUrl: "https://dmgroup.frappe.cloud",
        companies: [
          { name: "Durar Masagh LLC", default_currency: "SAR" },
          { name: "Branch company", default_currency: "SAR" },
        ],
      },
    })
  })
  await page.goto("/")
  await openLogin(page)
  await page
    .getByRole("button", { name: "Sign in to ERPNext", exact: true })
    .click()
  await expect(
    page.getByText("ERPNext connected", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Dashboard data setup pending.", { exact: true })
  ).toBeVisible()
  await page.getByLabel("Select company").selectOption("Branch company")
  await expect(page.getByLabel("Select company")).toHaveValue("Branch company")
  await expect(page.getByText("Awaiting data", { exact: true })).toHaveCount(4)
  await page.getByRole("button", { name: "Sign out", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Connect ERPNext", exact: true })
  ).toBeVisible()
})

test("a future adapter can populate metrics, charts, records, search, and exports", async ({
  page,
}) => {
  await page.route("**/api/dashboards/sales-comparison?**", (route) => {
    const data = emptyDashboard(dashboards[0], "2026-10-14")
    data.status = "ready"
    data.metrics[0].value = 120000
    data.metrics[0].format = "currency"
    data.chart.series = [{ key: "sales", label: "Sales" }]
    data.chart.points = [
      { label: "September", sales: 80000 },
      { label: "October", sales: 120000 },
    ]
    data.table.rows = [
      {
        id: "1",
        column_0: "October",
        column_1: "Team A",
        column_2: 120000,
        column_3: 80000,
        column_4: "50%",
      },
    ]
    return route.fulfill({ json: data })
  })
  await page.goto("/")
  await expect(page.getByText("SAR 120,000", { exact: true })).toBeVisible()
  await page.getByLabel("Search dashboard records").fill("no match")
  await expect(
    page.getByText("No records in this view.", { exact: true })
  ).toBeVisible()
  await page.getByLabel("Search dashboard records").fill("Team A")
  await expect(
    page.getByRole("cell", { name: "Team A", exact: true })
  ).toBeVisible()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  expect((await download).suggestedFilename()).toBe(
    "sales-comparison-2026-10-14.csv"
  )
})
