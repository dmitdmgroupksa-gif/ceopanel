import { createHmac, timingSafeEqual, createHash } from "node:crypto"
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
