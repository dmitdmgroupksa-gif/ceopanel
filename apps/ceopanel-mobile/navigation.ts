export function portalOrigin(configured: string) {
  try {
    const url = new URL(configured)
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : ""
  } catch {
    return ""
  }
}
export function navigationPolicy(
  origin: string,
  target: string,
  topFrame: boolean,
): "allow" | "external" | "block" {
  if (target === "about:blank") return "allow"
  try {
    const url = new URL(target)
    if (url.username || url.password) return "block"
    if (url.protocol === "https:" && url.origin === origin) return "allow"
    // Subframes must never launch an external browser or receive portal cookies.
    if (url.protocol === "https:" && topFrame) return "external"
  } catch {}
  return "block"
}
