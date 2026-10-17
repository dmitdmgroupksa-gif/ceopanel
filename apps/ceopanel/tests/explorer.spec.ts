import type { Page } from "@playwright/test"
import { test, expect, changeLanguage } from "./fixtures"

const schema = {
  doctype: "Custom Requests",
  module: "Operations",
  scope: "Native ERP account permissions apply.",
  fields: [
    {
      fieldname: "company",
      label: "Company",
      fieldtype: "Link",
      options: "Company",
    },
    {
      fieldname: "status",
      label: "Status",
      fieldtype: "Select",
      options: "Pending\nApproved",
    },
    { fieldname: "workflow_state", label: "Workflow state", fieldtype: "Data" },
    {
      fieldname: "items",
      label: "Items",
      fieldtype: "Table",
      options: "Request Item",
    },
  ],
  childTables: [
    {
      doctype: "Request Item",
      fields: [
        { fieldname: "description", label: "Description", fieldtype: "Data" },
      ],
    },
  ],
}
const report = {
  name: "Sales Detail",
  reportType: "Query Report",
  doctype: "Sales Invoice",
  supported: true,
  defaultFilters: {},
  scope: "Native report filters apply.",
  note: "Supply required filters.",
  filters: [
    {
      fieldname: "from_date",
      label: "From date",
      fieldtype: "Date",
      required: true,
    },
    {
      fieldname: "region",
      label: "Region",
      fieldtype: "Select",
      options: "North\nSouth",
      required: true,
    },
  ],
}
const sources = {
  results: [
    {
      kind: "doctype",
      name: "Custom Requests",
      module: "Operations",
      canRead: true,
    },
    { kind: "report", name: "Sales Detail", module: "Selling", canRead: true },
  ],
  totalMatches: 2,
  hasMore: false,
  offset: 0,
  note: "Metadata is not an execution permission guarantee.",
}
async function reads(
  page: Page,
  extra?: (body: Record<string, any>) => unknown
) {
  await page.route("**/api/erp/explorer", async (route) => {
    const body = route.request().postDataJSON()
    const custom = extra?.(body)
    if (custom !== undefined) return route.fulfill({ json: custom })
    const responses: Record<string, unknown> = {
      sources,
      schema,
      report,
      records: {
        doctype: schema.doctype,
        records: [
          {
            name: "REQ-1",
            modified: "2026-10-17 10:00:00",
            company: "Durar",
            status: "Pending",
            workflow_state: "Manager review",
          },
        ],
        hasMore: false,
        offset: body.offset || 0,
        limit: 20,
        scope: schema.scope,
        note: "A page, not a complete total.",
      },
      document: {
        doctype: schema.doctype,
        name: "REQ-1",
        values: {
          name: "REQ-1",
          company: "Durar",
          status: "Pending",
          items: [{ description: "Requested equipment" }],
        },
        scope: schema.scope,
      },
      workflow: {
        doctype: schema.doctype,
        name: "REQ-1",
        workflow: "Request Approval",
        currentState: "Manager review",
        immediateCandidates: [
          {
            action: "Approve",
            nextState: "Finance review",
            approverRole: "Operations Manager",
            conditional: true,
          },
        ],
        availableToCurrentUser: [],
        possibleRemainingTransitions: [
          {
            state: "Manager review",
            action: "Approve",
            nextState: "Finance review",
            approverRole: "Operations Manager",
            conditional: true,
          },
        ],
        note: "Candidate roles are not named approvers. Execution is disabled.",
      },
      attachments: {
        files: [
          {
            name: "FILE-1",
            filename: "request.pdf",
            size: 1024,
            private: true,
          },
        ],
        hasMore: false,
      },
      "run-report": {
        report: report.name,
        filters: body.filters,
        columns: [
          { fieldname: "name", label: "Invoice" },
          { fieldname: "amount", label: "Amount" },
        ],
        rows: [
          { name: "INV-1", amount: 42 },
          { name: "Total", amount: 42 },
        ],
        rowCount: 2,
        totalRowIncluded: true,
        scope: report.scope,
        note: "Includes the native total; do not sum again.",
      },
      export: {
        name:
          body.request?.kind === "report" ? "Sales Detail.csv" : "request.pdf",
        downloadUrl: "/api/erp/files?request=fixture-file&company=Durar",
        mimeType: "text/csv",
      },
    }
    return Object.hasOwn(responses, body.action)
      ? route.fulfill({ json: responses[body.action] })
      : route.fulfill({
          status: 400,
          json: { error: "Unexpected test request" },
        })
  })
  await page.route("**/api/erp/files?**", (route) =>
    route.fulfill({
      body: "Invoice,Amount\nINV-1,42",
      headers: { "Content-Type": "text/csv" },
    })
  )
}

