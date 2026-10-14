import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { SESSION_COOKIE, siteUrl, validOrigin } from "@/lib/erpnext-server"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store" }

export async function POST(request: Request) {
  if (!validOrigin(request))
    return NextResponse.json(
      { error: "This sign-in request is not allowed." },
      { status: 403, headers }
    )
  try {
    const text = await request.text()
    if (text.length > 4096)
      return NextResponse.json(
        { error: "Invalid sign-in request." },
        { status: 400, headers }
      )
    const { username, password } = JSON.parse(text)
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !password ||
      username.length > 320 ||
      password.length > 1024
    ) {
      return NextResponse.json(
        { error: "Enter your ERPNext username and password." },
        { status: 400, headers }
      )
    }
    const response = await fetch(`${siteUrl()}/api/method/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ usr: username.trim(), pwd: password }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      const message =
        response.status === 429
          ? "Too many sign-in attempts. Please wait and try again."
          : "ERPNext could not sign you in. Check your credentials or sign in directly on your ERPNext site."
      return NextResponse.json(
        { error: message },
        { status: response.status === 429 ? 429 : 401, headers }
      )
    }
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("sid="))
    const sid = cookie?.match(/^sid=([A-Za-z0-9_-]+)(?:;|$)/)?.[1]
    if (!sid || sid === "Guest")
      return NextResponse.json(
        {
          error:
            "ERPNext did not issue a session. If your account requires two-factor authentication, the sign-in adapter needs to be configured for it.",
        },
        { status: 401, headers }
      )
    ;(await cookies()).set(SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })
    return NextResponse.json({ ok: true }, { headers })
  } catch {
    return NextResponse.json(
      {
        error:
          "Sign-in could not be completed. Please check your connection and try again.",
      },
      { status: 502, headers }
    )
  }
}

export async function DELETE(request: Request) {
  if (!validOrigin(request))
    return NextResponse.json(
      { error: "This sign-out request is not allowed." },
      { status: 403, headers }
    )
  ;(await cookies()).delete(SESSION_COOKIE)
  return NextResponse.json({ ok: true }, { headers })
}
