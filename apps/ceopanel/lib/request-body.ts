import { ERPNextError } from "./erpnext-error"

// Enforce byte limits while streaming, including requests without Content-Length.
export async function requestBody(
  request: Pick<Request, "body" | "headers">,
  limit: number,
  message = "Request exceeds the upload limit.",
) {
  const reader = request.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    const declared = Number(request.headers.get("Content-Length"))
    if (Number.isFinite(declared) && declared > limit) {
      await reader.cancel().catch(() => {})
      throw new ERPNextError(message, 413)
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel().catch(() => {})
        throw new ERPNextError(message, 413)
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks, size)
  } finally {
    reader.releaseLock()
  }
}
