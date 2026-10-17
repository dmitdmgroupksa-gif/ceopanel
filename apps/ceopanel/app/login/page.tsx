import { LoginPage } from "@/components/login-page"
import { companyName, siteUrl } from "@/lib/erpnext-server"
import { headers } from "next/headers"
import { localAuthDisabled } from "@/lib/auth-mode"

export const dynamic = "force-dynamic"
export default async function Page() {
  return (
    <LoginPage
      companyName={companyName}
      siteUrl={siteUrl()}
      previewEnabled={localAuthDisabled((await headers()).get("host") || "")}
    />
  )
}
