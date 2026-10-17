import { describe, expect, it, vi } from "vitest"
import { requestBody } from "./request-body"

function streaming(chunks: string[], cancel = vi.fn()) {
  const encoder = new TextEncoder()
  let index = 0
  return {
    cancel,
    request: new Request("https://panel.example/test", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({
        pull(controller) {
          if (index < chunks.length)
            controller.enqueue(encoder.encode(chunks[index++]))
          else controller.close()
        },
        cancel,
      }),
    } as RequestInit),
  }
}
describe("bounded streaming request bodies", () => {
  it("counts UTF-8 bytes and accepts bodies exactly at the limit", async () => {
    const { request } = streaming(["أ", "ب"])
    expect((await requestBody(request, 4)).toString("utf8")).toBe("أب")
  })
  it("cancels a chunked body as soon as the byte limit is exceeded", async () => {
    const { request, cancel } = streaming(["ab", "cd", "ef", "unread"])
    await expect(requestBody(request, 3)).rejects.toMatchObject({ status: 413 })
    expect(cancel).toHaveBeenCalledOnce()
    expect(request.body?.locked).toBe(false)
  })
  it("rejects a declared oversized payload before buffering it", async () => {
    const { request, cancel } = streaming(["small"])
    request.headers.set("Content-Length", "99999")
    await expect(requestBody(request, 100)).rejects.toMatchObject({
      status: 413,
    })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
