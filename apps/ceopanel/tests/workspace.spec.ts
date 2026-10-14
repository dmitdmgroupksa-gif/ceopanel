import { test, expect } from "@playwright/test"
import {
  pendingSchema,
  standardModules,
  type ModuleSchema,
  type WorkspaceRecord,
} from "../lib/workspace"

test("all company record modules and custom sections are prepared without live writes", async ({
  page,
}, info) => {
  const mutations: string[] = []
  page.on("request", (request) => {
    if (
      ["POST", "PUT", "DELETE"].includes(request.method()) &&
      request.url().includes("/api/workspace/")
    )
      mutations.push(request.url())
  })
  await page.route("**/api/workspace/modules/*?**", (route) => {
    const module = standardModules.find((item) =>
      route.request().url().includes(`/modules/${item.id}?`)
    )!
    return route.fulfill({ json: pendingSchema(module) })
  })
  await page.goto("/workspace")
  await expect(
    page.getByRole("heading", { name: "Company ERP workspace" })
  ).toBeVisible()
  for (const module of standardModules) {
    await page.getByLabel("Choose record type").selectOption(module.id)
    await expect(
      page.getByText(module.title, { exact: true }).last()
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "New record", exact: true })
    ).toBeDisabled()
  }
  await page.getByRole("tab", { name: "Custom DocTypes", exact: true }).click()
  await expect(
    page.getByText("Ready for your custom DocType names and API definitions.")
  ).toBeVisible()
  await page.getByRole("tab", { name: "Custom reports", exact: true }).click()
  await expect(
    page.getByText(
      "Ready for your custom report names, filters, and data sources."
    )
  ).toBeVisible()
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

test("a configured API can browse, create with custom fields, edit, and submit records", async ({
  page,
}) => {
  const schema: ModuleSchema = {
    ...pendingSchema(standardModules[0]),
    ready: true,
    submittable: true,
    fields: [
      {
        name: "customer_name",
        label: "Customer name",
        type: "text",
        required: true,
      },
      {
        name: "custom_tier",
        label: "Customer tier",
        type: "select",
        options: ["Gold", "Silver"],
      },
      {
        name: "contacts",
        label: "Contacts",
        type: "table",
        fields: [{ name: "contact_name", label: "Contact name", type: "text" }],
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
  }
  const records: WorkspaceRecord[] = [
    {
      name: "CUSTOMER-1",
      modified: "2026-10-14T09:00:00",
      docstatus: 0,
      values: {
        customer_name: "First customer",
        custom_tier: "Silver",
        contacts: [],
      },
    },
  ]
  let created: unknown
  let edited: unknown
  let submitted = false
  await page.route("**/api/erpnext/session", (route) =>
    route.fulfill({ json: { ok: true } })
  )
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "test@example.com",
        company: "Company A",
        currency: "SAR",
        companies: [{ name: "Company A", default_currency: "SAR" }],
        siteUrl: "https://dmgroup.frappe.cloud",
      },
    })
  )
  await page.route("**/api/workspace/modules/customers**", (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith("/actions")) {
      submitted = true
      records[0].docstatus = 1
      return route.fulfill({ json: records[0] })
    }
    if (path.endsWith("/records") && request.method() === "POST") {
      created = request.postDataJSON()
      records.push({
        name: "CUSTOMER-2",
        modified: "2026-10-14T10:00:00",
        docstatus: 0,
        values: request.postDataJSON().values,
      })
      return route.fulfill({ status: 201, json: records[1] })
    }
    if (path.endsWith("/records"))
      return route.fulfill({ json: { records, hasMore: false } })
    if (path.endsWith("/CUSTOMER-1")) {
      if (request.method() === "PUT") {
        edited = request.postDataJSON()
        records[0].values = {
          ...records[0].values,
          ...request.postDataJSON().values,
        }
      }
      return route.fulfill({ json: records[0] })
    }
    return route.fulfill({ json: schema })
  })
  await page.goto("/workspace")
  await page
    .getByRole("button", { name: "Connect ERPNext", exact: true })
    .click()
  await page.getByLabel("ERPNext email or username").fill("test@example.com")
  await page.getByLabel("Password", { exact: true }).fill("not-real")
  await page
    .getByRole("button", { name: "Sign in to ERPNext", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "New record", exact: true })
  ).toBeEnabled()
  await page.getByRole("button", { name: "New record", exact: true }).click()
  await page.getByLabel("Customer name", { exact: false }).fill("New customer")
  await page.getByLabel("Customer tier").selectOption("Gold")
  await page.getByRole("button", { name: "Add row", exact: true }).click()
  await page.getByLabel("Contact name").fill("Contact A")
  await page.getByRole("button", { name: "Create record", exact: true }).click()
  await expect(
    page.getByRole("cell", { name: "New customer", exact: true })
  ).toBeVisible()
  expect(created).toMatchObject({
    values: {
      customer_name: "New customer",
      custom_tier: "Gold",
      contacts: [{ contact_name: "Contact A" }],
    },
  })
  await page.getByRole("button", { name: "CUSTOMER-1", exact: true }).click()
  await page
    .getByLabel("Customer name", { exact: false })
    .fill("Updated customer")
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(
    page.getByRole("cell", { name: "Updated customer", exact: true })
  ).toBeVisible()
  expect(edited).toMatchObject({
    modified: "2026-10-14T09:00:00",
    values: { customer_name: "Updated customer" },
  })
  await page.getByRole("button", { name: "CUSTOMER-1", exact: true }).click()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  expect(submitted).toBe(false)
  await page
    .getByRole("button", { name: "Confirm submit", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(submitted).toBe(true)
})
