import { NextResponse } from "next/server"
import { ERPNextError } from "@/lib/erpnext-client"
import { humanTool } from "@/lib/mcp/human-tool"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const days = Number(params.get("days") || 90)
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" }
  if (![30, 90, 365].includes(days))
    return NextResponse.json(
      { error: "Choose a supported reporting period." },
      { status: 400, headers },
    )
  try {
    return NextResponse.json(
      await humanTool(params.get("company") || undefined, "company_snapshot", {
        days,
      }),
      { headers },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ERPNextError
            ? error.message
            : "Company data could not be loaded.",
      },
      { status: error instanceof ERPNextError ? error.status : 502, headers },
    )
  }
}
