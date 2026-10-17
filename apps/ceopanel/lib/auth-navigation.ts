// Shared with the optimistic route guard. ERPNext remains the authority for
// identity and record permissions; a cookie's presence is never authorization.
export const SESSION_COOKIE = "ceopanel_erpnext_sid"
export const CHALLENGE_COOKIE = "ceopanel_erpnext_challenge"
export const portalPaths = [
  "/",
  "/workspace",
  "/agents",
  "/knowledge",
  "/field-updates",
  "/approvals",
  "/notifications",
  "/integrations",
] as const

export function isPortalPath(path: string) {
  return portalPaths.some((route) => route === path)
}

export function safeReturnPath(input: string | null | undefined) {
  if (
    !input ||
    input.length > 4096 ||
    !input.startsWith("/") ||
    /[\\\x00-\x20]/.test(input)
  )
    return "/"
  try {
    const url = new URL(input, "https://panel.invalid")
    if (
      url.origin !== "https://panel.invalid" ||
      !(isPortalPath(url.pathname) || url.pathname === "/mcp/authorize")
    )
      return "/"
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return "/"
  }
}

export function loginPath(next: string, expired = false) {
  const params = new URLSearchParams({ next: safeReturnPath(next) })
  if (expired) params.set("expired", "1")
  return `/login?${params}`
}
