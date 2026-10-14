import { createHmac, timingSafeEqual } from "node:crypto"
import { database } from "./db"
import type { ActionPayload } from "./catalog"
import { ERPNextError } from "../erpnext-client"
import { platformConfig } from "./config"
import { randomUUID } from "node:crypto"
import { redactRestrictedText } from "./privacy"
export function validMetaSignature(body: string, signature: string | null) {
  if (!process.env.WHATSAPP_APP_SECRET || !signature?.startsWith("sha256="))
    return false
  const expected = createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
    .update(body)
    .digest()
  const supplied = Buffer.from(signature.slice(7), "hex")
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  )
}
export async function sendWhatsApp(proposal: string, payload: ActionPayload) {
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
  await database().query(
    "INSERT INTO message_deliveries(proposal,provider_id,status) VALUES($1,$2,'accepted') ON CONFLICT(proposal) DO UPDATE SET provider_id=$2,status='accepted',updated_at=now()",
    [proposal, id],
  )
  return { provider: "whatsapp", messageId: id, status: "accepted" }
}
export async function receiveWhatsApp(body: unknown) {
  const entries =
    (
      body as {
        entry?: {
          changes?: {
            value?: {
              statuses?: {
                id: string
                status: string
                recipient_id: string
                biz_opaque_callback_data?: string
              }[]
              messages?: {
                id: string
                from: string
                type: string
                text?: { body: string }
              }[]
            }
          }[]
        }[]
      }
    )?.entry || []
  for (const entry of entries)
    for (const change of entry.changes || []) {
      for (const status of change.value?.statuses || []) {
        const id = status.biz_opaque_callback_data
        if (
          !id ||
          !/^[a-f0-9-]{36}$/.test(id) ||
          !["sent", "delivered", "read", "failed"].includes(status.status)
        )
          continue
        const proposal = (
          await database().query(
            "SELECT payload,status FROM proposals WHERE id=$1",
            [id],
          )
        ).rows[0]
        if (
          proposal?.payload.kind !== "message" ||
          proposal.payload.channel !== "whatsapp" ||
          proposal.payload.recipient?.replace(/^\+/, "") !== status.recipient_id
        )
          continue
        await database().query(
          "INSERT INTO message_deliveries(proposal,provider_id,status) VALUES($1,$2,$3) ON CONFLICT(proposal) DO UPDATE SET status=$3,updated_at=now()",
          [id, status.id, status.status],
        )
        if (["sent", "delivered", "read"].includes(status.status))
          await database().query(
            "UPDATE proposals SET status='executed',result=$2,updated_at=now() WHERE id=$1 AND status IN ('executing','needs_reconciliation')",
            [
              id,
              JSON.stringify({
                provider: "whatsapp",
                messageId: status.id,
                status: status.status,
              }),
            ],
          )
      }
      for (const message of change.value?.messages || []) {
        if (message.type !== "text" || typeof message.text?.body !== "string")
          continue
        const identity = platformConfig().channelIdentities.find(
          (i) =>
            i.channel === "whatsapp" &&
            i.address.replace(/^\+/, "") === message.from,
        )
        if (!identity) continue // Unknown external identities never get company data or agent access.
        const result = await database().query(
          "INSERT INTO channel_inbox(provider_id,channel,owner,company,agent,content) VALUES($1,'whatsapp',$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [
            message.id,
            identity.user,
            identity.company,
            identity.agent,
            redactRestrictedText(message.text.body).slice(0, 12000),
          ],
        )
        if (result.rowCount)
          await database().query(
            "INSERT INTO notifications(id,owner,company,title,href) VALUES($1,$2,$3,'WhatsApp message received','/notifications')",
            [randomUUID(), identity.user, identity.company],
          )
      }
    }
}
