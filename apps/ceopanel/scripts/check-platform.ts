import "./env"
import { Pool } from "pg"
import { Redis } from "ioredis"
import { platformConfig } from "../lib/platform/config"
import {
  configurationReadiness,
  type ReadinessCheck,
} from "../lib/platform/readiness"
import { migrations } from "../lib/platform/migrations"
import { redisConnection } from "../lib/platform/queue"

const flags = new Set(process.argv.slice(2))
const phases = ["foundation", "reads", "assistants", "approvals", "channels"]
const phase = [...flags].find((flag) => flag.startsWith("--phase="))?.slice(8)
if (
  [...flags].some(
    (flag) =>
      !["--connections", "--json"].includes(flag) &&
      !/^--phase=(foundation|reads|assistants|approvals|channels)$/.test(flag),
  )
) {
  console.error(
    "Usage: npm run platform:check -- [--connections] [--json] [--phase=foundation|reads|assistants|approvals|channels]",
  )
  process.exitCode = 1
} else {
  try {
    const report = configurationReadiness(platformConfig(), process.env)
    const connections: ReadinessCheck[] = []
    if (flags.has("--connections")) {
      const postgres = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 3000,
        statement_timeout: 5000,
      })
      const configured = (id: string) =>
        report.checks.some((c) => c.id === id && c.state === "pass")
      try {
        let ready = false
        if (configured("database")) {
          const version = await postgres.query(
            "SELECT extversion FROM pg_extension WHERE extname='vector'",
          )
          const table = await postgres.query(
            "SELECT to_regclass('public.platform_migrations') AS name",
          )
          const applied = table.rows[0].name
            ? (
                await postgres.query<{ version: string }>(
                  "SELECT version FROM public.platform_migrations",
                )
              ).rows.map((r) => r.version)
            : []
          ready =
            version.rowCount === 1 &&
            migrations.every((m) => applied.includes(m.version))
        }
        connections.push({
          id: "database-live",
          phase: "foundation",
          title: "Database schema probe",
          state: ready ? "pass" : "blocked",
          detail:
            "Read-only check requires pgvector and all platform migration versions.",
        })
      } catch {
        connections.push({
          id: "database-live",
          phase: "foundation",
          title: "Database schema probe",
          state: "blocked",
          detail:
            "Database connection or schema check failed. Check access and run db:migrate.",
        })
      } finally {
        await postgres.end()
      }
      let redis: Redis | undefined
      try {
        if (!configured("redis")) throw new Error("Not configured")
        redis = new Redis({
          ...redisConnection(),
          lazyConnect: true,
          connectTimeout: 3000,
          commandTimeout: 3000,
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
        })
        redis.on("error", () => {})
        await redis.connect()
        const ready = (await redis.ping()) === "PONG"
        connections.push({
          id: "redis-live",
          phase: "foundation",
          title: "Redis connection probe",
          state: ready ? "pass" : "blocked",
          detail:
            "Read-only PING verifies the queue connection; worker acceptance remains separate.",
        })
      } catch {
        connections.push({
          id: "redis-live",
          phase: "foundation",
          title: "Redis connection probe",
          state: "blocked",
          detail:
            "Redis connection failed. Check REDIS_URL and service availability.",
        })
      } finally {
        redis?.disconnect()
      }
    }
    const selected = phase
      ? report.checks.filter(
          (c) => phases.indexOf(c.phase) <= phases.indexOf(phase),
        )
      : report.checks
    const result = {
      ...report,
      phase: phase || "all",
      configured:
        selected.every((c) => c.state !== "blocked") &&
        connections.every((c) => c.state === "pass"),
      connections,
    }
    if (flags.has("--json")) console.log(JSON.stringify(result, null, 2))
    else {
      for (const check of [...selected, ...connections])
        console.log(`[${check.state}] ${check.title}: ${check.detail}`)
      console.log(
        "These checks do not validate live ERP permissions, KPI reconciliation, model quality or delivery. Complete STAGING.md before rollout.",
      )
    }
    if (!result.configured) process.exitCode = 1
  } catch {
    // Configuration and connection errors can include private URLs. Never echo them.
    console.error(
      "Platform configuration could not be loaded. Check PLATFORM_CONFIG_PATH and the schema in platform.config.example.json.",
    )
    process.exitCode = 1
  }
}
