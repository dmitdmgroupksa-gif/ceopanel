import { cookies } from "next/headers"
import { Dashboard } from "@/components/dashboard"
import { loadContext, type DashboardContext } from "@/lib/dashboard-server"
import {
  SESSION_COOKIE,
  companyName,
  siteUrl,
  timezone,
} from "@/lib/erpnext-server"
import { businessDate } from "@/lib/model"

export const dynamic = "force-dynamic"
export default async function Page() {
  const config = {
    companyName,
    siteUrl: siteUrl(),
    timezone,
    today: businessDate(new Date(), timezone),
  }
  let initial: DashboardContext | null = null
  let error: string | null = null
  if ((await cookies()).has(SESSION_COOKIE)) {
    try {
      initial = await loadContext()
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "ERPNext connection could not be loaded."
    }
  }
  return <Dashboard initial={initial} initialError={error} config={config} />
}
