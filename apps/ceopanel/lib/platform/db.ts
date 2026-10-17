import { Pool, type PoolClient } from "pg"
import { ERPNextError } from "../erpnext-client"
let pool: Pool | undefined
export function database() {
  if (!process.env.DATABASE_URL && !process.env.PGHOST)
    throw new ERPNextError("Platform database is awaiting configuration.", 503)
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    })
    // Idle connections can fail during a database restart. An unhandled pool
    // error event would terminate the server instead of allowing reconnection.
    pool.on("error", () =>
      console.error("Platform database connection failed."),
    )
  }
  return pool
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await database().connect()
  let broken: Error | undefined
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch (rollbackError) {
      broken =
        rollbackError instanceof Error
          ? rollbackError
          : new Error("Database rollback failed.")
    }
    throw error
  } finally {
    client.release(broken)
  }
}
export async function audit(
  user: string,
  company: string,
  event: string,
  target: string,
  details: unknown = {},
) {
  await database().query(
    "INSERT INTO audit_events(actor,company,event,target,details) VALUES($1,$2,$3,$4,$5)",
    [user, company, event, target, JSON.stringify(details)],
  )
}
