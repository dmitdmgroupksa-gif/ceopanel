import { test, expect, changeLanguage } from "./fixtures"
import { pendingSchema, standardModules } from "../lib/workspace"

test("tablet navigation and Arabic layouts stay within the viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto("/agents")
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible()
  await changeLanguage(page)
  const open = page.getByRole("button", {
    name: "فتح قائمة التنقل",
    exact: true,
  })
  await open.click()
  const drawer = page.getByRole("dialog")
  await expect(drawer.getByRole("navigation").getByRole("link")).toHaveCount(8)
  await page.keyboard.press("Escape")
  await expect(open).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/tablet-${info.project.name}.png`,
    fullPage: true,
  })
})

test("Arabic record fields preserve native select values, unchecked flags and complete timestamps", async ({
  page,
}) => {
  const record = {
    name: "FORM-1",
    docstatus: 0,
    modified: "2026-10-17 12:34:56",
    values: {
      status: "Completed",
      archived: "0",
      departure: "2026-10-17 12:34:56",
    },
    workflowActions: [],
  }
  const schema = {
    ...pendingSchema(standardModules[0]),
    ready: true,
    fields: [
      {
        name: "status",
        label: "Review status",
        type: "select",
        options: ["Pending", "Completed"],
      },
      { name: "archived", label: "Archived flag", type: "check" },
      { name: "departure", label: "Departure timestamp", type: "date" },
    ],
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
    const path = new URL(route.request().url()).pathname
    return route.fulfill({
      json: path.endsWith("/records")
        ? { records: [record], hasMore: false }
        : path.endsWith("/FORM-1")
          ? record
          : schema,
    })
  })
  await page.goto("/workspace")
  await expect(
    page.getByRole("button", { name: "FORM-1", exact: true }),
  ).toBeVisible()
  await changeLanguage(page)
  await page.getByRole("button", { name: "FORM-1", exact: true }).click()
  await expect(page.getByLabel("Review status", { exact: true })).toHaveValue(
    "Completed",
  )
  await expect(
    page.getByLabel("Archived flag", { exact: true }),
  ).not.toBeChecked()
  await expect(
    page.getByLabel("Departure timestamp", { exact: true }),
  ).toHaveValue("2026-10-17 12:34:56")
  await expect(page.getByLabel("Review status", { exact: true })).toBeDisabled()
})

test("a collection upload grant cannot enable uploads in the read-only release", async ({
  page,
}) => {
  await page.route("**/api/platform/knowledge?**", (route) =>
    route.fulfill({
      json: {
        documents: [],
        collections: [{ id: "policies", title: "Policies", upload: true }],
      },
    }),
  )
  await page.goto("/knowledge")
  await expect(
    page.getByLabel("Choose collection", { exact: true }),
  ).toHaveValue("policies")
  await expect(
    page.getByLabel("Choose document", { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Upload", exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText("Document uploads are disabled in this read-only release."),
  ).toBeVisible()
})

test("history navigation cannot replace a conversation while its answer is pending", async ({
  page,
}) => {
  await page.route("**/api/platform/status", (route) =>
    route.fulfill({
      json: {
        ai: true,
        database: true,
        queue: true,
        embeddings: true,
        environment: "staging",
        modules: 0,
        agents: [],
        channels: { voice: false, email: false, whatsapp: false },
      },
    }),
  )
  await page.route("**/api/platform/agents?**", (route) =>
    route.fulfill({ json: [{ id: "executive", available: true }] }),
  )
  await page.route("**/api/platform/runs?**", (route) =>
    route.fulfill({
      json: [
        {
          id: "b76fed13-ab05-4092-be30-e60cd24193f2",
          agent: "executive",
          prompt: "Earlier question",
          response: "Earlier answer",
          evidence: [],
          status: "completed",
          created_at: "2026-10-17T12:00:00Z",
        },
      ],
    }),
  )
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/api/platform/agents/run?**", async (route) => {
    await pending
    await route.fulfill({
      json: {
        id: "8db5706f-340a-4c15-b463-317c296c8c03",
        answer: "New answer",
        evidence: [],
      },
    })
  })
  try {
    await page.goto("/agents")
    const history = page.getByRole("button", { name: /Earlier question/ })
    await expect(history).toBeEnabled()
    await page
      .getByLabel("Ask your department assistant", { exact: true })
      .fill("New question")
    const requested = page.waitForRequest((request) =>
      request.url().includes("/api/platform/agents/run?"),
    )
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await requested
    await expect(history).toBeDisabled()
    release()
    await expect(page.getByText("New answer", { exact: true })).toBeVisible()
    await expect(history).toBeEnabled()
  } finally {
    release()
  }
})
