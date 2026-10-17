import { identity } from "@/lib/platform/auth"
import { client } from "@/lib/erpnext-server"
import { erpExport, parseExportToken } from "@/lib/erp-native/files"
import { requireNativeRead } from "@/lib/erp-native/read-policy"
import { workspaceError } from "@/lib/workspace-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const context = await identity(params.get("company") || undefined)
    requireNativeRead(context)
    const result = await erpExport(
      await client(),
      context,
      parseExportToken(params.get("request") || ""),
      true,
    )
    return new Response(new Uint8Array(result.blob!), {
      headers: {
        "Content-Type": result.data.file.mimeType,
        "Content-Disposition": `attachment; filename="ERP-export"; filename*=UTF-8''${encodeURIComponent(result.data.file.name)}`,
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    })
  } catch (error) {
    return workspaceError(error)
  }
}
