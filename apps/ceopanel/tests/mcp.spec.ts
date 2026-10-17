import { expect, test } from "@playwright/test"
test("external ERP-wide consent is explicit, read-only and bilingual", async ({
  page,
}) => {
  let company = "Durar",
    consent: unknown
  await page.route("**/api/mcp/oauth/consent?**", (route) => {
    company =
      new URL(route.request().url()).searchParams.get("company") || "Durar"
    return route.fulfill({
      json: {
        client: {
          name: "External CEO assistant",
          redirectUri: "http://127.0.0.1:9912/callback",
        },
        context: {
          user: "ceo@example.com",
          company,
          companies: [{ name: "Durar" }, { name: "Other company" }],
        },
        agents: [
          { id: "executive", name: "Executive", ar: "الإدارة التنفيذية" },
        ],
        canPropose: false,
        erpRead: true,
      },
    })
  })
  await page.route("**/api/mcp/oauth/authorize", async (route) => {
    consent = route.request().postDataJSON()
    await route.fulfill({ json: { redirect: "/agents" } })
  })
  await page.goto("/mcp/authorize?client_id=fixture")
  await expect(page.getByText("External CEO assistant")).toBeVisible()
  await expect(page.getByRole("checkbox")).toHaveCount(0)
  await expect(
    page.getByText("including other companies your account can access", {
      exact: false,
    }),
  ).toBeVisible()
  await expect(
    page.getByText("This application cannot approve or execute changes.", {
      exact: false,
    }),
  ).toBeVisible()
  await page
    .getByLabel("Company", { exact: true })
    .selectOption("Other company")
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
    "Other company",
  )
  await page.getByRole("button", { name: "Change language" }).click()
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  const width = await page.evaluate(() => ({
    actual: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }))
  expect(width.actual).toBeLessThanOrEqual(width.viewport)
  await page
    .getByRole("button", { name: "السماح بالوصول", exact: true })
    .click()
  await expect
    .poll(() => consent)
    .toEqual({
      query: "client_id=fixture",
      company: "Other company",
      agent: "executive",
      allowProposals: false,
      decision: "allow",
    })
})
test("unconfigured external MCP stays unavailable", async ({ request }) => {
  const response = await request.post("/api/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  })
  expect(response.status()).toBe(503)
  expect((await response.json()).error).toContain("awaits")
})

test("consent outages offer retry without treating an unavailable server as a sign-in failure", async ({
  page,
}) => {
  await page.route("**/api/mcp/oauth/consent?**", (route) =>
    route.fulfill({
      status: 503,
      json: { error_description: "The consent service is unavailable." },
    }),
  )
  await page.goto("/mcp/authorize?client_id=fixture")
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The consent service is unavailable." }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sign in to ERPNext", exact: true }),
  ).toHaveCount(0)
})
