import { createHmac, timingSafeEqual } from "node:crypto"
import { transaction } from "./db"
import { z } from "zod"
import type { ActionPayload } from "./catalog"
import { ERPNextError } from "../erpnext-client"
import { platformConfig } from "./config"
import { randomUUID } from "node:crypto"
import { redactRestrictedText } from "./privacy"
export function validMetaSignature(body: string, signature: string | null) {
  if (
    !process.env.WHATSAPP_APP_SECRET ||
    !signature ||
    !/^sha256=[a-fA-F0-9]{64}$/.test(signature)
  )
    return false
  const expected = createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
    .update(body)
    .digest()
  const supplied = Buffer.from(signature.slice(7), "hex")
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  )
}
export function assertWhatsAppConfigured() {
  const {
    WHATSAPP_ACCESS_TOKEN: token,
    WHATSAPP_PHONE_NUMBER_ID: phone,
    WHATSAPP_API_VERSION: version,
  } = process.env
  if (
    !platformConfig().channels.whatsapp ||
    !token ||
    !phone ||
    !version ||
    !/^v\d+\.\d+$/.test(version) ||
    !/^\d+$/.test(phone)
  )
    throw new ERPNextError(
      "WhatsApp awaits validated Business API configuration.",
      409,
    )
  return { token, phone, version }
}
// Delayed callbacks and API acknowledgements must not move a receipt backwards.
const deliveryRank: Record<string, number> = {
  accepted: 0,
  sent: 1,
  failed: 2,
  delivered: 3,
  read: 4,
}
async function recordDelivery(
  proposal: string,
  providerId: string,
  status: string,
  recipient?: string,
) {
  return transaction(async (db) => {
    const row = (
      await db.query(
        "SELECT payload,status,company,approver FROM proposals WHERE id=$1 FOR UPDATE",
        [proposal],
      )
    ).rows[0]
    if (
      !row ||
      !row.approver ||
      !["executing", "needs_reconciliation", "executed"].includes(row.status)
    )
      return false
    if (
      row.payload.kind !== "message" ||
      row.payload.channel !== "whatsapp" ||
      (recipient !== undefined &&
        row.payload.recipient?.replace(/^\+/, "") !== recipient)
    )
      return false
    const existing = (
      await db.query(
        "SELECT provider_id,status FROM message_deliveries WHERE proposal=$1",
        [proposal],
      )
    ).rows[0]
    if (existing && existing.provider_id !== providerId) return false
    const next =
      existing && deliveryRank[existing.status] >= deliveryRank[status]
        ? existing.status
        : status
    await db.query(
      "INSERT INTO message_deliveries(proposal,provider_id,status) VALUES($1,$2,$3) ON CONFLICT(proposal) DO UPDATE SET status=$3,updated_at=now()",
      [proposal, providerId, next],
    )
    if (
      ["sent", "delivered", "read"].includes(next) &&
      row.status !== "executed"
    ) {
      await db.query(
        "UPDATE proposals SET status='executed',result=$2,updated_at=now() WHERE id=$1",
        [
          proposal,
          JSON.stringify({
            provider: "whatsapp",
            messageId: providerId,
            status: next,
          }),
        ],
      )
      await db.query(
        "INSERT INTO audit_events(actor,company,event,target) VALUES($1,$2,'proposal.delivery_confirmed',$3)",
        [row.approver || "whatsapp-webhook", row.company, proposal],
      )
    }
    return true
  })
}
export async function sendWhatsApp(proposal: string, payload: ActionPayload) {
  const { token, phone, version } = assertWhatsAppConfigured()
  // No network retries: a timed-out accepted message needs delivery reconciliation.
  const response = await fetch(
    `https://graph.facebook.com/${version}/${phone}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: payload.recipient,
        type: "text",
        text: { body: payload.text },
        biz_opaque_callback_data: proposal,
      }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  )
  if (!response.ok)
    throw new ERPNextError("WhatsApp did not confirm message acceptance.", 409)
  const result = await response.json()
  const id = result.messages?.[0]?.id
  if (typeof id !== "string")
    throw new ERPNextError(
      "WhatsApp returned an unconfirmed delivery result.",
      409,
    )
  if (!(await recordDelivery(proposal, id, "accepted")))
    throw new ERPNextError("Message receipt conflicts with its proposal.", 409)
  return { provider: "whatsapp", messageId: id, status: "accepted" }
}
export async function receiveWhatsApp(body: unknown) {
  const entries =
    z
      .object({
        entry: z
          .array(
            z.object({
              changes: z
                .array(
                  z.object({
                    value: z
                      .object({
                        metadata: z
                          .object({ phone_number_id: z.string() })
                          .optional(),
                        statuses: z
                          .array(
                            z.object({
                              id: z.string().min(1).max(1000),
                              status: z.string(),
                              recipient_id: z.string(),
                              biz_opaque_callback_data: z.string().optional(),
                            }),
                          )
                          .optional(),
                        messages: z
                          .array(
                            z.object({
                              id: z.string().min(1).max(1000),
                              from: z.string(),
                              type: z.string(),
                              text: z.object({ body: z.string() }).optional(),
                            }),
                          )
                          .optional(),
                      })
                      .optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
      })
      .parse(body).entry || []
  for (const entry of entries)
    for (const change of entry.changes || []) {
      if (
        !process.env.WHATSAPP_PHONE_NUMBER_ID ||
        change.value?.metadata?.phone_number_id !==
          process.env.WHATSAPP_PHONE_NUMBER_ID
      )
        continue
      for (const status of change.value?.statuses || []) {
        const id = status.biz_opaque_callback_data
        if (
          !id ||
          !z.uuid().safeParse(id).success ||
          !["sent", "delivered", "read", "failed"].includes(status.status)
        )
          continue
        // Check the approved recipient while holding the same lock used by delivery updates.
        await recordDelivery(id, status.id, status.status, status.recipient_id)
      }
      for (const message of change.value?.messages || []) {
        if (message.type !== "text" || typeof message.text?.body !== "string")
          continue
        const content = redactRestrictedText(message.text.body).slice(0, 12000)
        const identity = platformConfig().channelIdentities.find(
          (i) =>
            i.channel === "whatsapp" &&
            i.address.replace(/^\+/, "") === message.from,
        )
        if (!identity) continue // Unknown external identities never get company data or agent access.
        await transaction(async (db) => {
          const result = await db.query(
            "INSERT INTO channel_inbox(provider_id,channel,owner,company,agent,content) VALUES($1,'whatsapp',$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            [
              message.id,
              identity.user,
              identity.company,
              identity.agent,
              content,
            ],
          )
          if (result.rowCount)
            await db.query(
              "INSERT INTO notifications(id,owner,company,title,href) VALUES($1,$2,$3,'WhatsApp message received','/notifications')",
              [randomUUID(), identity.user, identity.company],
            )
        })
      }
    }
}
