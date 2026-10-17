import { test, expect, changeLanguage } from "./fixtures"
import { dashboards } from "../lib/dashboards"

test("eight main destinations, responsive sidebar, and animated icon names remain accessible", async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Sales Comparison", exact: true }),
  ).toBeVisible()
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click()
    const drawer = page.getByRole("dialog", { name: "Main navigation" })
    await expect(drawer.getByRole("navigation").getByRole("link")).toHaveCount(
      8,
    )
    await drawer.getByRole("link", { name: "Agents", exact: true }).click()
    await expect(drawer).not.toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Agents", exact: true }),
    ).toBeVisible()
    await page.goto("/")
  } else {
    const sidebar = page.locator('[data-slot="sidebar"]')
    await expect(sidebar.getByRole("navigation").getByRole("link")).toHaveCount(
      8,
    )
    await expect(
      sidebar.getByRole("link", { name: "Dashboards", exact: true }),
    ).toHaveAttribute("aria-current", "page")
    await page.getByRole("button", { name: "Collapse sidebar" }).click()
    await expect(sidebar).toHaveCSS("width", "80px")
    await sidebar.getByRole("link", { name: "Knowledge", exact: true }).hover()
    await expect(page.getByRole("tooltip")).toHaveText("Knowledge")
    await page.getByRole("button", { name: "Expand sidebar" }).click()
    await expect(sidebar).toHaveCSS("width", "248px")
  }
  const tabs = page.getByRole("tablist", { name: "CEO dashboards" })
  await expect(tabs.getByRole("tab")).toHaveCount(dashboards.length)
  const tab = tabs.getByRole("tab", { name: "Sales Comparison", exact: true })
  await expect(tab).toHaveText("")
  await tab.focus()
  await expect(page.getByRole("tooltip")).toHaveText("Sales Comparison")
  await page.keyboard.press("ArrowRight")
  await expect(tabs.getByRole("tab").nth(1)).toBeFocused()
  await page.emulateMedia({ reducedMotion: "reduce" })
  await tabs.getByRole("tab").nth(1).focus()
  expect(
    await tabs
      .getByRole("tab")
      .nth(1)
      .locator("svg")
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe("none")
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/${info.project.name}-sidebar.png`,
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test("an expired business request clears the current company view immediately", async ({
  page,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Sales Comparison", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeEnabled()
  await page.route("**/api/dashboards/**", (route) =>
    route.fulfill({ status: 401, json: { error: "Session expired" } }),
  )
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page).toHaveURL(/\/login\?next=.*expired=1/)
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible()
})

test("Arabic navigation uses the right edge and the mobile drawer restores focus", async ({
  page,
}, info) => {
  await page.goto("/agents")
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible()
  await changeLanguage(page)
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  if (info.project.name === "mobile") {
    const open = page.getByRole("button", { name: "فتح قائمة التنقل" })
    await open.click()
    const drawer = page.getByRole("dialog")
    await expect(drawer).toHaveAttribute("dir", "rtl")
    await expect(drawer.getByRole("navigation").getByRole("link")).toHaveCount(
      8,
    )
    await page.keyboard.press("Escape")
    await expect(drawer).not.toBeVisible()
    await expect(open).toBeFocused()
  } else {
    const sidebar = page.locator('[data-slot="sidebar"]')
    const box = await sidebar.boundingBox()
    expect(box!.x + box!.width).toBe(1440)
  }
})

test("logout remains available during an ERP outage and explains incomplete remote revocation", async ({
  page,
}, info) => {
  await page.route("**/api/erpnext/session", async (route) => {
    await page.context().clearCookies({ name: "ceopanel_erpnext_sid" })
    await route.fulfill({ json: { ok: true, remoteSessionRevoked: false } })
  })
  await page.goto("/agents")
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible()
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click()
  await page.getByRole("button", { name: "Sign out", exact: true }).click()
  await expect(page).toHaveURL(/\/login\?logout=incomplete/)
  await expect(
    page.getByText("Signed out of this browser.", { exact: false }),
  ).toBeVisible()
})
