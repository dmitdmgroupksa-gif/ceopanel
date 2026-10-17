import { test, expect } from "./fixtures"
import { emptyDashboard, findDashboard } from "../lib/dashboards"

function employee() {
  return {
    user: "employee@example.com",
    company: "Durar",
    currency: "SAR",
    companies: [
      { name: "Durar", default_currency: "SAR" },
      { name: "Second Company", default_currency: "USD" },
    ],
    siteUrl: "https://example.frappe.cloud",
    roles: ["Desk User", "Employee"],
    dashboardIds: ["quotation-team"],
  }
}
test("opening dashboards from the workspace waits for native dashboard permissions", async ({
  page,
}) => {
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/api/erpnext/context**", async (route) => {
    const navigation =
      new URL(route.request().url()).searchParams.get("navigation") !== "0"
    if (navigation) await waiting
    const context: Record<string, unknown> = employee()
    if (!navigation) delete context.dashboardIds
    await route.fulfill({ json: context })
  })
  await page.goto("/workspace")
  await expect(
    page.getByRole("heading", { name: "ERP workspace", exact: true })
  ).toBeVisible()
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole("link", { name: "Dashboards", exact: true }).click()
  try {
    await expect(
      page.getByText("Verifying your company session…", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: "HR Dashboard", exact: true })
    ).toHaveCount(0)
  } finally {
    release()
  }
  await expect(
    page.getByRole("tab", { name: "Quotation Team Dashboard", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "HR Dashboard", exact: true })
  ).toHaveCount(0)
})
test("employees see only permitted dashboards and a direct restricted link shows No access", async ({
  page,
}) => {
  let forbiddenReads = 0
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({ json: employee() })
  )
  await page.route("**/api/dashboards/hr?**", (route) => {
    forbiddenReads++
    return route.fulfill({ status: 403, json: { error: "No access" } })
  })
  await page.goto("/#hr")
  await expect(
    page.getByRole("heading", { name: "No access", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "HR Dashboard", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("tab", { name: "Quotation Team Dashboard", exact: true })
  ).toBeVisible()
  expect(forbiddenReads).toBe(0)
  await page.getByLabel("Choose dashboard").selectOption("quotation-team")
  await expect(
    page.getByRole("heading", {
      name: "Quotation Team Dashboard",
      exact: true,
    })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "No access", exact: true })
  ).toHaveCount(0)
})

test("personal MCP setup is available to ordinary employees and shows only their connections", async ({
  page,
}) => {
  let revoked: unknown
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({ json: employee() })
  )
  await page.route("**/api/platform/mcp-settings?**", (route) =>
    route.fulfill({
      json: {
        user: employee().user,
        company: "Durar",
        endpoint: "https://panel.example/api/mcp",
        ready: true,
        erpRead: true,
        scopes: ["ceopanel:read", "ceopanel:erp-read"],
        reason: null,
      },
    })
  )
  await page.route("**/api/mcp/oauth/grants?**", (route) =>
    route.fulfill({
      json: revoked
        ? []
        : [
            {
              id: "00000000-0000-4000-8000-000000000001",
              client: "My external client",
              agent: "executive",
              company: "Second Company",
              scopes: ["ceopanel:read", "ceopanel:erp-read"],
              expires_at: "2099-10-17T18:00:00Z",
              revoked_at: null,
            },
          ],
    })
  )
  await page.route("**/api/mcp/oauth/revoke-owned", async (route) => {
    revoked = route.request().postDataJSON()
    await route.fulfill({ json: { revoked: true } })
  })
  await page.goto("/integrations")
  await expect(page.getByText("MCP connections", { exact: true })).toBeVisible()
  await expect(page.getByLabel("MCP server URL")).toHaveValue(
    "https://panel.example/api/mcp"
  )
  await expect(
    page.getByRole("main").getByText("employee@example.com", { exact: true })
  ).toBeVisible()
  await expect(page.getByText("My external client · executive")).toBeVisible()
  await expect(
    page.locator("p").filter({ hasText: /^Second Company$/ })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "View discovery inventory" })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Check rollout configuration" })
  ).toHaveCount(0)
  await page.getByRole("button", { name: "Revoke access", exact: true }).click()
  await expect(
    page.getByText("No authorized connections.", { exact: true })
  ).toBeVisible()
  expect(revoked).toEqual({
    id: "00000000-0000-4000-8000-000000000001",
    company: "Durar",
  })
})

test("dashboard series have distinct colours in light and dark themes", async ({
  page,
}) => {
  await page.route("**/api/dashboards/sales-comparison?**", (route) => {
    const data = emptyDashboard(
      findDashboard("sales-comparison")!,
      "2026-10-17",
      30,
      "Durar"
    )
    data.status = "ready"
    data.chart = {
      title: "Comparison",
      series: [
        { key: "current", label: "Current" },
        { key: "previous", label: "Previous" },
      ],
      points: [
        { label: "One", current: 1, previous: 2 },
        { label: "Two", current: 3, previous: 1 },
      ],
    }
    return route.fulfill({ json: data })
  })
  await page.goto("/#sales-comparison")
  await expect(page.getByLabel("Chart series")).toBeVisible()
  await expect(page.locator(".recharts-area-curve")).toHaveCount(2)
  const strokes = () =>
    page
      .locator(".recharts-area-curve")
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).stroke)
      )
  const light = await strokes()
  expect(new Set(light).size).toBe(2)
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  const dark = await strokes()
  expect(new Set(dark).size).toBe(2)
  expect(dark).not.toEqual(light)
})
