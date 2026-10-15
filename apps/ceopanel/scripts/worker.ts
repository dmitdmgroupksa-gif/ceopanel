import { Worker } from "bullmq"
import { jobQueue, queueName, redisConnection } from "../lib/platform/queue"
import { database } from "../lib/platform/db"
import { ingest } from "../lib/platform/knowledge"
import { capabilities } from "../lib/platform/config"
import { ERPNextError } from "../lib/erpnext-client"
// This worker never holds ERP user sessions and never executes business mutations.
const worker = new Worker(
  queueName,
  async (job) => {
    if (job.name === "document") {
      try {
        await ingest(job.data.id)
      } catch (error) {
        await database().query(
          "UPDATE knowledge_documents SET status=$2 WHERE id=$1 AND status<>'ready'",
          [
            job.data.id,
            error instanceof ERPNextError && error.status === 409
              ? "awaiting_configuration"
              : job.attemptsMade + 1 >= (job.opts.attempts || 1)
                ? "failed"
                : "queued",
          ],
        )
        throw error
      }
    } else if (job.name === "reconcile") {
      const documents = (
        await database().query(
          "SELECT id FROM knowledge_documents WHERE status='queued' OR (status='awaiting_configuration' AND $1)",
          [capabilities().embeddings],
        )
      ).rows
      for (const doc of documents) {
        const prior = await jobQueue().getJob(doc.id)
        if (prior && ["failed", "completed"].includes(await prior.getState()))
          await prior.remove()
        await jobQueue().add("document", { id: doc.id }, { jobId: doc.id })
      }
      await database().query(
        "UPDATE event_inbox SET processed_at=now() WHERE processed_at IS NULL",
      )
      await database().query(
        "INSERT INTO sync_state(source,reconciled_at) VALUES('platform',now()) ON CONFLICT(source) DO UPDATE SET reconciled_at=now()",
      )
      // A crash after dispatch is uncertain until an approving user checks the ERP receipt.
      await database().query(
        "UPDATE proposals SET status='needs_reconciliation',updated_at=now() WHERE status='executing' AND updated_at<now()-interval '5 minutes'",
      )
    }
  },
  { connection: redisConnection(), concurrency: 2 },
)
worker.on("failed", (job) => console.error("Platform job failed", job?.id))
worker.on("error", (error) =>
  console.error("Platform worker error", error.message),
)
await jobQueue().upsertJobScheduler(
  "reconciliation",
  { every: 300000 },
  { name: "reconcile", data: {} },
)
console.log("Platform worker ready")
async function stop() {
  await worker.close()
  await jobQueue().close()
  await database().end()
  process.exit(0)
}
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
