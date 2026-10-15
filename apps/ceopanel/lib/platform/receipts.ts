import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { ERPNextError } from "../erpnext-client"
export function executionAuthorization(
  proposal: string,
  company: string,
  payload: string,
  actor: string,
) {
  const secret = process.env.ERPNEXT_RECEIPT_SECRET
  if (!secret)
    throw new ERPNextError(
      "ERP receipt verification awaits configuration.",
      409,
    )
  const timestamp = Math.floor(Date.now() / 1000)
  const authorization = {
    actor,
    company,
    payloadHash: createHash("sha256").update(payload).digest("hex"),
    proposal,
    timestamp,
  }
  return {
    timestamp,
    signature: createHmac("sha256", secret)
      .update("ceopanel.execute.v1:" + JSON.stringify(authorization))
      .digest("hex"),
  }
}
export function verifiedReceipt(
  input: unknown,
  proposal: string,
  company: string,
  module: string,
  name?: string,
  payload?: unknown,
  approver?: string,
) {
  const value = input as {
    receipt?: {
      proposal: string
      company: string
      module: string
      name: string
      modified: string
      payloadHash?: string
      actor?: string
    }
    signature?: string
  }
  const secret = process.env.ERPNEXT_RECEIPT_SECRET,
    receipt = value?.receipt
  if (
    !secret ||
    !receipt ||
    typeof value.signature !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(value.signature) ||
    receipt.proposal !== proposal ||
    receipt.company !== company ||
    receipt.module !== module ||
    (name && receipt.name !== name) ||
    (payload !== undefined &&
      receipt.payloadHash !==
        createHash("sha256").update(JSON.stringify(payload)).digest("hex")) ||
    (approver !== undefined && receipt.actor !== approver)
  )
    throw new ERPNextError("ERP receipt verification failed.", 409)
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(receipt).sort(([a], [b]) => a.localeCompare(b)),
    ),
  )
  const expected = createHmac("sha256", secret).update(canonical).digest(),
    given = Buffer.from(value.signature, "hex")
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    throw new ERPNextError("ERP receipt verification failed.", 409)
  return receipt
}
