import type { Page } from "@playwright/test"
import { test, expect, changeLanguage } from "./fixtures"

async function stagingAdministrator(page: Page) {
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "admin@example.com",
        company: "Durar",
        currency: "SAR",
        companies: [{ name: "Durar" }],
        siteUrl: "https://example.frappe.cloud",
      },
    }),
  )
  await page.route("**/api/platform/inputs?**", (route) =>
    route.fulfill({ json: { categories: [], external: [] } }),
  )
}

test("rollout checks are explicit and bilingual, and discovery can be downloaded for mapping", async ({
  page,
}) => {
  await stagingAdministrator(page)
  await page.route("**/api/platform/readiness?**", (route) =>
    route.fulfill({
      json: {
        verification: "configuration_inventory_only",
        environment: "staging",
        configured: false,
        liveAcceptanceRequired: true,
        checks: [
          {
            id: "company",
            phase: "foundation",
            state: "blocked",
            title: "Exact ERP Company",
            detail:
              "Set ERPNEXT_COMPANY to the exact Company document name from ERPNext.",
          },
        ],
      },
    }),
  )
  await page.route("**/api/platform/inventory?**", (route) =>
    route.fulfill({ json: { discovery: { schemas: {} } } }),
  )
  await page.goto("/integrations")
  const check = page.getByRole("button", {
    name: "Check rollout configuration",
    exact: true,
  })
  await expect(check).toBeEnabled()
  await check.click()
  await expect(
    page.getByText("Exact ERP Company", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      "Configuration checks do not replace live ERP, KPI, AI and delivery acceptance tests.",
      { exact: true },
    ),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "View discovery inventory", exact: true })
    .click()
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download discovery inventory", exact: true })
    .click()
  expect((await download).suggestedFilename()).toBe("ceopanel-discovery.json")
  await changeLanguage(page)
  await expect(
    page.getByText("قائمة التحقق من الإطلاق", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("اسم الشركة المطابق في ERP", { exact: true }),
  ).toBeVisible()
  const width = await page.evaluate(() => ({
    actual: document.documentElement.scrollWidth,
    available: innerWidth,
  }))
  expect(width.actual).toBeLessThanOrEqual(width.available)
})

test("rollout checks show permission failures without displaying a configuration report", async ({
  page,
}) => {
  await stagingAdministrator(page)
  await page.route("**/api/platform/readiness?**", (route) =>
    route.fulfill({
      status: 403,
      json: { error: "Administrator access required." },
    }),
  )
  await page.goto("/integrations")
  await page
    .getByRole("button", { name: "Check rollout configuration", exact: true })
    .click()
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Administrator access required." }),
  ).toHaveText("Administrator access required.")
  await expect(
    page.getByText("Exact ERP Company", { exact: true }),
  ).toHaveCount(0)
})
test("input preparation shows ERP-first sources and Saudi banking without claiming live connectivity", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/integrations")
  await expect(page.getByText("Data inputs", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Saudi banking preparation", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Direct transfers are disabled.", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText("Awaiting configuration", { exact: true }),
  ).toHaveCount(7)
  await changeLanguage(page)
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(
    page.getByText("جاهزية الخدمات المصرفية السعودية", { exact: true }),
  ).toBeVisible()
  const width = await page.evaluate(() => ({
    actual: document.documentElement.scrollWidth,
    available: innerWidth,
  }))
  expect(width.actual).toBeLessThanOrEqual(width.available)
  expect(errors).toEqual([])
})
