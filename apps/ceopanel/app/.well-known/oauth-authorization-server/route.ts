import { metadata } from "@/lib/mcp/http"
export const dynamic = "force-dynamic"
export function GET() {
  return metadata("authorization")
}
