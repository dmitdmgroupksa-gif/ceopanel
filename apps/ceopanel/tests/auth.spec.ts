import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { dashboards, emptyDashboard } from "../lib/dashboards"

async function dashboardReads(page: Page) {
  await page.route("**/api/dashboards/**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop()
    const definition = dashboards.find((d) => d.id === id)!
    return route.fulfill({ json: emptyDashboard(definition, "2026-10-15") })
  })
}

test("anonymous company routes redirect to a working bilingual login without rendering company views", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/workspace?view=records")
  await expect(page).toHaveURL(/\/login\?next=/)
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Open local preview" }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "Company ERP workspace" }),
  ).toHaveCount(0)
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  )
  await page.getByRole("button", { name: "Show password", exact: true }).click()
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  )
  await page.getByRole("button", { name: "Change language" }).click()
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(
    page.getByRole("heading", { name: "مرحباً بعودتك" }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({
    path: `../../.codex-artifacts/ceopanel/login-${test.info().project.name}.png`,
    fullPage: true,
  })
})

test("invalid credentials are recoverable and native two-factor login returns to the requested dashboard", async ({
  page,
  baseURL,
}) => {
  const payloads: unknown[] = []
  await dashboardReads(page)
  await page.route("**/api/erpnext/session", async (route) => {
    const body = route.request().postDataJSON()
    payloads.push(body)
    if (payloads.length === 1)
      return route.fulfill({
        status: 401,
        json: { error: "Invalid credentials. Try again." },
      })
    if (!body.otp)
      return route.fulfill({ json: { challenge: true, method: "OTP App" } })
    await page.context().addCookies([
      {
        name: "ceopanel_erpnext_sid",
        value: "browser-fixture-session",
        url: baseURL!,
        httpOnly: true,
      },
    ])
    return route.fulfill({ json: { ok: true } })
  })
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "ceo@example.com",
        company: "Durar",
        companies: [{ name: "Durar" }],
        currency: "SAR",
        siteUrl: "https://example.frappe.cloud",
      },
    }),
  )
  await page.goto("/login?next=%2F%23stock")
  await page.getByLabel("ERPNext email or username").fill("ceo@example.com")
  await page.getByLabel("Password", { exact: true }).fill("fixture-password")
  await page.getByRole("button", { name: "Sign in to ERPNext" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid credentials" }),
  ).toBeVisible()
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("")
  await page.getByLabel("Password", { exact: true }).fill("fixture-password")
  await page.getByRole("button", { name: "Sign in to ERPNext" }).click()
  await expect(page.getByLabel("Verification code")).toBeFocused()
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0)
  await page.getByLabel("Verification code").fill("123456")
  await page.getByRole("button", { name: "Verify and sign in" }).click()
  await expect(page).toHaveURL(/\/#stock$/)
  await expect(
    page.getByRole("heading", { name: "Stock Dashboard", exact: true }),
  ).toBeVisible()
  expect(payloads[2]).toEqual({ otp: "123456" })
  expect(
    await page.evaluate(() =>
      Object.entries(localStorage).some(([key, value]) =>
        /password|session|token/.test(key + value),
      ),
    ),
  ).toBe(false)
})

test("a forged or expired cookie never mounts company pages and preserves the return path", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    {
      name: "ceopanel_erpnext_sid",
      value: "invalid-native-session",
      url: baseURL!,
      httpOnly: true,
    },
  ])
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({ status: 401, json: { error: "Session expired" } }),
  )
  await page.goto("/agents")
  await expect(page).toHaveURL(/\/login\?next=%2Fagents&expired=1/)
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible()
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0)
})

test("ERP downtime offers retry without showing unverified company pages", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    {
      name: "ceopanel_erpnext_sid",
      value: "native-session",
      url: baseURL!,
      httpOnly: true,
    },
  ])
  let calls = 0
  await page.route("**/api/erpnext/context**", (route) => {
    calls++
    return calls === 1
      ? route.fulfill({ status: 502, json: { error: "ERP is unavailable" } })
      : route.fulfill({
          json: {
            user: "ceo@example.com",
            company: "Durar",
            companies: [{ name: "Durar" }],
            currency: "SAR",
            siteUrl: "https://example.frappe.cloud",
          },
        })
  })
  await page.goto("/agents")
  await expect(
    page.getByRole("alert").filter({ hasText: "ERP is unavailable" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toHaveCount(0)
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible()
})

test("login rejects external return URLs after a successful native sign-in", async ({
  page,
  context,
  baseURL,
}) => {
  await dashboardReads(page)
  await page.route("**/api/erpnext/session", async (route) => {
    await context.addCookies([
      {
        name: "ceopanel_erpnext_sid",
        value: "native-session",
        url: baseURL!,
        httpOnly: true,
      },
    ])
    await route.fulfill({ json: { ok: true } })
  })
  await page.route("**/api/erpnext/context**", (route) =>
    route.fulfill({
      json: {
        user: "ceo@example.com",
        company: "Durar",
        companies: [{ name: "Durar" }],
        currency: "SAR",
        siteUrl: "https://example.frappe.cloud",
      },
    }),
  )
  await page.goto("/login?next=https%3A%2F%2Fevil.example")
  await page.getByLabel("ERPNext email or username").fill("ceo@example.com")
  await page.getByLabel("Password", { exact: true }).fill("fixture-password")
  await page.getByRole("button", { name: "Sign in to ERPNext" }).click()
  await expect(page).toHaveURL(`${baseURL}/`, { timeout: 20000 })
  await expect(
    page.getByRole("heading", { name: "Sales Comparison", exact: true }),
  ).toBeVisible()
})
