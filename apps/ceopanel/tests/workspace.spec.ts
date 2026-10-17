import { test, expect } from "./fixtures"
import {
  pendingSchema,
  standardModules,
  type ModuleSchema,
  type WorkspaceRecord,
} from "../lib/workspace"
import { nativeModule } from "../lib/erp-native/catalog"
import { ALL_COMPANIES } from "../lib/company-scope"

test("native DocType and report pickers load the full ERP catalog and All Companies results stay separated", async ({
  page,
}) => {
  const requests: any[] = []
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "test@example.com",
        company:
          new URL(route.request().url()).searchParams.get("company") || "Durar",
        currency: "SAR",
        companies: [
          { name: "Durar", default_currency: "SAR" },
          { name: "Second Company", default_currency: "USD" },
        ],
        siteUrl: "https://example.frappe.cloud",
        roles: ["Desk User"],
      },
    })
  )
  await page.route("**/api/erp/explorer", (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    const result =
      body.action === "catalog"
        ? {
            results:
              body.kind === "report"
                ? [{ kind: "report", name: "Native Sales Report" }]
                : Array.from({ length: 125 }, (_, i) => ({
                    kind: "doctype",
                    name: `Native Type ${i}`,
                  })),
          }
        : body.action === "schema"
          ? {
              doctype: body.doctype,
              scope: "Native ERP permissions apply.",
              fields: [
                {
                  fieldname: "company",
                  label: "Company",
                  fieldtype: "Link",
                  options: "Company",
                },
              ],
              childTables: [],
            }
          : body.action === "records"
            ? {
                records: [{ name: "DOC-125", company: "Durar" }],
                offset: 0,
                hasMore: false,
                note: "Native permissions apply.",
              }
            : body.action === "report"
              ? {
                  name: body.report,
                  reportType: "Query Report",
                  doctype: "Sales Invoice",
                  supported: true,
                  defaultFilters: {},
                  filters: [
                    {
                      fieldname: "company",
                      label: "Company",
                      fieldtype: "Link",
                      options: "Company",
                      required: true,
                    },
                  ],
                  scope: "Native report permissions apply.",
                  note: "Choose a company.",
                }
              : {
                  companyResults: [
                    {
                      company: "Durar",
                      currency: "SAR",
                      filters: { company: "Durar" },
                      result: {
                        columns: [{ fieldname: "amount", label: "Amount" }],
                        rows: [{ amount: 10 }],
                        rowCount: 1,
                        note: "Native rows.",
                      },
                    },
                    {
                      company: "Second Company",
                      currency: "USD",
                      filters: { company: "Second Company" },
                      error: "Report access denied for this company.",
                    },
                  ],
                }
    return route.fulfill({ json: result })
  })
  await page.goto("/workspace#custom")
  await expect(
    page.getByLabel("Choose record type").getByRole("option")
  ).toHaveCount(126)
  await page.getByLabel("Select company").selectOption(ALL_COMPANIES)
  await page.getByLabel("Search ERP sources").fill("Native Type 124")
  await page.getByLabel("Choose record type").selectOption("Native Type 124")
  await expect(
    page.getByRole("button", { name: "DOC-125", exact: true })
  ).toBeVisible()
  expect(requests.filter((r) => r.action === "records").at(-1).company).toBe(
    ALL_COMPANIES
  )
  await expect(
    page.getByText("Advanced filters", { exact: true })
  ).toBeVisible()
  await page.getByRole("tab", { name: "Custom reports", exact: true }).click()
  await page.getByLabel("Choose report").selectOption("Native Sales Report")
  await expect(page.getByLabel("Company *", { exact: true })).toHaveValue(
    ALL_COMPANIES
  )
  await page.getByRole("button", { name: "Run report", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Durar · SAR" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Second Company · USD" })
  ).toBeVisible()
  await expect(
    page.getByText("Report access denied for this company.", { exact: true })
  ).toBeVisible()
  expect(
    requests.filter((r) => r.action === "run-report").at(-1).filters
  ).toEqual({ company: ALL_COMPANIES })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
})

