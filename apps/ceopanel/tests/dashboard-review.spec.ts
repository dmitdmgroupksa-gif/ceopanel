import { test, expect } from "./fixtures"
import { emptyDashboard, findDashboard } from "../lib/dashboards"
import { pendingSchema, standardModules } from "../lib/workspace"

function facilities(days: number, name: string) {
  const data = emptyDashboard(
    findDashboard("facilities")!,
    "2026-10-17",
    days,
    "Durar",
  )
  data.status = "ready"
  data.metrics.forEach((metric) => (metric.value = 1))
  data.table = {
    columns: [{ key: "name", label: "Facility" }],
    rows: [{ id: name, name }],
  }
  return data
}

for (const status of [403, 409, 503]) {
  test(`a failed dashboard refresh (${status}) removes old records and export`, async ({
    page,
  }) => {
    let denied = false
    await page.route("**/api/dashboards/facilities?**", (route) =>
      denied
        ? route.fulfill({
            status,
            json: { error: "The current register is unavailable." },
          })
        : route.fulfill({
            json: facilities(90, "Previously readable facility"),
          }),
    )
    await page.goto("/#facilities")
    await expect(
      page.getByRole("cell", {
        name: "Previously readable facility",
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Export", exact: true }),
    ).toBeVisible()
    denied = true
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "The current register is unavailable." }),
    ).toBeVisible()
    await expect(
      page.getByRole("cell", {
        name: "Previously readable facility",
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Export", exact: true }),
    ).toHaveCount(0)
  })
}

test("changing period hides the previous period's register while the new request is pending", async ({
  page,
}) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/api/dashboards/facilities?**", async (route) => {
    const days = Number(new URL(route.request().url()).searchParams.get("days"))
    if (days === 30) await pending
    await route.fulfill({
      json: facilities(
        days,
        days === 30 ? "New period facility" : "Old period facility",
      ),
    })
  })
  try {
    await page.goto("/#facilities")
    await expect(
      page.getByRole("cell", { name: "Old period facility", exact: true }),
    ).toBeVisible()
    const requested = page.waitForRequest(
      (r) =>
        r.url().includes("/api/dashboards/facilities?") &&
        r.url().includes("days=30"),
    )
    await page.getByLabel("Reporting period").selectOption("30")
    await requested
    await expect(
      page.getByRole("cell", { name: "Old period facility", exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Export", exact: true }),
    ).toHaveCount(0)
    release()
    await expect(
      page.getByRole("cell", { name: "New period facility", exact: true }),
    ).toBeVisible()
  } finally {
    release()
  }
})

test("a workspace permission failure removes previously readable records", async ({
  page,
}) => {
  let denied = false
  const schema = {
    ...pendingSchema(standardModules[0]),
    ready: true,
    columns: [{ key: "name", label: "Record" }],
    permissions: {
      read: true,
      create: false,
      edit: false,
      submit: false,
      cancel: false,
    },
  }
  await page.route("**/api/workspace/modules/customers**", (route) => {
    if (denied)
      return route.fulfill({
        status: 403,
        json: { error: "Record access has been revoked." },
      })
    const path = new URL(route.request().url()).pathname
    return route.fulfill({
      json: path.endsWith("/records")
        ? {
            records: [
              {
                name: "PREVIOUS-CUSTOMER",
                docstatus: 0,
                modified: "2026-10-17",
                values: {},
              },
            ],
            hasMore: false,
          }
        : schema,
    })
  })
  await page.goto("/workspace")
  await expect(
    page.getByRole("button", { name: "PREVIOUS-CUSTOMER", exact: true }),
  ).toBeVisible()
  denied = true
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Record access has been revoked." }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "PREVIOUS-CUSTOMER", exact: true }),
  ).toHaveCount(0)
})

test("rapid company selection cancels the earlier request and keeps the latest company", async ({
  page,
}) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/api/erpnext/context**", async (route) => {
    const company =
      new URL(route.request().url()).searchParams.get("company") || "Durar"
    if (company === "Earlier") await pending
    // An aborted intercepted request may already be gone when released.
    await route
      .fulfill({
        json: {
          user: "test@example.com",
          company,
          currency: "SAR",
          siteUrl: "https://example.frappe.cloud",
          companies: ["Durar", "Earlier", "Latest"].map((name) => ({
            name,
            default_currency: "SAR",
          })),
        },
      })
      .catch((error) => {
        if (company !== "Earlier") throw error
      })
  })
  try {
    await page.goto("/")
    const picker = page.getByLabel("Select company")
    await expect(picker).toHaveValue("Durar")
    const requested = page.waitForRequest((r) =>
      r.url().includes("/api/erpnext/context?company=Earlier"),
    )
    await picker.selectOption("Earlier")
    await requested
    const cancelled = page.waitForEvent("requestfailed", {
      predicate: (r) =>
        r.url().includes("/api/erpnext/context?company=Earlier"),
    })
    await picker.selectOption("Latest")
    await expect(picker).toHaveValue("Latest")
    release()
    await cancelled
    await expect(picker).toHaveValue("Latest")
  } finally {
    release()
  }
})
