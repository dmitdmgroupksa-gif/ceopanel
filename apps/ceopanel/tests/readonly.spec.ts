import { test, expect } from "./fixtures"
import {
  nativeDashboard,
  nativeDashboardIds,
} from "../lib/erp-native/dashboards"
import { dashboards } from "../lib/dashboards"
import { makePeriod } from "../lib/model"

test("ERP exports require authentication even with a file descriptor", async ({
  request,
}) => {
  const response = await request.get(
    "/api/erp/files?request=descriptor-is-not-authorization",
  )
  expect(response.status()).toBe(401)
  expect(response.headers()["cache-control"]).toContain("no-store")
})

test("native dashboards render scoped results and explain their calculation scope", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/api/dashboards/**", async (route) => {
    const url = new URL(route.request().url())
    const id = url.pathname
      .split("/")
      .pop() as (typeof nativeDashboardIds)[number]
    const data = await nativeDashboard(
      { list: async () => [] },
      id,
      {
        user: "test@example.com",
        company: "Durar",
        currency: "SAR",
        companies: [],
        siteUrl: "https://example.frappe.cloud",
      },
      makePeriod(Number(url.searchParams.get("days") || 90), "2026-10-15"),
    )
    return route.fulfill({ json: data })
  })
  await page.goto("/")
  for (const id of nativeDashboardIds) {
    await page.getByLabel("Choose dashboard").selectOption(id)
    await expect(
      page.getByRole("heading", {
        name: dashboards.find((item) => item.id === id)!.title,
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Export", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText("This dashboard is not connected yet.", { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Export", exact: true }),
    ).toBeDisabled()
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
})

test("permission failures show an error rather than invented empty totals", async ({
  page,
}) => {
  await page.route("**/api/dashboards/**", (route) =>
    route.fulfill({
      status: 403,
      json: {
        error:
          "Your ERPNext account does not have permission to read these records.",
      },
    }),
  )
  await page.goto("/#attendance")
  await expect(
    page.getByRole("alert").filter({ hasText: "does not have permission" }),
  ).toBeVisible()
  await expect(
    page.getByText("This dashboard is not connected yet.", { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toHaveCount(0)
})

test("workspace mutation endpoints stay disabled without forwarding requests to ERP", async ({
  request,
}) => {
  for (const [method, suffix] of [
    ["POST", ""],
    ["PUT", "/CUSTOMER-1"],
    ["POST", "/CUSTOMER-1/actions"],
  ]) {
    const response = await request.fetch(
      `/api/workspace/modules/customers/records${suffix}`,
      {
        method,
        data: {
          values: { customer_name: "Must not be created" },
          action: "submit",
        },
      },
    )
    expect(response.status()).toBe(403)
    expect((await response.json()).error).toContain("read-only")
  }
})
