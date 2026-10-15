import { expect, test } from "@playwright/test"
test("input preparation shows ERP-first sources and Saudi banking without claiming live connectivity", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/integrations")
  await expect(page.getByText("Data inputs", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Saudi banking preparation", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Direct transfers are disabled.", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText("Awaiting configuration", { exact: true }),
  ).toHaveCount(10)
  await page.getByRole("button", { name: "Change language" }).click()
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(
    page.getByText("جاهزية الخدمات المصرفية السعودية", { exact: true }),
  ).toBeVisible()
  const width = await page.evaluate(() => ({
    actual: document.documentElement.scrollWidth,
    available: innerWidth,
  }))
  expect(width.actual).toBeLessThanOrEqual(width.available)
  expect(errors).toEqual([])
})
