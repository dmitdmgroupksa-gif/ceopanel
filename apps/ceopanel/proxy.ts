import { NextResponse, type NextRequest } from "next/server"
import { loginPath, SESSION_COOKIE } from "./lib/auth-navigation"
import { localAuthDisabled } from "./lib/auth-mode"

export function proxy(request: NextRequest) {
  const sid = request.cookies.get(SESSION_COOKIE)?.value
  if (
    !localAuthDisabled(request.nextUrl.host) &&
    (!sid || sid === "Guest" || !/^[A-Za-z0-9_-]+$/.test(sid))
  ) {
    const response = NextResponse.redirect(
      new URL(
        loginPath(`${request.nextUrl.pathname}${request.nextUrl.search}`),
        request.url,
      ),
    )
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
  const response = NextResponse.next()
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export const config = {
  matcher: [
    "/",
    "/workspace",
    "/agents",
    "/knowledge",
    "/field-updates",
    "/approvals",
    "/notifications",
    "/integrations",
  ],
}
