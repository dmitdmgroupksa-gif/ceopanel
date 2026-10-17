import type { DashboardContext } from "../dashboard-server"
import {
  emptyDashboard,
  findDashboard,
  type DashboardData,
  type DashboardId,
  type MetricValue,
} from "../dashboards"
import {
  ERPNextError,
  type ERPNextClient,
  type Filter,
} from "../erpnext-client"
import type { Period } from "../model"
import { erpReader } from "./reader"
import { erpDate as date } from "./date"

export const operationalDashboardIds = [
  "approvals",
  "dispatch-logistics",
  "tasks",
  "facilities",
  "it-service",
  "factory",
] as const satisfies readonly DashboardId[]
type Client = Pick<ERPNextClient, "request" | "page" | "list" | "canRead">
type Row = Record<string, unknown>
const limit = 10000
const cell = (row: Row, field: string) =>
  typeof row[field] === "string" || typeof row[field] === "number"
    ? String(row[field])
    : ""
const metric = (
  label: string,
  value: number | null,
  note?: string,
): MetricValue => ({
  label,
  value,
  format: "number",
  ...(note ? { note } : {}),
})
function distribution(title: string, values: string[]): DashboardData["chart"] {
  const counts = new Map<string, number>()
  for (const label of values)
    counts.set(
      label || "Not recorded",
      (counts.get(label || "Not recorded") || 0) + 1,
    )
  const sorted = [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  const points = sorted.slice(0, 7).map(([label, count]) => ({ label, count }))
  if (sorted.length > 7)
    points.push({
      label: "Other",
      count: sorted.slice(7).reduce((sum, [, n]) => sum + n, 0),
    })
  return {
    type: "bar",
    title,
    series: [{ key: "count", label: "Records" }],
    points,
  }
}
const expiryFields = [
  ["rentdate_to", "Rent agreement"],
  ["lease_end", "Lease"],
  ["cr_date_to", "Commercial registration"],
  ["com_lic_exp", "Commercial license"],
  ["cd_date_to", "Civil defense"],
  ["fire_expiry", "Fire contract"],
  ["industrial_expiry", "Industrial license"],
  [
    "construction_environmental_permit_expiry",
    "Construction environmental permit",
  ],
  [
    "operational_environmental_permit_expiry",
    "Operational environmental permit",
  ],
  ["national_adress_expiry", "National address"],
] as const

export async function operationalDashboard(
  erp: Client,
  id: DashboardId,
  context: DashboardContext & { roles: string[] },
  period: Period,
): Promise<DashboardData> {
  if (!operationalDashboardIds.some((value) => value === id))
    throw new ERPNextError("Dashboard not connected.", 409)
  const definition = findDashboard(id)!
  const data = emptyDashboard(
    definition,
    definition.window === "upcoming" ? period.from : period.to,
    period.days,
    context.company,
  )
  data.period = period
  data.currency = context.currency
  data.status = "ready"
  const permissions = new Map<string, Promise<boolean>>()
  function canRead(doctype: string) {
    if (!permissions.has(doctype))
      permissions.set(doctype, erp.canRead(doctype))
    return permissions.get(doctype)!
  }
  const reader = erpReader(
    {
      request: erp.request.bind(erp),
      page: erp.page.bind(erp),
      list: erp.list.bind(erp),
      canRead,
    },
    context,
  )
  const today = definition.window === "upcoming" ? period.from : period.to
  async function rows(
    doctype: string,
    fields: string[],
    filters: Filter[] = [],
    company = false,
  ): Promise<Row[]> {
    const output: Row[] = [],
      names = new Set<string>()
    const query = [
      ...filters,
      ...(company ? [["company", "=", context.company] as Filter] : []),
    ]
    for (let offset = 0; offset < limit; offset += 100) {
      const page = await reader.search(doctype, {
        fields: company ? [...new Set([...fields, "company"])] : fields,
        filters: query,
        offset,
        limit: 100,
        orderBy: "name asc",
      })
      for (const row of page.records) {
        if (typeof row.name !== "string" || !row.name || names.has(row.name))
          throw new ERPNextError(
            "ERP returned missing or duplicate record names. Refresh this view.",
            409,
          )
        if (company && row.company !== context.company)
          throw new ERPNextError(
            "ERP returned records for a different company.",
            403,
          )
        for (const field of fields)
          if (!Object.hasOwn(row, field))
            throw new ERPNextError(
              "A required ERP field is missing or restricted. This view cannot be calculated.",
              403,
            )
        names.add(row.name)
        output.push(row)
      }
      if (!page.hasMore) return output
    }
    throw new ERPNextError(
      `${doctype}: more than 10,000 records match. This view cannot publish partial totals.`,
      409,
    )
  }
  function link(doctype: string, name: string) {
    const route = encodeURIComponent(doctype.toLowerCase().replaceAll(" ", "-"))
    return new URL(`/app/${route}/${encodeURIComponent(name)}`, context.siteUrl)
      .href
  }
  function records(
    doctype: string,
    source: Row[],
    columns: [string, string][],
    transform?: (row: Row) => Record<string, string | number | null>,
  ) {
    data.table = {
      columns: columns.map(([key, label]) => ({ key, label })),
      rows: source.map((row) => ({
        id: String(row.name),
        ...Object.fromEntries(
          columns.map(([key]) => [key, cell(row, key) || null]),
        ),
        ...transform?.(row),
      })),
      links: Object.fromEntries(
        source.map((row) => [
          String(row.name),
          link(doctype, String(row.name)),
        ]),
      ),
    }
  }
  if (id === "dispatch-logistics") {
    const trips = await rows(
      "Delivery Trip",
      [
        "company",
        "custom_delivery_date",
        "status",
        "delivery_status",
        "vehicle",
        "driver_name",
        "docstatus",
      ],
      [
        ["docstatus", "=", 1],
        ["custom_delivery_date", ">=", period.from],
        ["custom_delivery_date", "<=", period.to],
      ],
      true,
    )
    for (const row of trips) {
      const planned = date(row.custom_delivery_date)
      if (
        !planned ||
        planned < period.from ||
        planned > period.to ||
        row.docstatus !== 1
      )
        throw new ERPNextError(
          "ERP returned a trip outside the requested period or submission state.",
          409,
        )
    }
    const pending = trips.filter((r) =>
      ["Scheduled", "In Transit"].includes(cell(r, "status")),
    )
    data.metrics = [
      metric("Delivery trips", trips.length),
      metric(
        "Completed trips",
        trips.filter((r) => r.status === "Completed").length,
      ),
      metric(
        "In transit",
        trips.filter((r) => r.status === "In Transit").length,
      ),
      metric(
        "Past scheduled date",
        pending.filter((r) => date(r.custom_delivery_date)! < today).length,
      ),
    ]
    data.chart = distribution(
      "Trips by status",
      trips.map((r) => cell(r, "status")),
    )
    records("Delivery Trip", trips, [
      ["name", "Trip"],
      ["custom_delivery_date", "Scheduled delivery"],
      ["driver_name", "Driver"],
      ["vehicle", "Vehicle"],
      ["status", "Trip status"],
      ["delivery_status", "Delivery status"],
    ])
    data.note =
      "Submitted delivery trips scheduled within the selected period, filtered by Company. Past scheduled date uses the recorded trip status; it is not a customer delivery confirmation."
  } else if (id === "tasks") {
    const taskRecords = await rows(
      "Tasks",
      ["status", "assigned_to", "team", "priority", "due_date", "docstatus"],
      [["docstatus", "!=", 2]],
    )
    // SQL `status != 'Cancelled'` also excludes NULL. Preserve unknown statuses.
    const tasks = taskRecords.filter((row) => row.status !== "Cancelled")
    tasks.forEach((row) => date(row.due_date))
    const open = tasks.filter((row) =>
      ["In Progress", "Under Review", "On hold", "Pending"].includes(
        cell(row, "status"),
      ),
    )
    data.metrics = [
      metric("Open tasks", open.length),
      metric(
        "Overdue tasks",
        open.filter((r) => date(r.due_date) && date(r.due_date)! < today)
          .length,
      ),
      metric(
        "Unassigned tasks",
        open.filter((r) => !cell(r, "assigned_to")).length,
      ),
      metric("Missing due dates", open.filter((r) => !date(r.due_date)).length),
    ]
    data.chart = distribution(
      "Tasks by status",
      tasks.map((r) => cell(r, "status")),
    )
    records("Tasks", tasks, [
      ["name", "Task"],
      ["assigned_to", "Assigned to"],
      ["team", "Team"],
      ["priority", "Priority"],
      ["due_date", "Due date"],
      ["status", "Status"],
    ])
    data.note =
      "Current custom Tasks records visible to your ERP account, across companies. Open counts use Pending, In Progress, Under Review and On hold. Tasks with an unrecorded status remain in the register."
  } else if (id === "it-service") {
    const description = await reader.describe("IT Help Desk Request")
    const allowed = new Set(description.fields.map((f) => f.fieldname))
    const optional = ["assigned_technician", "due_date"].filter((field) =>
      allowed.has(field),
    )
    const tickets = await rows(
      "IT Help Desk Request",
      [
        "subject",
        "status",
        "priority",
        "department",
        "opened_on",
        "resolved_on",
        "closed_on",
        "docstatus",
        ...optional,
      ],
      [["docstatus", "!=", 2]],
    )
    const open = tickets.filter((r) =>
      ["In Progress", "In Review", "Not Resolved"].includes(cell(r, "status")),
    )
    if (allowed.has("due_date")) tickets.forEach((r) => date(r.due_date))
    data.metrics = [
      metric("Open tickets", open.length),
      metric(
        "High priority tickets",
        open.filter((r) => ["High", "Critical"].includes(cell(r, "priority")))
          .length,
      ),
      metric(
        "Unassigned tickets",
        allowed.has("assigned_technician")
          ? open.filter((r) => !cell(r, "assigned_technician")).length
          : null,
        allowed.has("assigned_technician")
          ? undefined
          : "Assignment access is restricted",
      ),
      metric(
        "Due before today",
        allowed.has("due_date")
          ? open.filter((r) => date(r.due_date) && date(r.due_date)! < today)
              .length
          : null,
        allowed.has("due_date") ? undefined : "Due date access is restricted",
      ),
    ]
    data.chart = distribution(
      "Tickets by status",
      tickets.map((r) => cell(r, "status")),
    )
    records("IT Help Desk Request", tickets, [
      ["name", "Ticket"],
      ["subject", "Subject"],
      ["priority", "Priority"],
      ["department", "Department"],
      ["status", "Status"],
      ...optional.map(
        (field) =>
          [field, field === "due_date" ? "Due date" : "Technician"] as [
            string,
            string,
          ],
      ),
    ])
    data.note =
      "Current IT requests visible to your ERP account, across companies. Open counts use In Progress, In Review and Not Resolved. Due dates and technician assignments follow your ERP field permissions; past due is not an SLA calculation."
  } else if (id === "factory") {
    const jobs = await rows(
      "Factory Job Order",
      [
        "date",
        "start_date",
        "end_date",
        "branch",
        "jo_type",
        "jo_status",
        "docstatus",
      ],
      [["docstatus", "!=", 2]],
    )
    jobs.forEach((r) => {
      date(r.start_date)
      date(r.end_date)
    })
    const open = jobs.filter((r) =>
      ["Open", "Inprogress", "Assigned"].includes(cell(r, "jo_status")),
    )
    data.metrics = [
      metric("Open job orders", open.length),
      metric(
        "Past end date",
        open.filter((r) => date(r.end_date) && date(r.end_date)! < today)
          .length,
      ),
      metric(
        "Completed job orders",
        jobs.filter((r) => r.jo_status === "Completed").length,
      ),
      metric("Missing end dates", open.filter((r) => !date(r.end_date)).length),
    ]
    data.chart = distribution(
      "Job orders by status",
      jobs.map((r) => cell(r, "jo_status")),
    )
    records("Factory Job Order", jobs, [
      ["name", "Job order"],
      ["branch", "Branch"],
      ["jo_type", "Type"],
      ["start_date", "Start date"],
      ["end_date", "End date"],
      ["jo_status", "Status"],
    ])
    data.note =
      "Current factory job order register visible to your ERP account, across companies. Past end date includes open jobs with a recorded end date before today. Branches have not been mapped to Company ownership."
  } else if (id === "facilities") {
    await facilities()
  } else if (id === "approvals") {
    await approvals()
  }
  data.updatedAt = new Date().toISOString()
  return data

  async function facilities() {
    const installmentFields = [1, 2, 3, 4].flatMap((n) => [
      `installment_${n}_dues_on`,
      `paid${n}_not`,
    ])
    const facilities = await rows(
      "DM Facilities Management",
      [
        "company",
        "facility_name",
        "location",
        "facility_contract_status",
        ...expiryFields.map(([field]) => field),
        ...installmentFields,
      ],
      [["docstatus", "!=", 2]],
      true,
    )
    type Deadline = {
      id: string
      facility: string
      location: string
      deadline: string
      due: string
      status: string
      kind: "expiry" | "installment"
      source: string
    }
    const events: Deadline[] = []
    const selected = facilities.filter(
      (r) => r.facility_contract_status !== "Closed",
    )
    for (const r of selected) {
      for (const [field, label] of expiryFields) {
        const due = date(r[field])
        if (due)
          events.push({
            id: `${r.name}:${field}`,
            facility: cell(r, "facility_name") || String(r.name),
            location: cell(r, "location"),
            deadline: label,
            due,
            status: due < today ? "Expired" : "Upcoming",
            kind: "expiry",
            source: String(r.name),
          })
      }
      for (const n of [1, 2, 3, 4]) {
        const due = date(r[`installment_${n}_dues_on`]),
          paid = r[`paid${n}_not`]
        if (due && paid !== 1 && paid !== "1" && paid !== true)
          events.push({
            id: `${r.name}:installment${n}`,
            facility: cell(r, "facility_name") || String(r.name),
            location: cell(r, "location"),
            deadline: `Rent installment ${n}`,
            due,
            status:
              paid === 0 || paid === "0" || paid === false
                ? due < today
                  ? "Unpaid / past due"
                  : "Unpaid / upcoming"
                : "Payment status not recorded",
            kind: "installment",
            source: String(r.name),
          })
      }
    }
    const expired = events.filter((e) => e.kind === "expiry" && e.due < today),
      upcoming = events.filter(
        (e) => e.kind === "expiry" && e.due >= today && e.due <= period.to,
      )
    const unpaid = events.filter(
      (e) =>
        e.kind === "installment" &&
        e.status.startsWith("Unpaid") &&
        e.due <= period.to,
    )
    data.metrics = [
      metric("Facilities", selected.length),
      metric("Expired deadlines", expired.length),
      metric("Renewals in window", upcoming.length),
      metric("Unpaid installments due", unpaid.length),
    ]
    const visible = events
      .filter((e) => e.due <= period.to)
      .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))
    data.chart = distribution(
      "Recorded deadlines",
      visible.map((e) => e.status),
    )
    data.table = {
      columns: [
        { key: "facility", label: "Facility" },
        { key: "location", label: "Location" },
        { key: "deadline", label: "Deadline" },
        { key: "due", label: "Due date" },
        { key: "status", label: "Status" },
      ],
      rows: visible.map((e) => ({
        id: e.id,
        facility: e.facility,
        location: e.location,
        deadline: e.deadline,
        due: e.due,
        status: e.status,
      })),
      links: Object.fromEntries(
        visible.map((e) => [e.id, link("DM Facilities Management", e.source)]),
      ),
    }
    data.note =
      "Company facilities excluding Closed contracts. Recorded agreement, registration, license and permit dates include expired dates and the selected upcoming window. Rent paid flags are form entries, not reconciled accounting balances. Missing dates do not establish compliance."
  }

  async function approvals() {
    const workflows = await erp.list<{
      name: string
      document_type: string
      workflow_state_field: string
    }>("Workflow", {
      fields: ["name", "document_type", "workflow_state_field"],
      filters: [["is_active", "=", 1]],
      orderBy: "name asc",
    })
    const types = new Set<string>()
    for (const w of workflows) {
      if (!w.document_type || types.has(w.document_type))
        throw new ERPNextError(
          "Multiple or invalid active workflows were returned. Review the ERP configuration.",
          409,
        )
      types.add(w.document_type)
    }
    const collected: (Row & {
      source: string
      record: string
      state: string
      roles: string
      conditional: string
    })[] = []
    let readableTypes = 0
    async function inspectWorkflow(w: (typeof workflows)[number]) {
      if (!(await canRead(w.document_type))) return
      const response = await erp.request(
        `/api/method/frappe.client.get?${new URLSearchParams({ doctype: "Workflow", name: w.name })}`,
      )
      const workflow = response.message as Record<string, any>
      if (
        !workflow ||
        workflow.name !== w.name ||
        workflow.doctype !== "Workflow" ||
        workflow.document_type !== w.document_type ||
        !Array.isArray(workflow.transitions)
      )
        throw new ERPNextError(
          "ERP returned an invalid workflow definition.",
          409,
        )
      const field = workflow.workflow_state_field
      if (
        typeof field !== "string" ||
        !field ||
        !Array.isArray(workflow.states)
      )
        throw new ERPNextError(
          "ERP returned an invalid workflow state field.",
          409,
        )
      const outgoing = [
        ...new Set<string>(
          workflow.transitions
            .map((t: Row) => cell(t, "state"))
            .filter(Boolean),
        ),
      ]
      if (outgoing.length > 100)
        throw new ERPNextError(
          "This workflow has too many states for a complete dashboard.",
          409,
        )
      readableTypes++
      if (!outgoing.length) return
      const requests = await rows(
        w.document_type,
        [field, "docstatus", "creation", "owner"],
        [
          ["docstatus", "!=", 2],
          [field, "in", outgoing],
          ["creation", ">=", `${period.from} 00:00:00`],
          ["creation", "<=", `${period.to} 23:59:59.999999`],
        ],
      )
      for (const r of requests) {
        const state = cell(r, field)
        const created = date(r.creation)
        if (
          !created ||
          created < period.from ||
          created > period.to ||
          ![0, 1].includes(r.docstatus as number)
        )
          throw new ERPNextError(
            "ERP returned a request outside the selected period or submission state.",
            409,
          )
        if (!outgoing.includes(state))
          throw new ERPNextError(
            "ERP returned a request outside the workflow queue.",
            409,
          )
        const transitions = workflow.transitions.filter(
          (t: Row) => t.state === state,
        )
        collected.push({
          ...r,
          source: w.document_type,
          record: String(r.name),
          state,
          roles: [
            ...new Set(
              transitions.map((t: Row) => cell(t, "allowed")).filter(Boolean),
            ),
          ].join(", "),
          conditional: transitions.some((t: Row) => t.condition) ? "Yes" : "No",
        })
      }
      if (collected.length > limit)
        throw new ERPNextError(
          "More than 10,000 workflow requests match. Partial totals cannot be published.",
          409,
        )
    }
    let cursor = 0,
      failure: unknown
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (!failure) {
          const workflow = workflows[cursor++]
          if (!workflow) return
          try {
            await inspectWorkflow(workflow)
          } catch (cause) {
            failure = cause
          }
        }
      }),
    )
    if (failure) throw failure
    data.metrics = [
      metric("Requests with next steps", collected.length),
      metric(
        "Draft documents",
        collected.filter((r) => r.docstatus === 0).length,
      ),
      metric(
        "Submitted documents",
        collected.filter((r) => r.docstatus === 1).length,
      ),
      metric("Workflow types", readableTypes),
    ]
    data.chart = distribution(
      "Requests by type",
      collected.map((r) => r.source),
    )
    collected.sort(
      (a, b) =>
        cell(a, "modified").localeCompare(cell(b, "modified")) ||
        a.source.localeCompare(b.source) ||
        a.record.localeCompare(b.record),
    )
    data.table = {
      columns: [
        { key: "record", label: "Request" },
        { key: "source", label: "Type" },
        { key: "state", label: "Workflow state" },
        { key: "roles", label: "Candidate roles" },
        { key: "conditional", label: "Conditional steps" },
        { key: "creation", label: "Created" },
        { key: "modified", label: "Last modified" },
      ],
      rows: collected.map((r) => ({
        id: JSON.stringify([r.source, r.record]),
        record: r.record,
        source: r.source,
        state: r.state,
        roles: r.roles,
        conditional: r.conditional,
        creation: cell(r, "creation"),
        modified: cell(r, "modified"),
      })),
      links: Object.fromEntries(
        collected.map((r) => [
          JSON.stringify([r.source, r.record]),
          link(r.source, r.record),
        ]),
      ),
    }
    data.note =
      "Requests created within the selected period, visible to your ERP account across companies, whose current state has outgoing workflow steps. Older requests are outside these totals. Candidate roles are not named approvers; conditions and self-approval rules need a document-level check. Steps can include edits or rejection. This is not a list of actions available to you."
  }
}
