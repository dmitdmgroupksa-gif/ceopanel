import { describe, it, expect, vi } from "vitest"
import { operationalDashboard } from "./operations-dashboards"
import { emptyDashboard, findDashboard, type DashboardId } from "../dashboards"
import {
  ERPNextError,
  type ERPNextClient,
  type Filter,
} from "../erpnext-client"

const context = {
  user: "reader",
  roles: ["Employee"],
  company: "Company A",
  currency: "SAR",
  companies: [],
  siteUrl: "https://erp.example",
}
const definitions: Record<string, string[]> = {
  "DM Facilities Management": [
    "company",
    "facility_name",
    "location",
    "facility_contract_status",
    "rentdate_to",
    "lease_end",
    "cr_date_to",
    "com_lic_exp",
    "cd_date_to",
    "fire_expiry",
    "industrial_expiry",
    "construction_environmental_permit_expiry",
    "operational_environmental_permit_expiry",
    "national_adress_expiry",
    ...[1, 2, 3, 4].flatMap((n) => [
      `installment_${n}_dues_on`,
      `paid${n}_not`,
    ]),
  ],
  Tasks: ["status", "assigned_to", "team", "priority", "due_date"],
  "Factory Job Order": [
    "date",
    "start_date",
    "end_date",
    "branch",
    "jo_type",
    "jo_status",
  ],
  "IT Help Desk Request": [
    "subject",
    "status",
    "priority",
    "department",
    "opened_on",
    "resolved_on",
    "closed_on",
    "assigned_technician",
    "due_date",
  ],
  "Delivery Trip": [
    "company",
    "custom_delivery_date",
    "status",
    "delivery_status",
    "vehicle",
    "driver_name",
  ],
  "Custom Request": ["workflow_state"],
  "Other Request": ["workflow_state"],
}
function fixture(records: Record<string, Record<string, unknown>[]> = {}) {
  const denied = new Set<string>(),
    workflows: Record<string, any>[] = []
  const meta = Object.fromEntries(
    Object.entries(definitions).map(([name, fields]) => [
      name,
      {
        doctype: "DocType",
        name,
        module: "Operations",
        fields: fields.map((fieldname) => ({
          fieldname,
          fieldtype: fieldname === "company" ? "Link" : "Data",
          options: fieldname === "company" ? "Company" : undefined,
          permlevel:
            name === "IT Help Desk Request" &&
            ["assigned_technician", "due_date"].includes(fieldname)
              ? 1
              : 0,
        })),
        permissions: [
          { role: "Employee", read: 1, permlevel: 0 },
          { role: "Technician", read: 1, permlevel: 1 },
        ],
      },
    ]),
  )
  const page = vi.fn(async (doctype: string, query: any) => {
    let rows = (records[doctype] || []).map((r) => ({
      owner: "reader",
      creation: "2026-10-01 10:00:00",
      modified: "2026-10-17 08:00:00",
      docstatus: 0,
      ...r,
    })) as Record<string, unknown>[]
    for (const [field, op, value] of query.filters || []) {
      rows = rows.filter((r) =>
        op === "="
          ? r[field] === value
          : op === "!="
            ? r[field] != null && r[field] !== value
            : op === ">="
              ? String(r[field]) >= value
              : op === "<="
                ? String(r[field]) <= value
                : op === "in"
                  ? value.includes(r[field])
                  : true,
      )
    }
    return rows
      .slice(query.offset, query.offset + query.limit)
      .map((r) =>
        Object.fromEntries(
          query.fields.map((field: string) => [field, r[field] ?? null]),
        ),
      )
  })
  const request = vi.fn(async (raw: string) => {
    const url = new URL(raw, context.siteUrl)
    if (url.pathname.endsWith("getdoctype"))
      return { docs: [meta[url.searchParams.get("doctype")!]] }
    if (url.pathname.endsWith("frappe.client.get"))
      return {
        message: workflows.find((w) => w.name === url.searchParams.get("name")),
      }
    throw Error("Unexpected request")
  })
  const client = {
    page,
    request,
    canRead: vi.fn(async (name: string) => !denied.has(name)),
    list: vi.fn(async () =>
      workflows.map((w) => ({
        name: w.name,
        document_type: w.document_type,
        workflow_state_field: w.workflow_state_field,
      })),
    ),
  } as unknown as Pick<ERPNextClient, "request" | "page" | "canRead" | "list">
  const run = (id: DashboardId, roles = context.roles) =>
    operationalDashboard(
      client,
      id,
      { ...context, roles },
      emptyDashboard(findDashboard(id)!, "2026-10-17", 30, context.company)
        .period,
    )
  return { run, client, page, meta, denied, workflows }
}

