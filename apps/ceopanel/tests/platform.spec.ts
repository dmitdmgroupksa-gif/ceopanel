import type { Page } from "@playwright/test"
import { test, expect, changeLanguage } from "./fixtures"
import { dashboards } from "../lib/dashboards"
test("eight agents are visible without fabricated live data or enabled writes", async ({
  page,
}) => {
  await page.goto("/agents")
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible()
  await expect(page.getByRole("button", { pressed: true })).toHaveCount(1)
  for (const name of [
    "Sales",
    "Finance",
    "Inventory",
    "Procurement",
    "Logistics",
    "HR",
    "Facilities",
    "Executive",
  ])
    await expect(
      page
        .getByRole("button")
        .filter({ has: page.getByText(name, { exact: true }) }),
    ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText("This assistant is not available yet."),
  ).toBeVisible()
  const size = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    width: innerWidth,
  }))
  expect(size.doc).toBeLessThanOrEqual(size.width)
})
async function connectedPortal(page: Page, voice = false) {
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "ceo@example.com",
        company: "Durar",
        companies: [{ name: "Durar", default_currency: "SAR" }],
        currency: "SAR",
        siteUrl: "https://example.frappe.cloud",
      },
    }),
  )
  await page.route("**/api/platform/status", (route) =>
    route.fulfill({
      json: {
        ai: true,
        database: true,
        queue: true,
        embeddings: true,
        environment: "staging",
        modules: 1,
        agents: [],
        channels: { voice, email: false, whatsapp: false },
      },
    }),
  )
  await page.route("**/api/platform/agents?**", (route) =>
    route.fulfill({ json: [{ id: "executive", available: true }] }),
  )
}
test("conversation history retains sources and shows newly completed runs", async ({
  page,
}) => {
  await connectedPortal(page)
  let previousRunId: unknown
  await page.route("**/api/platform/runs?**", (route) =>
    route.fulfill({
      json: [
        {
          id: "8c761995-a0c4-427b-bbf4-9c4d05fdc7d8",
          agent: "executive",
          prompt: "Saved question",
          response: "Saved answer",
          evidence: [{ source: "Customer", name: "CUST-17" }],
          status: "completed",
          created_at: "2026-10-14T12:00:00Z",
        },
      ],
    }),
  )
  await page.route("**/api/platform/agents/run?**", (route) => {
    previousRunId = route.request().postDataJSON().previousRunId
    return route.fulfill({
      json: {
        id: "ed31dd98-d61c-4b3b-9285-0c1db4a20a79",
        answer: "Prepared briefing",
        evidence: [{ source: "Verified report", name: "BRF-22" }],
      },
    })
  })
  await page.goto("/agents")
  await page.getByRole("button").filter({ hasText: "Saved question" }).click()
  await expect(page.getByText("Saved answer", { exact: true })).toBeVisible()
  await page.getByText("Sources", { exact: true }).click()
  await expect(page.locator("pre")).toContainText("CUST-17")
  await page.getByLabel("Ask your department assistant").fill("New question")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    page.getByText("Prepared briefing", { exact: true }),
  ).toBeVisible()
  expect(previousRunId).toBe("8c761995-a0c4-427b-bbf4-9c4d05fdc7d8")
  await page.getByRole("button", { name: "New question", exact: true }).click()
  await expect(
    page.getByText("Prepared briefing", { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button").filter({ hasText: "New question" }),
  ).toBeVisible()
})
test("assistant files render as download links and remain available from conversation history", async ({
  page,
}) => {
  await connectedPortal(page)
  await page.route("**/api/platform/runs?**", (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route("**/api/platform/agents/run?**", (route) =>
    route.fulfill({
      json: {
        id: "ed31dd98-d61c-4b3b-9285-0c1db4a20a79",
        answer: "Quotation PDF is available.",
        evidence: [
          {
            kind: "native-erp",
            type: "file",
            file: {
              name: "Quotation-Q-1.pdf",
              downloadUrl: "/api/erp/files?request=fixture&company=Durar",
            },
          },
        ],
      },
    }),
  )
  await page.route("**/api/erp/files?**", (route) =>
    route.fulfill({
      body: "%PDF-1.7 fixture",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Quotation-Q-1.pdf"',
      },
    }),
  )
  await page.goto("/agents")
  await page
    .getByLabel("Ask your department assistant")
    .fill("Get the quotation PDF")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const file = page.getByRole("link", {
    name: "Quotation-Q-1.pdf",
    exact: true,
  })
  await expect(file).toBeVisible()
  const downloaded = page.waitForEvent("download")
  await file.click()
  expect((await downloaded).suggestedFilename()).toBe("Quotation-Q-1.pdf")
  await page
    .getByRole("button")
    .filter({ hasText: "Get the quotation PDF" })
    .click()
  await expect(file).toBeVisible()
})

test("received channel messages are visible in the personal inbox", async ({
  page,
}) => {
  await connectedPortal(page)
  await page.route("**/api/platform/notifications?**", (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route("**/api/platform/inbox?**", (route) =>
    route.fulfill({
      json: [
        {
          provider_id: "message-1",
          channel: "whatsapp",
          content: "Please review the approved site update.",
          created_at: "2026-10-14T12:00:00Z",
        },
      ],
    }),
  )
  await page.goto("/notifications")
  await expect(
    page.getByText("Please review the approved site update."),
  ).toBeVisible()
})
test("cancelling a pending microphone request stops a late media stream", async ({
  page,
}) => {
  await connectedPortal(page, true)
  await page.route("**/api/platform/runs?**", (route) =>
    route.fulfill({ json: [] }),
  )
  await page.addInitScript(() => {
    const state = window as typeof window & {
      resolveMicrophone?: () => void
      micStops: number
    }
    state.micStops = 0
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise((resolve) => {
            state.resolveMicrophone = () =>
              resolve({
                getTracks: () => [
                  {
                    stop: () => {
                      state.micStops++
                    },
                  },
                ],
              })
          }),
      },
    })
  })
  await page.goto("/agents")
  await page.getByRole("button", { name: "Start voice", exact: true }).click()
  await page.getByRole("button", { name: "Stop voice", exact: true }).click()
  await page.evaluate(() =>
    (
      window as typeof window & { resolveMicrophone: () => void }
    ).resolveMicrophone(),
  )
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { micStops: number }).micStops,
      ),
    )
    .toBe(1)
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeEnabled()
})
test("Arabic persists across routes and keeps all dashboard tabs", async ({
  page,
}, info) => {
  await page.goto("/agents")
  await changeLanguage(page)
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(
    page.getByRole("heading", { name: "المساعدون", exact: true }),
  ).toBeVisible()
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "فتح قائمة التنقل" }).click()
  await page.getByRole("link", { name: "لوحات المعلومات", exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 20000 })
  await expect(page.locator("html")).toHaveAttribute("lang", "ar")
  await expect(
    page.getByRole("heading", { name: "مقارنة المبيعات", exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(
    dashboards.length,
  )
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "فتح قائمة التنقل" }).click()
  await page.getByRole("link", { name: "المعرفة", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "المعرفة", exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(
    page.getByRole("button", { name: "رفع", exact: true }),
  ).toBeDisabled()
})
