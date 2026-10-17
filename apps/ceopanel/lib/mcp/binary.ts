export async function binaryResult(response: Response) {
  return {
    base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
    contentType:
      response.headers.get("Content-Type") || "application/octet-stream",
    disposition: response.headers.get("Content-Disposition"),
  }
}
export function binaryResponse(
  result: Awaited<ReturnType<typeof binaryResult>>,
) {
  return new Response(Buffer.from(result.base64, "base64"), {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      ...(result.disposition
        ? { "Content-Disposition": result.disposition }
        : {}),
    },
  })
}
export async function fileArgument(file: File) {
  return {
    filename: file.name,
    mime: file.type,
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  }
}
