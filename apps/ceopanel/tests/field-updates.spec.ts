import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures"

async function fieldPortal(page: Page) {
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "field@example.com",
        company:
          new URL(route.request().url()).searchParams.get("company") ||
          "Company A",
        companies: [{ name: "Company A" }, { name: "Company B" }],
        currency: "SAR",
        siteUrl: "https://example.frappe.cloud",
      },
    }),
  )
  await page.route("**/api/platform/field-modules?**", (route) =>
    route.fulfill({
      json: [
        { agent: "sales", id: "customers", title: "Customers" },
        { agent: "sales", id: "leads", title: "Leads" },
      ],
    }),
  )
  await page.route("**/api/workspace/modules/*?**", (route) =>
    route.fulfill({
      json: {
        ready: true,
        module: { id: "customers", title: "Customers", doctype: "Customer" },
        fields: [
          {
            name: "note",
            label: "Update details",
            type: "text",
            required: true,
          },
        ],
        permissions: { read: true, create: true, edit: true },
      },
    }),
  )
}

test("legacy offline drafts survive the indexed upgrade and remain scoped to their owner and company", async ({
  page,
}) => {
  await fieldPortal(page)
  await page.goto("/")
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("ceopanel-field-inputs", 1)
      request.onupgradeneeded = () =>
        request.result.createObjectStore("drafts", { keyPath: "id" })
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("drafts", "readwrite")
        for (const [owner, company, note] of [
          ["field@example.com", "Company A", "Legacy field note"],
          ["field@example.com", "Company B", "Other company private note"],
          ["other@example.com", "Company A", "Other user private note"],
        ])
          tx.objectStore("drafts").put({
            id: crypto.randomUUID(),
            owner,
            company,
            module: "customers",
            agent: "sales",
            values: { note },
            photos: [],
            createdAt: new Date().toISOString(),
          })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      }
    })
  })
  await page.goto("/field-updates")
  await expect(
    page.getByText("Legacy field note", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Submit for approval", exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText("Other company private note", { exact: false }),
  ).toHaveCount(0)
  await expect(
    page.getByText("Other user private note", { exact: false }),
  ).toHaveCount(0)
  const database = await page.evaluate(
    () =>
      new Promise<{ version: number; indexes: string[]; count: number }>(
        (resolve, reject) => {
          const request = indexedDB.open("ceopanel-field-inputs")
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction("drafts"),
              store = tx.objectStore("drafts"),
              count = store.count()
            count.onsuccess = () => {
              resolve({
                version: db.version,
                indexes: Array.from(store.indexNames),
                count: count.result,
              })
              db.close()
            }
          }
        },
      ),
  )
  expect(database).toEqual({
    version: 2,
    indexes: ["owner", "ownerCompany"],
    count: 3,
  })
})

test("switching field record types clears selected photos and preserves company draft isolation", async ({
  page,
}) => {
  await fieldPortal(page)
  await page.goto("/field-updates")
  const details = page.getByLabel("Update details", { exact: false })
  await expect(details).toBeEnabled()
  await details.fill("Customer update")
  const photos = page.getByLabel("Field photos", { exact: true })
  await photos.setInputFiles({
    name: "site.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  })
  await page
    .getByLabel("Choose record type", { exact: true })
    .selectOption("sales:leads")
  await expect(details).toHaveValue("")
  await expect(photos).toHaveValue("")
  await details.fill("Lead update")
  await page
    .getByRole("button", { name: "Save device draft", exact: true })
    .click()
  await expect(page.getByText("Lead update", { exact: false })).toBeVisible()
  await page
    .getByLabel("Select company", { exact: true })
    .selectOption("Company B")
  await expect(page.getByText("Lead update", { exact: false })).toHaveCount(0)
  await expect(details).toHaveValue("")
  await details.fill("Company B update")
  await page
    .getByRole("button", { name: "Save device draft", exact: true })
    .click()
  await expect(
    page.getByText("Company B update", { exact: false }),
  ).toBeVisible()
  const drafts = await page.evaluate(
    () =>
      new Promise<{ company: string; module: string; photos: number }[]>(
        (resolve, reject) => {
          const request = indexedDB.open("ceopanel-field-inputs")
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result,
              rows = db.transaction("drafts").objectStore("drafts").getAll()
            rows.onsuccess = () => {
              resolve(
                rows.result.map((row) => ({
                  company: row.company,
                  module: row.module,
                  photos: row.photos.length,
                })),
              )
              db.close()
            }
          }
        },
      ),
  )
  expect(drafts).toEqual(
    expect.arrayContaining([
      { company: "Company A", module: "leads", photos: 0 },
      { company: "Company B", module: "customers", photos: 0 },
    ]),
  )
})
