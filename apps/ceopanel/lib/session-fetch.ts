"use client"

// Company requests keep their own abort/error handling. Authentication failures
// also clear the shared company view immediately, including on nested editors.
export async function sessionFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await globalThis.fetch(input, init)
  if (response.status === 401 && !init?.signal?.aborted)
    window.dispatchEvent(new Event("ceopanel:session-expired"))
  return response
}
