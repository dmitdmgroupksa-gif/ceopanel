import { Dashboard } from "@/components/dashboard"
import { timezone } from "@/lib/erpnext-server"
import { businessDate } from "@/lib/model"

export const dynamic = "force-dynamic"
export default async function Page() {
  const config = {
    timezone,
    today: businessDate(new Date(), timezone),
  }
  return <Dashboard config={config} />
}
