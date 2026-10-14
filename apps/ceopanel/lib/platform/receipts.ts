import { createHmac, timingSafeEqual } from "node:crypto"
import { ERPNextError } from "../erpnext-client"
export function verifiedReceipt(
  input: unknown,
  proposal: string,
  company: string,
  module: string,
  name?: string,
) {
  const value = input as {
    receipt?: {
      proposal: string
      company: string
      module: string
      name: string
      modified: string
    }
    signature?: string
  }
  const secret = process.env.ERPNEXT_RECEIPT_SECRET,
    receipt = value?.receipt
  if (
    !secret ||
    !receipt ||
    typeof value.signature !== "string" ||
    receipt.proposal !== proposal ||
    receipt.company !== company ||
    receipt.module !== module ||
    (name && receipt.name !== name)
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
