import { readFile } from "node:fs/promises"
import { test, expect } from "./fixtures"
import { emptyDashboard, findDashboard } from "../lib/dashboards"

test("facilities uses upcoming periods and exports the displayed scoped register", async ({
  page,
}, info) => {
  await page.route("**/api/dashboards/facilities?**", (route) => {
    const days = Number(new URL(route.request().url()).searchParams.get("days"))
    const data = emptyDashboard(
      findDashboard("facilities")!,
      "2026-10-17",
      days,
      "Durar",
    )
    data.status = "ready"
    data.note = "Recorded Company deadlines, including expired dates."
    data.metrics.forEach((m, i) => (m.value = [2, 1, 1, 1][i]))
    data.chart = {
      type: "bar",
      title: "Recorded deadlines",
      series: [{ key: "count", label: "Records" }],
      points: [
        { label: "Expired", count: 1 },
        { label: "Upcoming", count: 1 },
      ],
    }
    data.table = {
      columns: [
        { key: "facility", label: "Facility" },
        { key: "deadline", label: "Deadline" },
        { key: "due", label: "Due date" },
      ],
      rows: [
        {
          id: "A:license",
          facility: "Warehouse A",
          deadline: "Commercial license",
          due: "2026-10-16",
        },
      ],
      links: {
        "A:license":
          "https://example.frappe.cloud/app/dm-facilities-management/A",
      },
    }
    return route.fulfill({ json: data })
  })
  await page.goto("/#facilities")
  await expect(
    page.getByRole("heading", { name: "Facilities & Renewals", exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel("Reporting period")).toHaveValue("90")
  await expect(
    page.getByRole("option", { name: "Next 90 days", exact: true }),
  ).toHaveCount(1)
  const link = page.getByRole("link", { name: "Warehouse A", exact: true })
  await expect(link).toHaveAttribute(
    "href",
    "https://example.frappe.cloud/app/dm-facilities-management/A",
  )
  await expect(link).toHaveAttribute("rel", "noopener noreferrer")
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/dashboards/facilities?") &&
      r.url().includes("days=30"),
  )
  await page.getByLabel("Reporting period").selectOption("30")
  await response
  await expect(
    page.getByText("2026-10-17 – 2026-11-15", { exact: true }),
  ).toBeVisible()
  await page.getByLabel("Search dashboard records").fill("Commercial license")
  const nextDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const download = await nextDownload
  const text = await readFile((await download.path())!, "utf8")
  expect(text).toContain('"Durar","Facilities & Renewals"')
  expect(text).toContain("Recorded Company deadlines")
  expect(text).toContain("Commercial license")
  expect(text).toContain('"Search","Commercial license"')
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(width.document).toBeLessThanOrEqual(width.viewport)
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/${info.project.name}-facilities.png`,
    fullPage: true,
  })
})

test("custom tasks labels account scope, hides irrelevant filters and rejects unsafe record links", async ({
  page,
}) => {
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "reader",
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
  await page.route("**/api/dashboards/tasks?**", (route) => {
    const data = emptyDashboard(
      findDashboard("tasks")!,
      "2026-10-17",
      90,
      "Durar",
    )
    data.status = "ready"
    data.metrics.forEach((m) => (m.value = 0))
    data.table = {
      columns: [
        { key: "name", label: "Task" },
        { key: "status", label: "Status" },
      ],
      rows: [
        { id: "A", name: "Task A", status: "Pending" },
        { id: "B", name: "Task B", status: "Completed" },
        { id: "C", name: "Task C", status: "Pending" },
      ],
      links: {
        A: "https://example.frappe.cloud/app/tasks/A",
        B: "javascript:alert(1)",
        C: "https://unrelated.example/app/tasks/C",
      },
    }
    return route.fulfill({ json: data })
  })
  await page.goto("/#tasks")
  await expect(
    page.getByRole("heading", { name: "Task Dashboard", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("ERP account scope", { exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel("Select company")).toHaveCount(0)
  await expect(page.getByLabel("Reporting period")).toHaveCount(0)
  await expect(
    page.getByText("As of 2026-10-17", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Task A", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Task B", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("cell", { name: "Task C", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Task C", exact: true }),
  ).toHaveCount(0)
  await page.getByLabel("Search dashboard records").fill("Completed")
  await expect(
    page.getByRole("cell", { name: "Task A", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("cell", { name: "Task B", exact: true }),
  ).toBeVisible()
})

test("the main approvals destination loads native workflow requests without mutation controls", async ({
  page,
}) => {
  const requests: string[] = []
  page.on("request", (r) => requests.push(r.url()))
  await page.route("**/api/dashboards/approvals?**", (route) => {
    const data = emptyDashboard(
      findDashboard("approvals")!,
      "2026-10-17",
      30,
      "Durar",
    )
    data.status = "ready"
    data.metrics.forEach((m) => (m.value = 1))
    data.note = "Candidate roles are not named approvers."
    data.table = {
      columns: [
        { key: "record", label: "Request" },
        { key: "state", label: "Workflow state" },
        { key: "roles", label: "Candidate roles" },
      ],
      rows: [{ id: "Q:1", record: "Q-1", state: "Review", roles: "Manager" }],
      links: { "Q:1": "https://example.frappe.cloud/app/quotation/Q-1" },
    }
    return route.fulfill({ json: data })
  })
  await page.goto("/approvals")
  await expect(
    page.getByRole("heading", { name: "Approvals Dashboard", exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel("Reporting period")).toHaveValue("30")
  await expect(
    page.getByRole("cell", { name: "Manager", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Candidate roles are not named approvers.", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: /^(Approve|Reject|Submit)$/ }),
  ).toHaveCount(0)
  expect(requests.some((url) => url.includes("/api/platform/proposals"))).toBe(
    false,
  )
  expect(
    requests.some(
      (url) =>
        url.includes("/api/dashboards/approvals?") && url.includes("days=30"),
    ),
  ).toBe(true)
})
