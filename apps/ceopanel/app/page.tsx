import { cookies } from "next/headers"
import { Dashboard } from "@/components/dashboard"
import { demoSnapshot } from "@/lib/demo"
import {
  SESSION_COOKIE,
  companyName,
  loadSnapshot,
  siteUrl,
  timezone,
} from "@/lib/erpnext-server"
import { businessDate, type Snapshot } from "@/lib/model"

export const dynamic = "force-dynamic"
export default async function Page() {
  const config = {
    companyName,
    siteUrl: siteUrl(),
    timezone,
    today: businessDate(new Date(), timezone),
  }
  let initial: Snapshot | null = null
  let error: string | null = null
  if ((await cookies()).has(SESSION_COOKIE)) {
    try {
      initial = await loadSnapshot(90)
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Company data could not be loaded."
    }
  } else {
    initial = demoSnapshot(
      config.today,
      90,
      config.siteUrl,
      config.timezone,
      config.companyName
    )
  }
  return <Dashboard initial={initial} initialError={error} config={config} />
}
