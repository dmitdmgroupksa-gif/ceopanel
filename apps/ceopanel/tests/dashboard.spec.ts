import { test, expect, type Page } from "@playwright/test"
import { demoSnapshot } from "../lib/demo"

async function openLogin(page: Page) {
  await page
    .getByRole("button", { name: "Connect ERPNext", exact: true })
    .click()
  await page.getByLabel("ERPNext email or username").fill("test@example.com")
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password")
}

test("company tabs replace the sidebar and work on desktop and mobile", async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Company overview" })
  ).toBeVisible()
  await expect(
    page.getByRole("tablist", { name: "Company management" }).getByRole("tab")
  ).toHaveCount(7)
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0)
  await expect(page.getByText("Preview data.", { exact: true })).toBeVisible()
  // Confirm hydration before screenshots change input caret styles.
  await page.getByRole("button", { name: "Toggle color theme" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "Toggle color theme" }).click()
  await expect(page.locator("html")).not.toHaveClass(/dark/)
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/${info.project.name}-overview.png`,
    fullPage: true,
  })
  for (const name of [
    "Finance",
    "Sales",
    "Purchasing",
    "Projects",
    "People",
    "Reports",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click()
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  }
  const width = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }))
  expect(width.doc).toBeLessThanOrEqual(width.view)
  await page.getByRole("button", { name: "Toggle color theme" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/${info.project.name}-reports-dark.png`,
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test("attention shortcuts open the corresponding records", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /Overdue payables/ }).click()
  await expect(
    page.getByRole("heading", { name: "Purchasing", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "Payables", exact: true })
  ).toHaveAttribute("data-state", "active")
  await expect(
    page.getByText("Outstanding purchase invoices across all dates")
  ).toBeVisible()
})

test("period, search, sorting, paging, and CSV export work", async ({
  page,
}) => {
  await page.goto("/#finance")
  await expect(
    page.getByRole("heading", { name: "Finance", exact: true })
  ).toBeVisible()
  await page.getByLabel("Reporting period").selectOption("30")
  await expect(page.getByLabel("Reporting period")).toHaveValue("30")
  await page
    .getByRole("textbox", { name: "Search current view", exact: true })
    .fill("no matching company")
  await expect(page.getByText("No records match your search.")).toBeVisible()
  await page
    .getByRole("textbox", { name: "Search current view", exact: true })
    .fill("")
  await page.getByRole("button", { name: "Due date", exact: true }).click()
  await expect(
    page.getByRole("columnheader", { name: "Due date" })
  ).toHaveAttribute("aria-sort", "ascending")
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await expect(page.getByText(/Page 2 of/)).toBeVisible()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/^PREVIEW-receivables/)
})

test("failed ERPNext sign-in remains clearly in preview", async ({ page }) => {
  await page.route("**/api/erpnext/session", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "Check your ERPNext credentials." },
    })
  )
  await page.goto("/")
  await openLogin(page)
  await page
    .getByRole("button", { name: "Sign in to ERPNext", exact: true })
    .click()
  await expect(page.getByRole("alert")).toHaveText(
    "Check your ERPNext credentials."
  )
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("")
  await expect(page.getByText("Preview data.", { exact: true })).toBeVisible()
})

test("live views preserve permission failures and stale data without substituting preview", async ({
  page,
}) => {
  await page.route("**/api/erpnext/session", (route) =>
    route.fulfill({ json: { ok: true } })
  )
  let expired = false
  await page.route("**/api/erpnext/snapshot?**", (route) => {
    if (expired)
      return route.fulfill({
        status: 401,
        json: { error: "Your ERPNext session expired. Please sign in again." },
      })
    const params = new URL(route.request().url()).searchParams
    const snapshot = demoSnapshot(
      "2026-10-14",
      Number(params.get("days")) || 90
    )
    snapshot.mode = "live"
    snapshot.company = params.get("company") || "Durar Masagh LLC"
    snapshot.user = "test@example.com"
    snapshot.companies = [
      { name: "Durar Masagh LLC", default_currency: "SAR" },
      { name: "Branch company", default_currency: "SAR" },
    ]
    snapshot.syncedAt = "2026-10-14T09:00:00Z"
    snapshot.sources.employees = {
      records: [],
      error:
        "Your ERPNext account does not have permission to read these records.",
    }
    return route.fulfill({ json: snapshot })
  })
  await page.goto("/")
  await openLogin(page)
  await page
    .getByRole("button", { name: "Sign in to ERPNext", exact: true })
    .click()
  await expect(page.getByText("Preview data.", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/1 data source is unavailable/)).toBeVisible()
  await page.getByRole("tab", { name: "People", exact: true }).click()
  await expect(
    page.getByText(
      "Your ERPNext account does not have permission to read these records."
    )
  ).toBeVisible()
  await expect(
    page.getByText("Unavailable", { exact: true }).first()
  ).toBeVisible()
  await page.getByLabel("Select company").selectOption("Branch company")
  await expect(page.getByLabel("Select company")).toHaveValue("Branch company")
  await expect(
    page.locator("main").getByText("Branch company", { exact: true }).first()
  ).toBeVisible()
  expired = true
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "session expired"
  )
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "last successful snapshot"
  )
  await expect(page.getByText("Preview data.", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Sign out", exact: true }).click()
  await expect(page.getByText("Preview data.", { exact: true })).toBeVisible()
})
