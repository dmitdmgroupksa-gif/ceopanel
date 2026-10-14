import { Queue } from "bullmq"
import { ERPNextError } from "../erpnext-client"
export const queueName = "ceopanel-platform"
export function redisConnection() {
  if (!process.env.REDIS_URL)
    throw new ERPNextError("Background queue is awaiting configuration.", 503)
  const url = new URL(process.env.REDIS_URL)
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  }
}
let queue: Queue | undefined
export function jobQueue() {
  return (queue ??= new Queue(queueName, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  }))
}
