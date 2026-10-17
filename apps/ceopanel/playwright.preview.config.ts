import { defineConfig } from "@playwright/test"
import base from "./playwright.config"

const port = Number(process.env.CEOPANEL_TEST_PORT || 3108)
const baseURL = process.env.CEOPANEL_TEST_BASE_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  ...base,
  // This suite exercises a development server that compiles routes on demand.
  // Serialize page tours so cold compilation does not race other navigations.
  workers: 1,
  testIgnore: [],
  testMatch: ["**/local-preview.spec.ts"],
  use: { ...base.use, baseURL },
  webServer: process.env.CEOPANEL_TEST_BASE_URL
    ? undefined
    : {
        command: `npx next dev --webpack --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        env: { CEOPANEL_DISABLE_AUTH: "true" },
        reuseExistingServer: false,
        timeout: 120000,
      },
})
