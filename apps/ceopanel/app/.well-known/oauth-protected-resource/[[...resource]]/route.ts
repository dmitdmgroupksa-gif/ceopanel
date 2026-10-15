import { metadata, noStore } from "@/lib/mcp/http"
export const dynamic = "force-dynamic"
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resource?: string[] }> },
) {
  const path = (await params).resource?.join("/")
  return path && path !== "api/mcp"
    ? Response.json(
        { error: "Resource not found." },
        { status: 404, headers: noStore },
      )
    : metadata("resource")
}