describe("operational dashboards", () => {
  it("retains the selected company's currency metadata for non-SAR contexts", async () => {
    const f = fixture()
    const period = emptyDashboard(
      findDashboard("tasks")!,
      "2026-10-17",
      30,
      "Company A",
    ).period
    const data = await operationalDashboard(
      f.client,
      "tasks",
      { ...context, currency: "USD" },
      period,
    )
    expect(data.currency).toBe("USD")
    expect(data.scope).toBe("erp-account")
    expect(data.metrics.every((m) => m.format !== "currency")).toBe(true)
  })
  it("uses an inclusive upcoming window and distinguishes paid, unpaid and unknown rent flags", async () => {
    const f = fixture({
      "DM Facilities Management": [
        {
          name: "A",
          company: "Company A",
          facility_name: "Warehouse",
          facility_contract_status: "Active",
          rentdate_to: "2026-10-16",
          fire_expiry: "2026-11-15",
          cd_date_to: "2026-11-16",
          installment_1_dues_on: "2026-10-17",
          paid1_not: 0,
          installment_2_dues_on: "2026-10-16",
          paid2_not: 1,
          installment_3_dues_on: "2026-10-16",
          paid3_not: null,
        },
        { name: "B", company: "Company A", facility_contract_status: null },
        {
          name: "C",
          company: "Company A",
          facility_contract_status: "Closed",
          fire_expiry: "2026-10-01",
        },
        { name: "OTHER", company: "Company B", fire_expiry: "2026-10-01" },
      ],
    })
    const data = await f.run("facilities")
    expect(data.period).toEqual({
      from: "2026-10-17",
      to: "2026-11-15",
      days: 30,
    })
    expect(data.metrics.map((m) => m.value)).toEqual([2, 1, 1, 1])
    expect(data.table.rows).toHaveLength(4)
    expect(
      data.table.rows.some((r) => r.status === "Payment status not recorded"),
    ).toBe(true)
    expect(Object.values(data.table.links!)).toContain(
      "https://erp.example/app/dm-facilities-management/A",
    )
    expect(f.page.mock.calls[0][1].filters).toContainEqual([
      "company",
      "=",
      "Company A",
    ])
    expect(f.page.mock.calls[0][1].orderBy).toBe("name asc")
    expect(data.scope).toBe("company")
  })
  it("recognizes boolean paid flags without inventing missing payment statuses", async () => {
    const f = fixture({
      "DM Facilities Management": [
        {
          name: "A",
          company: "Company A",
          facility_contract_status: "Active",
          installment_1_dues_on: "2026-10-16",
          paid1_not: true,
          installment_2_dues_on: "2026-10-16",
          paid2_not: false,
        },
      ],
    })
    const data = await f.run("facilities")
    expect(data.metrics.map((m) => m.value)).toEqual([1, 0, 0, 1])
    expect(data.table.rows).toHaveLength(1)
    expect(data.table.rows[0].status).not.toBe("Payment status not recorded")
  })
  it("does not accept another company's rows even when ERP ignores its filter", async () => {
    const f = fixture()
    f.page.mockResolvedValue([{ name: "A", company: "Company B" }] as any)
    await expect(f.run("facilities")).rejects.toMatchObject({ status: 403 })
  })
  it("keeps unknown task statuses visible and excludes closed tasks from overdue counts", async () => {
    const f = fixture({
      Tasks: [
        { name: "PENDING", status: "Pending", due_date: "2026-10-16" },
        { name: "HOLD", status: "On hold", assigned_to: "EMP-1" },
        { name: "DONE", status: "Completed", due_date: "2026-10-01" },
        { name: "UNKNOWN", status: null },
        { name: "CANCELLED", status: "Cancelled" },
      ],
    })
    const data = await f.run("tasks")
    expect(data.scope).toBe("erp-account")
    expect(data.metrics.map((m) => m.value)).toEqual([2, 1, 1, 1])
    expect(data.table.rows).toHaveLength(4)
    expect(data.chart.points.some((p) => p.label === "Not recorded")).toBe(true)
    expect(f.page.mock.calls[0][1].filters).not.toContainEqual([
      "status",
      "!=",
      "Cancelled",
    ])
    expect(
      f.page.mock.calls[0][1].filters.some((f: Filter) => f[0] === "company"),
    ).toBe(false)
  })
  it("does not request or infer restricted IT due dates and assignments", async () => {
    const f = fixture({
      "IT Help Desk Request": [
        {
          name: "HIGH",
          status: "In Progress",
          priority: "High",
          assigned_technician: "PRIVATE",
          due_date: "2026-10-01",
        },
        { name: "REVIEW", status: "In Review", priority: "Low" },
        { name: "DONE", status: "Resolved", priority: "Critical" },
      ],
    })
    const data = await f.run("it-service")
    expect(data.metrics.map((m) => m.value)).toEqual([2, 1, null, null])
    expect(data.metrics[2].note).toMatch(/restricted/)
    expect(f.page.mock.calls[0][1].fields).not.toContain("assigned_technician")
    expect(f.page.mock.calls[0][1].fields).not.toContain("due_date")
    expect(data.table.columns.some((c) => c.key === "due_date")).toBe(false)
    const permitted = await f.run("it-service", ["Employee", "Technician"])
    expect(permitted.metrics.map((m) => m.value)).toEqual([2, 1, 1, 1])
  })
  it("fails on malformed dates and missing required fields instead of publishing zeros", async () => {
    const f = fixture({
      Tasks: [{ name: "A", status: "Pending", due_date: "2026-02-30" }],
    })
    await expect(f.run("tasks")).rejects.toMatchObject({ status: 409 })
    f.page.mockResolvedValue([{ name: "A", modified: "2026-10-17" }] as any)
    await expect(f.run("tasks")).rejects.toMatchObject({ status: 403 })
  })
  it("uses submitted, company-scoped trips and the actual trip status", async () => {
    const f = fixture({
      "Delivery Trip": [
        {
          name: "LATE",
          company: "Company A",
          docstatus: 1,
          custom_delivery_date: "2026-10-01",
          status: "Scheduled",
        },
        {
          name: "DONE",
          company: "Company A",
          docstatus: 1,
          custom_delivery_date: "2026-10-01",
          status: "Completed",
        },
        {
          name: "TRANSIT",
          company: "Company A",
          docstatus: 1,
          custom_delivery_date: "2026-10-17",
          status: "In Transit",
        },
        {
          name: "DRAFT",
          company: "Company A",
          docstatus: 0,
          custom_delivery_date: "2026-10-01",
          status: "Draft",
        },
        {
          name: "UNKNOWN",
          company: "Company A",
          docstatus: 1,
          custom_delivery_date: "2026-10-01",
          status: null,
        },
      ],
    })
    const data = await f.run("dispatch-logistics")
    expect(data.metrics.map((m) => m.value)).toEqual([4, 1, 1, 1])
    expect(data.table.rows).toHaveLength(4)
  })
  it("uses factory status and end dates without assuming Company or cost currency", async () => {
    const f = fixture({
      "Factory Job Order": [
        { name: "A", jo_status: "Assigned", end_date: "2026-10-16" },
        { name: "B", jo_status: "Open", end_date: null },
        { name: "C", jo_status: "Completed", end_date: "2026-10-01" },
      ],
    })
    const data = await f.run("factory")
    expect(data.scope).toBe("erp-account")
    expect(data.metrics.map((m) => m.value)).toEqual([2, 1, 1, 1])
    expect(data.metrics.every((m) => m.format === "number")).toBe(true)
  })
  it("shows candidate roles and conditional steps without claiming authority to approve", async () => {
    const f = fixture({
      "Custom Request": [
        { name: "SAME", workflow_state: "Review", docstatus: 0 },
        { name: "FINAL", workflow_state: "Approved", docstatus: 1 },
        {
          name: "OLD",
          workflow_state: "Review",
          docstatus: 0,
          creation: "2025-01-01 10:00:00",
        },
      ],
      "Other Request": [
        { name: "SAME", workflow_state: "Review", docstatus: 1 },
      ],
    })
    for (const [name, doctype] of [
      ["First", "Custom Request"],
      ["Second", "Other Request"],
    ])
      f.workflows.push({
        name,
        doctype: "Workflow",
        document_type: doctype,
        workflow_state_field: "workflow_state",
        states: [{ state: "Review" }, { state: "Approved" }],
        transitions: [
          {
            state: "Review",
            next_state: "Approved",
            allowed: "Manager",
            condition: "never evaluate this condition",
          },
        ],
      })
    const data = await f.run("approvals")
    expect(data.metrics.map((m) => m.value)).toEqual([2, 1, 1, 2])
    expect(new Set(data.table.rows.map((r) => r.id)).size).toBe(2)
    expect(
      data.table.rows.every(
        (r) => r.roles === "Manager" && r.conditional === "Yes",
      ),
    ).toBe(true)
    expect(data.note).toContain("not named approvers")
    expect(data.note).toContain("not a list of actions available to you")
    expect(f.client.request).not.toHaveBeenCalledWith(
      expect.stringContaining("apply_workflow"),
    )
  })
  it("skips denied workflow record types and rejects duplicate active workflows", async () => {
    const f = fixture()
    f.workflows.push({
      name: "A",
      doctype: "Workflow",
      document_type: "Custom Request",
      workflow_state_field: "workflow_state",
      states: [],
      transitions: [],
    })
    f.denied.add("Custom Request")
    const data = await f.run("approvals")
    expect(data.metrics.map((m) => m.value)).toEqual([0, 0, 0, 0])
    expect(f.client.request).not.toHaveBeenCalled()
    f.workflows.push({ ...f.workflows[0], name: "B" })
    await expect(f.run("approvals")).rejects.toMatchObject({ status: 409 })
  })
  it("rejects duplicate pages, permission errors and datasets over the cap", async () => {
    const f = fixture()
    f.page.mockImplementation(async (_dt, query) =>
      Array.from({ length: 2 }, () =>
        Object.fromEntries(
          query.fields.map((field: string) => [
            field,
            field === "name" ? "A" : null,
          ]),
        ),
      ),
    )
    await expect(f.run("tasks")).rejects.toThrow("duplicate")
    f.page.mockRejectedValue(new ERPNextError("Denied", 403))
    await expect(f.run("tasks")).rejects.toMatchObject({ status: 403 })
    f.page.mockImplementation(async (_dt, query) =>
      Array.from({ length: 101 }, (_, i) =>
        Object.fromEntries(
          query.fields.map((field: string) => [
            field,
            field === "name"
              ? `T-${query.offset + i}`
              : field === "modified"
                ? "2026-10-17"
                : null,
          ]),
        ),
      ),
    )
    await expect(f.run("tasks")).rejects.toThrow("10,000")
  })
})
