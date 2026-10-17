import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"

// A new project and random loopback ports isolate every run from configured databases.
const compose = [
  "compose",
  "--project-name",
  `ceopanel-tests-${randomUUID()}`,
  "--file",
  fileURLToPath(new URL("../deploy/compose.test.yaml", import.meta.url)),
]
function docker(args: string[], capture = false) {
  const result = spawnSync("docker", [...compose, ...args], {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    timeout: 240000,
  })
  if (result.error || result.status !== 0)
    throw new Error(
      "Disposable test services failed. Check that Docker is running.",
    )
  return result.stdout?.trim() || ""
}
function port(service: string, number: number) {
  const address = docker(["port", service, String(number)], true)
  if (!/^127\.0\.0\.1:\d+$/.test(address))
    throw new Error("Unexpected test service address.")
  return address
}
let started = false
try {
  started = true
  docker(["up", "--detach", "--wait", "--wait-timeout", "120"])
  const postgres = port("postgres", 5432),
    redis = port("redis", 6379)
  const databaseUrl = `postgresql://ceopanel_test:disposable_test_only@${postgres}/ceopanel_test`
  const environment = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PGHOST: "",
    REDIS_URL: `redis://${redis}`,
    PLATFORM_CONFIG_PATH: fileURLToPath(
      new URL("../platform.config.example.json", import.meta.url),
    ),
    ERPNEXT_URL: "https://example.frappe.cloud",
    ERPNEXT_COMPANY: "Fixture Company",
    ERPNEXT_RECEIPT_SECRET: "fixture-receipt-secret-not-for-production",
  }
  // Exercise the actual deployment commands before the transaction/protocol suite.
  for (const [script, args] of [
    ["migrate.ts", []],
    ["check-platform.ts", ["--connections", "--phase=foundation"]],
  ] as const) {
    const probe = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL(`./${script}`, import.meta.url)),
        ...args,
      ],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: environment,
        stdio: "inherit",
        timeout: 60000,
      },
    )
    if (probe.error || probe.status !== 0)
      throw new Error(
        "Staging migration or connection checks failed against disposable services.",
      )
  }
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
      ),
      "run",
      "lib/platform/database.integration.test.ts",
    ],
    {
      stdio: "inherit",
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        PLATFORM_TEST_DATABASE_URL: databaseUrl,
        DATABASE_URL: "",
        PGHOST: "",
        PLATFORM_CONFIG_PATH: "",
        REDIS_URL: `redis://${redis}`,
      },
    },
  )
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Integration test runner failed.",
  )
  process.exitCode = 1
} finally {
  if (started) {
    try {
      docker(["down", "--remove-orphans"])
    } catch {
      console.error(
        "Test service cleanup failed; remove the ceopanel-tests project shown above.",
      )
      process.exitCode = 1
    }
  }
}
