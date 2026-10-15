import { expect, test } from "@playwright/test"
test("external consent is explicit, company-scoped and bilingual", async ({
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
        canPropose: true,
      },
    })
  })
  await page.route("**/api/mcp/oauth/authorize", async (route) => {
    consent = route.request().postDataJSON()
    await route.fulfill({ json: { redirect: "/agents" } })
  })
  await page.goto("/mcp/authorize?client_id=fixture")
  await expect(page.getByText("External CEO assistant")).toBeVisible()
  await expect(page.getByRole("checkbox")).not.toBeChecked()
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
  await page.getByRole("checkbox").check()
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
      allowProposals: true,
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
