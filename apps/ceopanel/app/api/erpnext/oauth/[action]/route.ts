import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  completeFrappeLogin,
  FRAPPE_FLOW_COOKIE,
  startFrappeLogin,
} from "@/lib/frappe-oauth"
import { SESSION_COOKIE } from "@/lib/auth-navigation"
import { siteUrl } from "@/lib/erpnext-server"
import { externalOrigin } from "@/lib/mcp/crypto"
import { ERPNextError } from "@/lib/erpnext-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  }
  try {
    const origin = externalOrigin(),
      url = new URL(request.url),
      action = (await params).action
    if ((request.headers.get("host") || url.host) !== new URL(origin).host)
      throw new ERPNextError("Untrusted Frappe login host.", 403)
    const jar = await cookies(),
      options = {
        httpOnly: true,
        secure: new URL(origin).protocol === "https:",
        sameSite: "lax" as const,
        path: "/",
      }
    if (action === "start") {
      const flow = await startFrappeLogin(
        siteUrl(),
        url.searchParams.get("next"),
      )
      const response = NextResponse.redirect(flow.redirect, 302)
      response.cookies.set(FRAPPE_FLOW_COOKIE, flow.state, {
        ...options,
        maxAge: 600,
      })
      for (const [key, value] of Object.entries(headers))
        response.headers.set(key, value)
      return response
    }
    if (action !== "callback")
      throw new ERPNextError("Frappe login endpoint not found.", 404)
    const state = url.searchParams.get("state") || "",
      browserState = jar.get(FRAPPE_FLOW_COOKIE)?.value
    if (url.searchParams.has("error")) {
      const response = NextResponse.redirect(
        new URL("/login?frappe_error=1", origin),
        302,
      )
      response.cookies.delete(FRAPPE_FLOW_COOKIE)
      for (const [key, value] of Object.entries(headers))
        response.headers.set(key, value)
      return response
    }
    const result = await completeFrappeLogin(
      siteUrl(),
      state,
      browserState,
      url.searchParams.get("code") || "",
    )
    const response = NextResponse.redirect(new URL(result.next, origin), 302)
    response.cookies.delete(FRAPPE_FLOW_COOKIE)
    response.cookies.set(SESSION_COOKIE, result.session, {
      ...options,
      maxAge: 28800,
    })
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value)
    return response
  } catch (error) {
    const response = NextResponse.json(
      {
        error:
          error instanceof ERPNextError
            ? error.message
            : "Frappe login could not be completed. Start sign-in again.",
      },
      { status: error instanceof ERPNextError ? error.status : 502, headers },
    )
    response.cookies.delete(FRAPPE_FLOW_COOKIE)
    return response
  }
}
