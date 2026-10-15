import { serveMcp, preflight } from "@/lib/mcp/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = serveMcp
export const POST = serveMcp
export const DELETE = serveMcp
export const OPTIONS = preflight
