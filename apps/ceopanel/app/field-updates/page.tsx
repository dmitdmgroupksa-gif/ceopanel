import { PlatformPanel } from "@/components/platform-panel"
import { companyName, siteUrl } from "@/lib/erpnext-server"
export default function Page() {
  return (
    <PlatformPanel
      mode="field-updates"
      companyName={companyName}
      siteUrl={siteUrl()}
    />
  )
}
