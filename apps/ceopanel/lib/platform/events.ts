import { createHmac, timingSafeEqual, createHash } from "node:crypto"
import { z } from "zod"
import { transaction } from "./db"
export function validSignature(
  body: string,
  signature: string | null,
  secret: string | undefined,
) {
  if (!signature || !secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature))
    return false
  const expected = createHmac("sha256", secret).update(body).digest()
  const supplied = Buffer.from(signature, "base64")
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  )
}
export function eventId(body: string) {
  return createHash("sha256").update(body).digest("hex")
}

export async function receiveERPEvent(body: string) {
  z.object({
    doctype: z.string().min(1).max(140),
    name: z.string().min(1).max(1000),
    modified: z.string().min(1).max(80),
  }).parse(JSON.parse(body))
  const id = eventId(body)
  // A failed freshness update must roll back deduplication, so a retry can recover it.
  await transaction(async (db) => {
    const inserted = await db.query(
      "INSERT INTO event_inbox(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id",
      [id],
    )
    if (inserted.rowCount)
      await db.query(
        "INSERT INTO sync_state(source,last_event_at) VALUES('erpnext',now()) ON CONFLICT(source) DO UPDATE SET last_event_at=now()",
      )
  })
  return { accepted: true, id }
}