test("native reports require real filters, preserve native values in Arabic, download and clear stale results", async ({
  page,
}) => {
  const calls: Record<string, any>[] = []
  await reads(page, (body) => {
    calls.push(body)
  })
  await page.goto("/workspace#explorer")
  await page
    .getByRole("button", { name: "Sales Detail Report", exact: false })
    .click()
  await page.getByLabel("From date").fill("2026-10-01")
  await page.getByLabel("Region").selectOption("North")
  await changeLanguage(page)
  await page.getByRole("button", { name: "تشغيل التقرير", exact: true }).click()
  await expect(page.getByText("INV-1", { exact: true })).toBeVisible()
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/explorer-report-${test.info().project.name}.png`,
    fullPage: true,
  })
  expect(calls.find((c) => c.action === "run-report")!.filters).toEqual({
    from_date: "2026-10-01",
    region: "North",
  })
  await expect(
    page.getByText("يشمل صف الإجمالي من ERP", { exact: false })
  ).toBeVisible()
  const file = page.waitForEvent("download")
  await page.getByRole("button", { name: "CSV", exact: true }).click()
  expect((await file).suggestedFilename()).toBe("Sales Detail.csv")
  await page.getByLabel("From date").fill("2026-10-02")
  await expect(page.getByText("INV-1", { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "CSV", exact: true })
  ).toHaveCount(0)
})

test("custom record details, child rows, actual workflow branches and attachments stay read-only", async ({
  page,
}) => {
  const calls: Record<string, any>[] = []
  await reads(page, (body) => {
    calls.push(body)
  })
  await page.goto("/workspace#explorer")
  await page
    .getByRole("button", { name: "Custom Requests Record type", exact: false })
    .click()
  await page.getByRole("button", { name: "Load records", exact: true }).click()
  await page.getByRole("button", { name: "REQ-1", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Pending", { exact: true })).toBeVisible()
  await dialog.locator("summary").filter({ hasText: "Items" }).click()
  await expect(
    dialog.getByText("Requested equipment", { exact: true })
  ).toBeVisible()
  await dialog
    .getByRole("button", { name: "Inspect workflow", exact: true })
    .click()
  await expect(
    dialog.getByRole("heading", { name: "Workflow inspection", exact: true })
  ).toBeVisible()
  await expect(
    dialog.getByText("Operations Manager", { exact: true }).first()
  ).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "Approve", exact: true })
  ).toHaveCount(0)
  await dialog
    .getByRole("button", { name: "Load attachments", exact: true })
    .click()
  await expect(dialog.getByText("request.pdf", { exact: false })).toBeVisible()
  expect(calls.find((c) => c.action === "records")!.filters).toContainEqual([
    "company",
    "=",
    "Durar",
  ])
  expect(
    calls.every((c) =>
      [
        "sources",
        "schema",
        "records",
        "document",
        "workflow",
        "attachments",
      ].includes(c.action)
    )
  ).toBe(true)
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("button", { name: "Save source", exact: true }).click()
  const stored = await page.evaluate(
    () =>
      Object.entries(localStorage).find(([k]) =>
        k.startsWith("ceopanel-explorer:")
      )?.[1]
  )
  expect(stored).toContain("Custom Requests")
  expect(stored).not.toContain("REQ-1")
})

test("source failures clear old results and later metadata cannot replace a newer source", async ({
  page,
}) => {
  await reads(page)
  await page.route("**/api/erp/explorer", async (route) => {
    const body = route.request().postDataJSON()
    if (body.action === "schema") {
      await new Promise((resolve) => setTimeout(resolve, 800))
      return route.fulfill({ json: schema }).catch(() => {})
    }
    if (body.action === "report")
      return route.fulfill({
        status: 403,
        json: { error: "Report execution permission denied." },
      })
    await route.fallback()
  })
  await page.goto("/workspace#explorer")
  await page
    .getByRole("button", { name: "Custom Requests Record type", exact: false })
    .click()
  await page
    .getByRole("button", { name: "Sales Detail Report", exact: false })
    .click()
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Report execution permission denied." })
  ).toHaveText("Report execution permission denied.")
  await page.waitForTimeout(1000)
  await expect(
    page.getByRole("button", { name: "Load records", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Save source", exact: true })
  ).toBeDisabled()
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Report execution permission denied." })
  ).toHaveText("Report execution permission denied.")
})

test("daily briefing distinguishes denied sources, unknown metrics and account scope, clearing old data on failure", async ({
  page,
}) => {
  let fail = false
  await page.route("**/api/erp/brief?**", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { error: "ERP unavailable" } })
      : route.fulfill({
          json: {
            company: "Durar",
            currency: "SAR",
            asOf: "2026-10-17",
            cards: [
              {
                id: "ar",
                title: "Accounts Receivable",
                scope: "company",
                status: "ready",
                period: { from: "2026-09-18", to: "2026-10-17", days: 30 },
                metrics: [
                  {
                    label: "Overdue invoice balance",
                    value: 1200,
                    format: "currency",
                  },
                ],
                note: "Current unpaid balances.",
                updatedAt: "2026-10-17T00:00:00Z",
              },
              {
                id: "it-service",
                title: "IT Service",
                scope: "erp-account",
                status: "ready",
                period: { from: "2026-10-17", to: "2026-10-17", days: 1 },
                metrics: [
                  {
                    label: "Due before today",
                    value: null,
                    note: "Due date access is restricted",
                  },
                ],
                updatedAt: "2026-10-17T00:00:00Z",
              },
              {
                id: "approvals",
                title: "Approvals",
                scope: "erp-account",
                status: "unavailable",
                metrics: [],
                period: { from: "2026-09-18", to: "2026-10-17", days: 30 },
                updatedAt: null,
                error: "Workflow access denied.",
              },
            ],
          },
        })
  )
  await page.goto("/workspace#briefing")
  await expect(page.getByText("1,200.00", { exact: false })).toBeVisible()
  await expect(
    page.getByText("Workflow access denied.", { exact: true })
  ).toBeVisible()
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible()
  await expect(
    page.getByText("ERP account scope", { exact: false }).first()
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "View source dashboard", exact: false })
  ).toHaveCount(2)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/daily-brief-${test.info().project.name}.png`,
    fullPage: true,
  })
  fail = true
  await page
    .getByRole("button", { name: "Refresh briefing", exact: true })
    .click()
  await expect(
    page.getByRole("alert").filter({ hasText: "ERP unavailable" })
  ).toHaveText("ERP unavailable")
  await expect(page.getByText("1,200.00", { exact: false })).toHaveCount(0)
})

