import { Redis } from "ioredis"
import { database } from "./db"
import { redisConnection } from "./queue"

// Readiness probes test dependencies; public responses contain no configuration details.
export async function healthy() {
  const redis = new Redis({
    ...redisConnection(),
    lazyConnect: true,
    connectTimeout: 3000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  })
  redis.on("error", () => {})
  try {
    const results = await Promise.allSettled([
      database().query("SELECT 1"),
      (async () => {
        await redis.connect()
        return await redis.ping()
      })(),
    ])
    return results.every((result) => result.status === "fulfilled")
  } finally {
    redis.disconnect()
  }
}
