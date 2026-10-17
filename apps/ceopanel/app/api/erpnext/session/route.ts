import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { SESSION_COOKIE, siteUrl, validOrigin } from "@/lib/erpnext-server"
import { requestBody } from "@/lib/request-body"
import { ERPNextClient, ERPNextError } from "@/lib/erpnext-client"
import { CHALLENGE_COOKIE } from "@/lib/auth-navigation"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store" }
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
})

export async function POST(request: Request) {
  if (!validOrigin(request))
    return NextResponse.json(
      { error: "This sign-in request is not allowed." },
      { status: 403, headers },
    )
  try {
    const text = (
      await requestBody(request, 4096, "Invalid sign-in request.")
    ).toString("utf8")
    const input: unknown = JSON.parse(text)
    if (!input || typeof input !== "object" || Array.isArray(input))
      return NextResponse.json(
        { error: "Invalid sign-in request." },
        { status: 400, headers },
      )
    const { username, password, otp } = input as Record<string, unknown>
    const jar = await cookies()
    let credentials: Record<string, string>
    if (otp !== undefined) {
      const challenge = jar.get(CHALLENGE_COOKIE)?.value
      if (
        typeof otp !== "string" ||
        !/^\d{6}$/.test(otp) ||
        !challenge ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(challenge)
      )
        return NextResponse.json(
          {
            error:
              "Verification expired or the code is invalid. Start sign-in again.",
          },
          { status: 401, headers },
        )
      credentials = { otp, tmp_id: challenge }
    } else {
      jar.delete(CHALLENGE_COOKIE)
      if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        !username.trim() ||
        !password ||
        username.length > 320 ||
        password.length > 512
      ) {
        return NextResponse.json(
          { error: "Enter your ERPNext username and password." },
          { status: 400, headers },
        )
      }
      credentials = { usr: username.trim(), pwd: password }
    }
    const response = await fetch(`${siteUrl()}/api/method/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(credentials),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      const message =
        response.status === 429
          ? "Too many sign-in attempts. Please wait and try again."
          : response.status >= 500
            ? "ERPNext is temporarily unavailable. Please try again."
            : "ERPNext could not sign you in. Check your credentials or verification code."
      return NextResponse.json(
        { error: message },
        {
          status:
            response.status === 429 ? 429 : response.status >= 500 ? 502 : 401,
          headers,
        },
      )
    }
    const result = await response.json()
    if (
      result.tmp_id &&
      result.verification &&
      typeof result.tmp_id === "string" &&
      /^[A-Za-z0-9_-]{8,128}$/.test(result.tmp_id)
    ) {
      jar.set(CHALLENGE_COOKIE, result.tmp_id, {
        ...cookieOptions(),
        maxAge: 300,
      })
      return NextResponse.json(
        {
          challenge: true,
          method: ["Email", "SMS", "OTP App"].includes(
            result.verification.method,
          )
            ? result.verification.method
            : "OTP App",
        },
        { headers },
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
            result.message === "Password Reset"
              ? "Reset your password on your company ERPNext site before signing in."
              : "ERPNext did not issue a session. Please sign in again.",
        },
        { status: 401, headers },
      )
    // Never trust a Set-Cookie header alone: validate the issued native session.
    await new ERPNextClient(siteUrl(), sid).user()
    jar.delete(CHALLENGE_COOKIE)
    jar.set(SESSION_COOKIE, sid, {
      ...cookieOptions(),
      maxAge: 60 * 60 * 24 * 7,
    })
    return NextResponse.json({ ok: true }, { headers })
  } catch (error) {
    if (error instanceof ERPNextError && error.status === 401)
      return NextResponse.json(
        { error: "ERPNext did not verify this session. Please sign in again." },
        { status: 401, headers },
      )
    if (
      error instanceof SyntaxError ||
      (error instanceof ERPNextError && error.status === 413)
    )
      return NextResponse.json(
        { error: "Invalid sign-in request." },
        { status: error instanceof SyntaxError ? 400 : 413, headers },
      )
    return NextResponse.json(
      {
        error:
          "Sign-in could not be completed. Please check your connection and try again.",
      },
      { status: 502, headers },
    )
  }
}

export async function DELETE(request: Request) {
  if (!validOrigin(request))
    return NextResponse.json(
      { error: "This sign-out request is not allowed." },
      { status: 403, headers },
    )
  const jar = await cookies()
  const sid = jar.get(SESSION_COOKIE)?.value
  let remoteSessionRevoked = !sid || sid === "Guest"
  try {
    if (sid && sid !== "Guest" && /^[A-Za-z0-9_-]+$/.test(sid)) {
      // Frappe v14's native logout invalidates this SID only. Its GET endpoint
      // is called server-to-server, behind our same-origin DELETE boundary.
      const response = await fetch(`${siteUrl()}/api/method/logout`, {
        headers: { Cookie: `sid=${sid}`, Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      })
      remoteSessionRevoked = response.ok || response.status === 401
    }
  } catch {
    /* Always allow the browser to discard its local credentials. */
  }
  jar.delete(SESSION_COOKIE)
  jar.delete(CHALLENGE_COOKIE)
  return NextResponse.json({ ok: true, remoteSessionRevoked }, { headers })
}