test("record ranges preserve multiline input and apply structured native filters", async ({
  page,
}) => {
  const calls: Record<string, any>[] = []
  await reads(page, (body) => {
    calls.push(body)
  })
  await page.goto("/workspace#explorer")
  await page
    .getByRole("button", { name: /^Custom Requests Record type/ })
    .click()
  await page.getByText("Advanced filters", { exact: true }).click()
  await page
    .getByRole("button", { name: "Add record filter", exact: true })
    .click()
  await page
    .getByRole("combobox", { name: "Condition", exact: true })
    .selectOption("between")
  const input = page.getByRole("textbox", { name: "Record *", exact: true })
  await input.fill("REQ-1")
  await input.press("Enter")
  await input.pressSequentially("REQ-9")
  await expect(input).toHaveValue("REQ-1\nREQ-9")
  await page.getByRole("button", { name: "Load records", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "REQ-1", exact: true })
  ).toBeVisible()
  expect(
    calls.filter((c) => c.action === "records").at(-1)!.filters
  ).toContainEqual(["name", "between", ["REQ-1", "REQ-9"]])
})

test("changing company clears source details and keeps saved sources scoped to the account and company", async ({
  page,
}) => {
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "reader@example.test",
        company:
          new URL(route.request().url()).searchParams.get("company") ||
          "Company A",
        currency: "SAR",
        companies: [{ name: "Company A" }, { name: "Company B" }],
        siteUrl: "https://example.frappe.cloud",
      },
    })
  )
  const calls: Record<string, any>[] = []
  await reads(page, (body) => {
    calls.push(body)
  })
  await page.goto("/workspace#explorer")
  await page
    .getByRole("button", { name: /^Custom Requests Record type/ })
    .click()
  await expect(
    page.getByRole("heading", { name: "Custom Requests", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Save source", exact: true }).click()
  await expect(
    page.locator("summary").filter({ hasText: "Saved sources" })
  ).toBeVisible()
  await page
    .getByLabel("Select company", { exact: true })
    .selectOption("Company B")
  await expect(
    page.getByRole("heading", { name: "Custom Requests", exact: true })
  ).toHaveCount(0)
  await expect(
    page.locator("summary").filter({ hasText: "Saved sources" })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /^Custom Requests Record type/ })
  ).toBeVisible()
  expect(
    calls.filter((c) => c.action === "sources").map((c) => c.company)
  ).toContain("Company B")
})

test("hash navigation opens the Explorer while a previous workspace read is pending", async ({
  page,
}) => {
  await reads(page)
  await page.route("**/api/workspace/modules/customers?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await route
      .fulfill({ status: 503, json: { error: "Late workspace error" } })
      .catch(() => {})
  })
  const pending = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/workspace/modules/customers"
  )
  await page.goto("/workspace")
  await pending
  await page.evaluate(() => {
    window.location.hash = "explorer"
  })
  await expect(
    page.getByRole("heading", {
      name: "Report and record explorer",
      exact: true,
    })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: /^Custom Requests Record type/ })
  ).toBeVisible()
  await page.waitForTimeout(1200)
  await expect(
    page.getByText("Late workspace error", { exact: true })
  ).toHaveCount(0)
})
