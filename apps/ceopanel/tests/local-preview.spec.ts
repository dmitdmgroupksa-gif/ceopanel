import { test, expect } from "@playwright/test"
import { dashboards } from "../lib/dashboards"

test("signing in selects authenticated reads even with local preview enabled", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    {
      name: "ceopanel_erpnext_sid",
      value: "authenticated-preview-fixture",
      url: baseURL!,
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "test@example.com",
        company: "Test Company",
        currency: "SAR",
        companies: [{ name: "Test Company", default_currency: "SAR" }],
        siteUrl: "https://example.frappe.cloud",
      },
    }),
  )
  const loaded = page.waitForRequest((request) =>
    request.url().includes("/api/dashboards/sales-comparison"),
  )
  await page.route("**/api/dashboards/**", (route) =>
    route.fulfill({
      status: 403,
      json: { error: "Fixture read permission denied." },
    }),
  )
  await page.goto("/")
  await loaded
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Fixture read permission denied." }),
  ).toBeVisible()
  await expect(page.getByText("Local preview", { exact: true })).toHaveCount(0)
})

test("all eight sections open anonymously without issuing business requests", async ({
  page,
  context,
}) => {
  const api: string[] = [],
    errors: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      api.push(request.url())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  for (const [path, heading] of [
    ["/", "Sales Comparison"],
    ["/workspace", "ERP workspace"],
    ["/agents", "Agents"],
    ["/knowledge", "Knowledge"],
    ["/field-updates", "Field updates"],
    ["/approvals", "Approvals Dashboard"],
    ["/notifications", "Notifications"],
    ["/integrations", "Integration setup"],
  ]) {
    await page.goto(path)
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible()
    await expect(page).not.toHaveURL(/\/login/)
  }
  await page.goto("/workspace#explorer")
  await expect(
    page.getByText("Sign in to read live ERP data.", { exact: true }),
  ).toBeVisible()
  await page.getByRole("tab", { name: "Daily briefing", exact: true }).click()
  await expect(
    page.getByText("Sign in to read live ERP data.", { exact: true }),
  ).toBeVisible()
  expect(api).toEqual([])
  expect(errors).toEqual([])
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "ceopanel_erpnext_sid",
    ),
  ).toBe(false)
})

test("preview navigation and filters work while ERP writes stay disabled", async ({
  page,
}) => {
  async function openSection(name: string) {
    const menu = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    })
    if (await menu.isVisible()) await menu.click()
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name, exact: true })
      .click()
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({
      timeout: 15000,
    })
  }
  await page.goto("/#stock")
  await expect(
    page.getByRole("heading", { name: "Stock Dashboard", exact: true }),
  ).toBeVisible()
  await page.getByLabel("Choose dashboard").selectOption("attendance")
  await page.getByLabel("Reporting period").selectOption("30")
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Attendance Dashboard", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "No data yet", exact: true }),
  ).toBeVisible()
  await openSection("ERP workspace")
  await expect(
    page.getByRole("button", { name: "New record", exact: true }),
  ).toHaveCount(0)
  await openSection("Agents")
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled()
  await openSection("Knowledge")
  await expect(
    page.getByRole("button", { name: "Upload", exact: true }),
  ).toBeDisabled()
  await openSection("Integration setup")
  await expect(
    page.getByRole("button", { name: "View discovery inventory", exact: true }),
  ).toBeDisabled()
})

test("the restored login layout stays available and links to the anonymous preview", async ({
  page,
}, info) => {
  await page.goto("/login")
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible()
  const story = page.getByRole("heading", {
    name: "A clearer view of your business.",
  })
  if (info.project.name === "desktop") await expect(story).toBeVisible()
  else await expect(story).not.toBeVisible()
  await expect(
    page.getByRole("link", { name: "Open local preview", exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/${info.project.name}-restored-login.png`,
    fullPage: true,
  })
  await page.getByRole("button", { name: "Change language" }).click()
  await expect(
    page.getByRole("heading", { name: "مرحباً بعودتك" }),
  ).toBeVisible()
  await page
    .getByRole("link", { name: "فتح المعاينة المحلية", exact: true })
    .click()
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(
    dashboards.length,
    {
      timeout: 15000,
    },
  )
})

test("the local UI switch grants no authenticated ERP identity", async ({
  request,
}) => {
  for (const path of [
    "/api/erpnext/context",
    "/api/erpnext/snapshot?days=30",
  ]) {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
    expect(response.headers()["cache-control"]).toContain("no-store")
  }
})
