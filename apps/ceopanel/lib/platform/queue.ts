import { Queue } from "bullmq"
import { ERPNextError } from "../erpnext-client"
export const queueName = "ceopanel-platform"
export function redisConnection() {
  if (!process.env.REDIS_URL)
    throw new ERPNextError("Background queue is awaiting configuration.", 503)
  let url: URL
  try {
    url = new URL(process.env.REDIS_URL)
  } catch {
    throw new ERPNextError(
      "Redis configuration requires a redis:// or rediss:// URL.",
      503,
    )
  }
  if (
    !["redis:", "rediss:"].includes(url.protocol) ||
    !/^\/(?:\d+)?$/.test(url.pathname || "/") ||
    url.search ||
    url.hash
  )
    throw new ERPNextError(
      "Redis configuration requires a redis:// or rediss:// URL and a numeric database index.",
      503,
    )
  const db = Number(url.pathname.slice(1) || 0)
  if (!Number.isSafeInteger(db))
    throw new ERPNextError("Redis database index is invalid.", 503)
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    db,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  }
}
let queue: Queue | undefined
export function jobQueue() {
  if (queue) return queue
  queue = new Queue(queueName, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  })
  queue.on("error", () => console.error("Platform queue connection failed."))
  return queue
}
