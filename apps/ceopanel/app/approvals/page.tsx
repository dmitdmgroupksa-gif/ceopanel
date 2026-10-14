import { PlatformPanel } from "@/components/platform-panel"
import { companyName, siteUrl } from "@/lib/erpnext-server"
export default function Page() {
  return (
    <PlatformPanel
      mode="approvals"
      companyName={companyName}
      siteUrl={siteUrl()}
    />
  )
}
