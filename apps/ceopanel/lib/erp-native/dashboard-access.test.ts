import { describe, expect, it, vi } from "vitest"
import { accessibleDashboards } from "./dashboard-access"
import { ERPNextClient, ERPNextError } from "../erpnext-client"
import type { DashboardId } from "../dashboards"

const context = { user: "employee", company: "A", currency: "SAR", companies: [], siteUrl: "https://erp.example", roles: ["Desk User", "Sales User"] }
function fixture() {
  const meta: Record<string, any> = {
    Quotation: { name: "Quotation", module: "Selling", fields: [
      { fieldname: "company", fieldtype: "Link", options: "Company" },
      ...["party_name", "transaction_date", "valid_till", "base_net_total", "status"].map((fieldname) => ({ fieldname, fieldtype: "Data", permlevel: 0 })),
    ] },
    "Custom Request": { name: "Custom Request", module: "Operations", fields: [{ fieldname: "approval_status", fieldtype: "Data", permlevel: 0 }] },
  }
  const denied = new Set<string>()
  const erp = new ERPNextClient(context.siteUrl, "fixture")
  const canRead = vi.spyOn(erp, "canRead").mockImplementation(async (doctype) => !denied.has(doctype) && !!meta[doctype])
  const request = vi.spyOn(erp, "request").mockImplementation(async (path) => {
    const url = new URL(path, context.siteUrl)
    if (!url.pathname.endsWith("getdoctype")) throw Error("Unexpected non-metadata request")
    return { docs: [meta[url.searchParams.get("doctype")!]] }
  })
  const list = vi.spyOn(erp, "list").mockResolvedValue([])
  const page = vi.spyOn(erp, "page").mockRejectedValue(new Error("Business rows must not be read during dashboard discovery"))
  const load = (ids: DashboardId[] = ["quotation-team", "purchase", "accounts"]) => accessibleDashboards(erp, { ...context, dashboardIds: ids }, "Asia/Riyadh")
  return { erp, meta, denied, canRead, request, list, page, load }
}

describe("native dashboard visibility", () => {
  it("exposes only readable connected sources and never loads business rows", async () => {
    const f = fixture()
    expect(await f.load()).toEqual(["quotation-team"])
    expect(f.list).not.toHaveBeenCalled()
    expect(f.page).not.toHaveBeenCalled()
  })
  it("hides a dashboard when a required field is restricted", async () => {
    const f = fixture()
    f.meta.Quotation.fields.find((field: any) => field.fieldname === "base_net_total").permlevel = 1
    expect(await f.load()).toEqual([])
  })
  it("honours the employee's effective field permission level", async () => {
    const f = fixture()
    f.meta.Quotation.fields.find((field: any) => field.fieldname === "base_net_total").permlevel = 1
    f.meta.Quotation.permissions = [{ role: "Sales User", permlevel: 1, read: 1 }]
    expect(await f.load()).toEqual(["quotation-team"])
  })
  it("does not share cached visibility across users or role changes", async () => {
    const f = fixture()
    expect(await f.load()).toEqual(["quotation-team"])
    f.denied.add("Quotation")
    expect(await accessibleDashboards(f.erp, { ...context, user: "another-employee", dashboardIds: ["quotation-team"] }, "Asia/Riyadh")).toEqual([])
  })
  it("respects explicit dashboard allowlists before checking native sources", async () => {
    const f = fixture()
    expect(await f.load([])).toEqual([])
    expect(f.canRead).not.toHaveBeenCalled()
    expect(f.request).not.toHaveBeenCalled()
  })
  it("checks custom workflow DocType permissions without reading its records", async () => {
    const f = fixture()
    f.list.mockResolvedValue([{ name: "Approval", document_type: "Custom Request", workflow_state_field: "approval_status" }])
    expect(await f.load(["approvals"])).toEqual(["approvals"])
    expect(f.list).toHaveBeenCalledWith("Workflow", expect.objectContaining({ filters: [["is_active", "=", 1]] }))
    expect(f.page).not.toHaveBeenCalled()
    f.denied.add("Custom Request")
    expect(await f.load(["approvals"])).toEqual([])
  })
  it("propagates session expiry instead of presenting it as a permission denial", async () => {
    const f = fixture()
    f.canRead.mockRejectedValue(new ERPNextError("Session expired", 401))
    await expect(f.load()).rejects.toMatchObject({ status: 401 })
  })
})
