import { test, expect } from "@playwright/test"
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
    page.getByText(
      "This assistant awaits role, source and OpenAI configuration.",
    ),
  ).toBeVisible()
  const size = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    width: innerWidth,
  }))
  expect(size.doc).toBeLessThanOrEqual(size.width)
})
test("Arabic persists across routes and keeps all 18 top dashboard tabs", async ({
  page,
}) => {
  await page.goto("/agents")
  await page.getByRole("button", { name: "Change language" }).click()
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(
    page.getByRole("heading", { name: "المساعدون", exact: true }),
  ).toBeVisible()
  await page.getByRole("link", { name: "لوحات المعلومات", exact: true }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 20000 })
  await expect(page.locator("html")).toHaveAttribute("lang", "ar")
  await expect(
    page.getByRole("heading", { name: "مقارنة المبيعات", exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(18)
  await page.getByRole("link", { name: "المعرفة", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "المعرفة", exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(
    page.getByRole("button", { name: "رفع", exact: true }),
  ).toBeDisabled()
})
