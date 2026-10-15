import { NextResponse } from "next/server"
import { humanTool } from "@/lib/mcp/client"
import { dashboardAdapters, loadDashboard } from "@/lib/dashboard-server"
import { ERPNextError } from "@/lib/erpnext-client"
export const dynamic = "force-dynamic"
export async function GET(
  request: Request,
  context: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await context.params
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
      Object.hasOwn(dashboardAdapters, dashboardId)
        ? await humanTool(
            params.get("company") || undefined,
            "dashboard_read",
            { dashboard: dashboardId, days },
          )
        : await loadDashboard(
            dashboardId,
            days,
            params.get("company") || undefined,
          ),
      { headers },
    )
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof ERPNextError
            ? cause.message
            : "Dashboard data could not be loaded.",
      },
      { status: cause instanceof ERPNextError ? cause.status : 502, headers },
    )
  }
}
