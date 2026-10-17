import { Dashboard } from "@/components/dashboard"
import { timezone } from "@/lib/erpnext-server"
import { businessDate } from "@/lib/model"
export const dynamic = "force-dynamic"
export default function Page() {
  return (
    <Dashboard
      initialDashboard="approvals"
      config={{ timezone, today: businessDate(new Date(), timezone) }}
    />
  )
}
