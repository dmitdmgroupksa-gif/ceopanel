import { MCPConsent } from "@/components/mcp-consent"
import { siteUrl } from "@/lib/erpnext-server"
export const dynamic = "force-dynamic"
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams,
    query = new URLSearchParams()
  for (const [key, value] of Object.entries(params))
    if (typeof value === "string") query.set(key, value)
  return <MCPConsent query={query.toString()} siteUrl={siteUrl()} />
}
