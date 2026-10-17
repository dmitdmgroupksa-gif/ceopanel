import { sessionFetch } from "./session-fetch"
import type { ExportRequest, FileDescriptor } from "./erp-native/files"

export async function explorerRead<T>(
  company: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await sessionFetch("/api/erp/explorer", {
    method: "POST",
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, company }),
  })
  const data = await response.json()
  if (!response.ok)
    throw new Error(data.error || "The ERP read could not be completed.")
  return data as T
}
export async function downloadERPFile(
  company: string,
  request: ExportRequest,
  signal?: AbortSignal,
) {
  const file = await explorerRead<FileDescriptor>(
    company,
    { action: "export", request },
    signal,
  )
  if (!file.downloadUrl.startsWith("/api/erp/files?"))
    throw new Error("Invalid file download.")
  const response = await sessionFetch(file.downloadUrl, {
    cache: "no-store",
    signal,
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "The file could not be downloaded.")
  }
  const blob = await response.blob()
  if (signal?.aborted) return
  const url = URL.createObjectURL(blob),
    link = document.createElement("a")
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function erpRecordHref(site: string, doctype: string, name: string) {
  const route = encodeURIComponent(doctype.toLowerCase().replaceAll(" ", "-"))
  return new URL(`/app/${route}/${encodeURIComponent(name)}`, site).href
}
