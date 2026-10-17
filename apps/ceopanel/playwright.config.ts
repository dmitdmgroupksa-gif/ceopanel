import { defineConfig, devices } from "@playwright/test"
const port = Number(process.env.CEOPANEL_TEST_PORT || 3107)

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/local-preview.spec.ts"],
  fullyParallel: true,
  workers: 3,
  timeout: 60000,
  use: {
    baseURL: process.env.CEOPANEL_TEST_BASE_URL || `http://localhost:${port}`,
    channel: process.platform === "win32" ? "msedge" : undefined,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: process.env.CEOPANEL_TEST_BASE_URL
    ? undefined
    : {
        command:
          process.env.CEOPANEL_TEST_PRODUCTION === "true"
            ? "npm run start"
            : `npx next dev --webpack --port ${port}`,
        url: `http://localhost:${port}/agents`,
        env: {
          PORT: String(port),
          HOSTNAME: "0.0.0.0",
          CEOPANEL_DISABLE_AUTH: "false",
          MCP_EXTERNAL_ENABLED: "false",
        },
        reuseExistingServer: false,
        timeout: 120000,
      },
})
