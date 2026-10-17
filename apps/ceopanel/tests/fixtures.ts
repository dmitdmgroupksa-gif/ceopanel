import { test as base, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { dashboards, emptyDashboard } from "../lib/dashboards"
import { nativeModule } from "../lib/erp-native/catalog"
import { pendingSchema, standardModules } from "../lib/workspace"
import { agents } from "../lib/platform/catalog"

// Browser-only API fixtures: no production auth bypass and no live ERP writes.
export const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const runtimeErrors: string[] = []
    page.on("pageerror", (error) => runtimeErrors.push(error.message))
    await context.addCookies([
      {
        name: "ceopanel_erpnext_sid",
        value: "browser-fixture-session",
        url: baseURL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ])
    await page.route("**/api/erpnext/context**", (route) =>
      route.fulfill({
        json: {
          user: "test@example.com",
          company: "Durar",
          currency: "SAR",
          companies: [{ name: "Durar", default_currency: "SAR" }],
          siteUrl: "https://example.frappe.cloud",
        },
      }),
    )
    await page.route("**/api/platform/**", (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        "/api/platform/".length,
      )
      if (route.request().method() !== "GET")
        return route.fulfill({
          status: 503,
          json: { error: "No browser fixture configured for this request." },
        })
      const responses: Record<string, unknown> = {
        status: {
          ai: false,
          database: false,
          queue: false,
          embeddings: false,
          environment: "staging",
          modules: 0,
          agents: [],
          channels: { email: false, whatsapp: false, voice: false },
        },
        agents: agents.map((agent) => ({ ...agent, available: false })),
        runs: [],
        proposals: [],
        notifications: [],
        inbox: [],
        inputs: { categories: [], external: [] },
        knowledge: { documents: [], collections: [] },
        "field-modules": [],
        "external-sources": [],
      }
      return Object.hasOwn(responses, path)
        ? route.fulfill({ json: responses[path] })
        : route.fulfill({
            status: 503,
            json: { error: "No browser fixture configured for this request." },
          })
    })
    await page.route("**/api/dashboards/**", (route) => {
      const url = new URL(route.request().url())
      const definition = dashboards.find(
        (item) => item.id === url.pathname.split("/").pop(),
      )
      return definition
        ? route.fulfill({
            json: emptyDashboard(
              definition,
              "2026-10-15",
              Number(url.searchParams.get("days") || 90),
            ),
          })
        : route.fulfill({
            status: 404,
            json: { error: "Dashboard not found." },
          })
    })
    await page.route("**/api/workspace/modules/*?**", (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const module =
        nativeModule(id)?.module ??
        standardModules.find((item) => item.id === id)
      return module
        ? route.fulfill({ json: pendingSchema(module) })
        : route.fulfill({ status: 404, json: { error: "Module not found." } })
    })
    await use(page)
    expect(runtimeErrors, "Unexpected browser JavaScript errors").toEqual([])
  },
})
export { expect }

export async function changeLanguage(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  const menu = page.getByRole("button", {
    name: /^(Open navigation|فتح قائمة التنقل)$/,
  })
  const mobile = await menu.isVisible()
  if (mobile) await menu.click()
  await page.getByRole("button", { name: "Change language" }).click()
  if (mobile) {
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()
  }
}