test("all company record modules and custom sections are prepared without live writes", async ({
  page,
}, info) => {
  const mutations: string[] = []
  await page.route("**/api/erp/explorer", (route) => {
    const body = route.request().postDataJSON()
    return route.fulfill({
      json: {
        results:
          body.kind === "report"
            ? [{ kind: "report", name: "Vehicle Oil Change Alert Report" }]
            : Array.from({ length: 125 }, (_, i) => ({
                kind: "doctype",
                name: i === 0 ? "Facilities" : `Custom Type ${i}`,
              })),
      },
    })
  })
  page.on("request", (request) => {
    if (
      ["POST", "PUT", "DELETE"].includes(request.method()) &&
      request.url().includes("/api/workspace/")
    )
      mutations.push(request.url())
  })
  await page.route("**/api/workspace/modules/*?**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop()!
    const module =
      nativeModule(id)?.module ??
      standardModules.find((item) => item.id === id)!
    return route.fulfill({ json: pendingSchema(module) })
  })
  await page.goto("/workspace")
  await expect(
    page.getByRole("heading", { name: "ERP workspace" })
  ).toBeVisible()
  for (const module of standardModules) {
    await page.getByLabel("Choose record type").selectOption(module.id)
    await expect(
      page.getByText(module.title, { exact: true }).last()
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "New record", exact: true })
    ).toHaveCount(0)
  }
  await page.getByRole("tab", { name: "Custom DocTypes", exact: true }).click()
  await expect(
    page
      .getByLabel("Choose record type")
      .getByRole("option", { name: "Facilities", exact: true })
  ).toHaveCount(1)
  await page.getByRole("tab", { name: "Custom reports", exact: true }).click()
  await expect(
    page
      .getByLabel("Choose report")
      .getByRole("option", {
        name: "Vehicle Oil Change Alert Report",
        exact: true,
      })
  ).toHaveCount(1)
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/${info.project.name}-workspace-reports.png`,
    fullPage: true,
  })
  expect(mutations).toEqual([])
  const width = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ])
  expect(width[0]).toBeLessThanOrEqual(width[1])
})

test("records stay read-only even when ERP schema advertises every write permission", async ({
  page,
}) => {
  const mutations: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/api/workspace/") && request.method() !== "GET")
      mutations.push(request.method())
  })
  const schema: ModuleSchema = {
    ...pendingSchema(standardModules[0]),
    ready: true,
    submittable: true,
    fields: [
      { name: "customer_name", label: "Customer name", type: "text" },
      {
        name: "contacts",
        label: "Contacts",
        type: "table",
        fields: [{ name: "full_name", label: "Contact name", type: "text" }],
      },
    ],
    columns: [
      { key: "name", label: "Record" },
      { key: "customer_name", label: "Customer" },
    ],
    permissions: {
      read: true,
      create: true,
      edit: true,
      submit: true,
      cancel: true,
    },
    workflowActions: ["Approve"],
  }
  const record: WorkspaceRecord = {
    name: "CUSTOMER-1",
    modified: "2026-10-15 10:00:00",
    docstatus: 0,
    values: {
      customer_name: "First customer",
      contacts: [{ full_name: "Contact A" }],
    },
    workflowActions: ["Approve"],
  }
  await page.route("**/api/workspace/modules/customers**", (route) => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({
      json: path.endsWith("/records")
        ? { records: [record], hasMore: false }
        : path.endsWith("/CUSTOMER-1")
          ? record
          : schema,
    })
  })
  await page.goto("/workspace")
  await expect(
    page.getByRole("button", { name: "CUSTOMER-1", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "New record", exact: true })
  ).toHaveCount(0)
  await page.getByRole("button", { name: "CUSTOMER-1", exact: true }).click()
  await expect(page.getByLabel("Customer name", { exact: true })).toBeDisabled()
  await expect(page.getByLabel("Contact name", { exact: true })).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Add row", exact: true })
  ).toBeDisabled()
  for (const name of [
    "Create record",
    "Save changes",
    "Submit",
    "Cancel document",
    "Approve",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Close", exact: true }).first().click()
  expect(mutations).toEqual([])
})
