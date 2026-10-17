import { test, expect } from "./fixtures"
import {
  pendingSchema,
  standardModules,
  type ModuleSchema,
  type WorkspaceRecord,
} from "../lib/workspace"
import { nativeModule } from "../lib/erp-native/catalog"

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
    const id = new URL(route.request().url()).pathname.split("/").pop()!
    const module =
      nativeModule(id)?.module ??
      standardModules.find((item) => item.id === id)!
    return route.fulfill({ json: pendingSchema(module) })
  })
  await page.goto("/workspace")
  await expect(
    page.getByRole("heading", { name: "ERP workspace" }),
  ).toBeVisible()
  for (const module of standardModules) {
    await page.getByLabel("Choose record type").selectOption(module.id)
    await expect(
      page.getByText(module.title, { exact: true }).last(),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "New record", exact: true }),
    ).toHaveCount(0)
  }
  await page.getByRole("tab", { name: "Custom DocTypes", exact: true }).click()
  await expect(
    page
      .getByLabel("Choose record type")
      .getByRole("option", { name: "Facilities", exact: true }),
  ).toHaveCount(1)
  await page.getByRole("tab", { name: "Custom reports", exact: true }).click()
  await expect(page.getByText("No custom reports configured.")).toBeVisible()
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
    page.getByRole("button", { name: "CUSTOMER-1", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "New record", exact: true }),
  ).toHaveCount(0)
  await page.getByRole("button", { name: "CUSTOMER-1", exact: true }).click()
  await expect(page.getByLabel("Customer name", { exact: true })).toBeDisabled()
  await expect(page.getByLabel("Contact name", { exact: true })).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Add row", exact: true }),
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
