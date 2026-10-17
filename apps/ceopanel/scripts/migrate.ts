import "./env"
import { readFile } from "node:fs/promises"
import type { PoolClient } from "pg"
import { database } from "../lib/platform/db"
import { migrations } from "../lib/platform/migrations"

let connection: PoolClient | undefined
try {
  connection = await database().connect()
  // Serialize migration runners on one connection; each SQL file owns its transaction.
  await connection.query(
    "SELECT pg_advisory_lock(hashtext('ceopanel-migrations'))",
  )
  for (const migration of migrations)
    await connection.query(
      await readFile(
        new URL(`../db/${migration.file}`, import.meta.url),
        "utf8",
      ),
    )
  console.log("Platform migrations applied. ERPNext was not modified.")
} catch {
  await connection?.query("ROLLBACK").catch(() => {})
  console.error(
    "Platform migration failed. Check database access, pgvector availability and migration permissions.",
  )
  process.exitCode = 1
} finally {
  if (connection) {
    await connection
      .query("SELECT pg_advisory_unlock(hashtext('ceopanel-migrations'))")
      .catch(() => {})
    connection.release()
  }
  if (process.env.DATABASE_URL || process.env.PGHOST) await database().end()
}
