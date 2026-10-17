import { describe, expect, it, vi } from "vitest"
import { ERPNextClient } from "../erpnext-client"
import { ERPNextError } from "../erpnext-client"
import {
  erpReader,
  reportFilters,
  reportScriptFilters,
  type MetaField,
} from "./reader"
import { safeBusinessType } from "./read-policy"
import type { UserContext } from "../platform/policy"

const context: UserContext = {
  user: "reader@example.com",
  company: "Company A",
  currency: "SAR",
  companies: [{ name: "Company A", default_currency: "SAR" }],
  siteUrl: "https://erp.example",
  roles: ["System Manager"],
}
function fixture() {
  let denied = false
  const reportMeta = {
    name: "Test",
    report_type: "Script Report",
    ref_doctype: "Custom Request",
    module: "Operations",
    disabled: 0,
  }
  const reportDefinition = {
    name: "Test",
    doctype: "Report",
    json: JSON.stringify({
      fields: [
        ["subject", "Custom Request"],
        ["qty", "Request Line"],
      ],
      filters: [["Custom Request", "company", "=", "Company A"]],
    }),
  }
  const builderRows = [
    { c0: "REQ-1", c1: "Replacement", c2: 2, _aggregate_column: 2 },
  ]
  const meta = {
    name: "Custom Request",
    module: "Operations",
    fields: [
      { fieldname: "subject", fieldtype: "Data", label: "Subject" },
      { fieldname: "company", fieldtype: "Link", options: "Company" },
      { fieldname: "workflow_state", fieldtype: "Data" },
      { fieldname: "api_secret", fieldtype: "Data" },
      { fieldname: "password", fieldtype: "Password" },
      { fieldname: "restricted", fieldtype: "Data", permlevel: 1 },
      { fieldname: "lines", fieldtype: "Table", options: "Request Line" },
    ] as MetaField[],
    permissions: [{ role: "HR Manager", read: 1, permlevel: 1 }],
  }
  const child = {
    name: "Request Line",
    istable: 1,
    fields: [
      { fieldname: "qty", fieldtype: "Float" },
      { fieldname: "access_token", fieldtype: "Data" },
    ],
  }
  const doc = {
    doctype: meta.name,
    name: "REQ-1",
    owner: context.user,
    modified: "2026-10-15 10:00:00",
    docstatus: 0,
    subject: "Replacement",
    company: "Company B",
    workflow_state: "Pending",
    api_secret: "NEVER RETURN",
    password: "NEVER RETURN",
    restricted: "not granted",
    lines: [{ name: "LINE-1", qty: 2, access_token: "NEVER RETURN" }],
  }
  const workflow = {
    doctype: "Workflow",
    name: "Request Approval",
    workflow_state_field: "workflow_state",
    transitions: [
      {
        state: "Pending",
        action: "Approve",
        next_state: "Manager Approved",
        allowed: "Manager",
        condition: "doc.amount > 0",
      },
      {
        state: "Pending",
        action: "Reject",
        next_state: "Rejected",
        allowed: "Manager",
      },
      {
        state: "Manager Approved",
        action: "Approve",
        next_state: "Approved",
        allowed: "CEO",
      },
      {
        state: "Rejected",
        action: "Resubmit",
        next_state: "Pending",
        allowed: "Employee",
      },
    ],
  }
  const fetcher = vi.fn<typeof fetch>(async (raw, init) => {
    expect(init?.method).toBeUndefined()
    const url = new URL(String(raw)),
      p = url.searchParams
    if (url.pathname.endsWith("has_permission"))
      return Response.json({ message: { has_permission: !denied } })
    if (url.pathname.endsWith("getdoctype"))
      return Response.json({ docs: [meta, child] })
    if (url.pathname.endsWith("frappe.client.get"))
      return Response.json({
        message:
          p.get("doctype") === "Workflow"
            ? workflow
            : p.get("doctype") === "Report"
              ? reportDefinition
              : doc,
      })
    if (url.pathname.endsWith("get_transitions"))
      return Response.json({
        message: [
          {
            action: "Approve",
            next_state: "Manager Approved",
            allowed: "System Manager",
            allow_self_approval: 0,
          },
        ],
      })
    if (url.pathname.endsWith("get_script"))
      return Response.json({
        message: {
          script:
            "frappe.query_reports['Test']={filters:[{fieldname:'from_date',fieldtype:'Date',label:__('From'),reqd:1},{fieldname:'company',fieldtype:'Link',options:'Company'}]};",
          filters: [],
        },
      })
    if (url.pathname.endsWith("query_report.run"))
      return Response.json({
        message: {
          columns: [
            { fieldname: "amount", label: "Amount", fieldtype: "Currency" },
            { fieldname: "api_key", label: "Key" },
          ],
          result: [{ amount: 10, api_key: "secret" }, [10, "secret"]],
          add_total_row: true,
        },
      })
    if (url.pathname.endsWith("reportview.get_list"))
      return Response.json({ message: builderRows })
    if (url.pathname.endsWith("/Report"))
      return Response.json({ data: [reportMeta] })
    if (url.pathname.endsWith("/Workflow"))
      return Response.json({
        data: [{ name: workflow.name, workflow_state_field: "workflow_state" }],
      })
    return Response.json({ data: [doc] })
  })
  const erp = new ERPNextClient(context.siteUrl, "test-sid", fetcher)
  return {
    erp,
    reader: erpReader(erp, context),
    fetcher,
    meta,
    doc,
    workflow,
    reportMeta,
    reportDefinition,
    builderRows,
    deny: () => {
      denied = true
    },
  }
}

describe("native ERP business reading", () => {
  it("keeps custom business DocTypes readable even when assigned to a framework module", async () => {
    expect(
      safeBusinessType({
        name: "Oil Change Report",
        module: "Core",
        custom: 1,
      }),
    ).toBe(true)
    expect(safeBusinessType({ name: "User", module: "Core", custom: 1 })).toBe(
      false,
    )
    expect(
      safeBusinessType({
        name: "Integration Credentials",
        module: "Integrations",
        custom: 1,
      }),
    ).toBe(false)
    expect(
      safeBusinessType({ name: "Framework Record", module: "Core", custom: 0 }),
    ).toBe(false)
    const f = fixture()
    f.reportMeta.module = "Core"
    expect((await f.reader.report("Test")).doctype).toBe("Custom Request")
  })
  it("allows any currently permitted company and rejects foreign company selectors", async () => {
    const f = fixture()
    const reader = erpReader(f.erp, {
      ...context,
      companies: [
        { name: "Company A", default_currency: "SAR" },
        { name: "Company B", default_currency: "USD" },
      ],
    })
    await expect(
      reader.search("Custom Request", {
        fields: ["company"],
        filters: [["company", "=", "Not permitted"]],
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      reader.runReport("Test", {
        from_date: "2026-10-01",
        company: "Not permitted",
      }),
    ).rejects.toMatchObject({ status: 403 })
    f.doc.company = "Company B"
    expect(
      (
        await reader.search("Custom Request", {
          fields: ["company"],
          filters: [["company", "=", "Company B"]],
        })
      ).records[0].company,
    ).toBe("Company B")
    const changed = erpReader(f.erp, {
      ...context,
      companies: [{ name: "Company A", default_currency: "SAR" }],
    })
    await expect(
      changed.search("Custom Request", {
        filters: [["company", "in", ["Company B"]]],
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it("discovers custom business sources for an employee without DocType administration", async () => {
    const f = fixture()
    vi.spyOn(f.erp, "list").mockRejectedValue(
      new ERPNextError("DocType administration denied", 403),
    )
    vi.spyOn(f.erp, "request").mockImplementation(async (raw) => {
      const url = new URL(raw, context.siteUrl)
      expect(url.pathname).toBe("/api/method/frappe.desk.search.search_widget")
      expect(url.searchParams.get("doctype")).toBe("DocType")
      expect(url.searchParams.has("ignore_user_permissions")).toBe(false)
      return {
        values: [
          {
            name: "Custom Request",
            module: "Operations",
            custom: 1,
            istable: 0,
            issingle: 0,
          },
        ],
      }
    })
    vi.spyOn(f.erp, "canRead").mockResolvedValue(true)
    const reader = erpReader(f.erp, {
      ...context,
      roles: ["Desk User", "Employee"],
    })
    expect((await reader.sources("Custom", "doctype")).results).toMatchObject([
      { name: "Custom Request", custom: true, canRead: true },
    ])
    vi.spyOn(f.erp, "canRead").mockResolvedValue(false)
    expect((await reader.sources("Custom", "doctype")).results).toMatchObject([
      { canRead: false },
    ])
  })
  it("does not hide identity/network failures behind metadata discovery fallback", async () => {
    const f = fixture()
    vi.spyOn(f.erp, "list").mockRejectedValue(new ERPNextError("Expired", 401))
    const request = vi.spyOn(f.erp, "request")
    await expect(f.reader.sources("Custom", "doctype")).rejects.toMatchObject({
      status: 401,
    })
    expect(request).not.toHaveBeenCalled()
  })
  it("accepts the complete translated DocType catalog without repeating ignored offsets", async () => {
    const f = fixture()
    vi.spyOn(f.erp, "list").mockRejectedValue(new ERPNextError("Denied", 403))
    vi.spyOn(f.erp, "canRead").mockResolvedValue(true)
    const request = vi
      .spyOn(f.erp, "request")
      .mockResolvedValue({
        values: Array.from({ length: 300 }, (_, i) => ({
          name: `Custom ${i}`,
          module: "Operations",
          custom: 1,
          istable: 0,
          issingle: 0,
        })),
      })
    const result = await f.reader.sources("Custom", "doctype")
    expect(result.totalMatches).toBe(300)
    expect(request).toHaveBeenCalledTimes(1)
  })
  it("does not expose child schemas or saved columns through a restricted parent table", async () => {
    const f = fixture()
    f.meta.fields.find((field) => field.fieldname === "lines")!.permlevel = 1
    f.reportMeta.report_type = "Report Builder"
    expect((await f.reader.describe("Custom Request")).childTables).toEqual([])
    expect(
      (await f.reader.document("Custom Request", "REQ-1")).values,
    ).not.toHaveProperty("lines")
    await expect(f.reader.runReport("Test", {})).rejects.toMatchObject({
      status: 403,
    })
    expect(
      f.fetcher.mock.calls.some(([url]) =>
        String(url).includes("reportview.get_list"),
      ),
    ).toBe(false)
  })
  it("rejects a shared child DocType when another parent table using it is restricted", async () => {
    const f = fixture()
    f.meta.fields.push({
      fieldname: "private_lines",
      fieldtype: "Table",
      options: "Request Line",
      permlevel: 1,
    })
    f.reportMeta.report_type = "Report Builder"
    expect(
      (await f.reader.document("Custom Request", "REQ-1")).values.lines,
    ).toBeDefined()
    await expect(f.reader.runReport("Test", {})).rejects.toMatchObject({
      status: 403,
    })
    expect(
      f.fetcher.mock.calls.some(([url]) =>
        String(url).includes("reportview.get_list"),
      ),
    ).toBe(false)
  })
  it("preserves child-table access for a role granted the parent table's permission level", async () => {
    const f = fixture()
    f.meta.fields.find((field) => field.fieldname === "lines")!.permlevel = 1
    f.reportMeta.report_type = "Report Builder"
    const reader = erpReader(f.erp, {
      ...context,
      roles: ["System Manager", "HR Manager"],
    })
    expect((await reader.describe("Custom Request")).childTables).toHaveLength(
      1,
    )
    expect(
      (await reader.document("Custom Request", "REQ-1")).values.lines,
    ).toBeDefined()
    expect((await reader.runReport("Test", {})).rows).toHaveLength(1)
  })
  it("compiles valid Arabic saved columns as identifiers and rejects injected ordering", async () => {
    const f = fixture()
    const fieldname = "تصريح_بيئي"
    f.meta.fields.push({ fieldname, fieldtype: "Data" })
    f.reportMeta.report_type = "Report Builder"
    f.reportDefinition.json = JSON.stringify({
      fields: [[fieldname, "Custom Request"]],
      filters: [],
    })
    const description = await f.reader.report("Test")
    expect(description.savedFields).toContainEqual([
      fieldname,
      "Custom Request",
    ])
    await f.reader.search("Custom Request", {
      fields: ["subject"],
      orderBy: "name asc",
    })
    expect(
      new URL(String(f.fetcher.mock.calls.at(-1)![0])).searchParams.get(
        "order_by",
      ),
    ).toBe("name asc")
    await expect(
      f.reader.search("Custom Request", { orderBy: "name; select 1" as any }),
    ).rejects.toMatchObject({ status: 400 })
  })
  it("uses saved Custom Report filter defaults and permits explicit overrides", async () => {
    const f = fixture()
    f.reportMeta.report_type = "Custom Report"
    f.reportDefinition.json = JSON.stringify({
      filters: { from_date: "2026-10-01", company: "Company A" },
    })
    const result = await f.reader.runReport("Test", { from_date: "2026-10-10" })
    expect(result.filters).toEqual({
      from_date: "2026-10-10",
      company: "Company A",
    })
  })
  it("reads saved Report Builder parent/child columns while preserving saved and additional filters", async () => {
    const f = fixture()
    f.reportMeta.report_type = "Report Builder"
    const result = await f.reader.runReport("Test", {
      subject: ["like", "Replacement%"],
    })
    expect(result.rows).toEqual([
      { name: "REQ-1", subject: "Replacement", "Request Line:qty": 2 },
    ])
    const call = f.fetcher.mock.calls.find(([url]) =>
      String(url).includes("reportview.get_list"),
    )!
    const params = new URL(String(call[0])).searchParams
    expect(JSON.parse(params.get("filters")!)).toEqual([
      ["Custom Request", "company", "=", "Company A"],
      ["Custom Request", "subject", "like", "Replacement%"],
    ])
    expect(params.get("save_user_settings")).toBe("false")
    expect(params.has("user")).toBe(false)
    expect(result.totalRowIncluded).toBe(false)
  })
  it("runs saved Report Builder grouping through Frappe, without accepting arbitrary aggregate expressions", async () => {
    const f = fixture()
    f.reportMeta.report_type = "Report Builder"
    f.reportDefinition.json = JSON.stringify({
      fields: [["subject", "Custom Request"]],
      group_by: {
        group_by: "company",
        aggregate_function: "sum",
        aggregate_on: "`tabRequest Line`.`qty`",
      },
    })
    f.builderRows[0].c0 = "Company A"
    const result = await f.reader.runReport("Test", {})
    expect(result.rows).toEqual([
      { company: "Company A", _aggregate_column: 2 },
    ])
    const call = f.fetcher.mock.calls.find(([url]) =>
      String(url).includes("reportview.get_list"),
    )!
    expect(
      new URL(String(call[0])).searchParams.get("aggregate_function"),
    ).toBe("sum")
    f.reportDefinition.json = JSON.stringify({
      group_by: {
        group_by: "company",
        aggregate_function: "exec",
        aggregate_on: "qty",
      },
    })
    await expect(f.reader.runReport("Test", {})).rejects.toThrow()
  })
  it("refuses stale/restricted Builder columns and unknown filters rather than widening the saved report", async () => {
    const f = fixture()
    f.reportMeta.report_type = "Report Builder"
    await expect(
      f.reader.runReport("Test", { nonexistent: "x" }),
    ).rejects.toMatchObject({ status: 400 })
    f.reportDefinition.json = JSON.stringify({
      fields: [["api_secret", "Custom Request"]],
    })
    await expect(f.reader.runReport("Test", {})).rejects.toMatchObject({
      status: 403,
    })
    expect(
      f.fetcher.mock.calls.some(([url]) =>
        String(url).includes("reportview.get_list"),
      ),
    ).toBe(false)
  })
  it("uses effective custom metadata and excludes secrets and ungranted permission levels, including child rows", async () => {
    const { reader } = fixture()
    const schema = await reader.describe("Custom Request")
    expect(schema.fields.map((f) => f.fieldname)).toEqual([
      "subject",
      "company",
      "workflow_state",
      "lines",
    ])
    const result = await reader.document("Custom Request", "REQ-1")
    expect(result.values.lines).toEqual([{ name: "LINE-1", qty: 2 }])
    expect(result.values.company).toBe("Company B")
    expect(result.scope).toContain("span companies")
    expect(JSON.stringify(result)).not.toContain("NEVER RETURN")
    expect(result.values).not.toHaveProperty("restricted")
  })
  it("checks native permissions before schema/data access", async () => {
    const f = fixture()
    f.deny()
    await expect(
      f.reader.document("Custom Request", "REQ-1"),
    ).rejects.toMatchObject({ status: 403 })
    expect(f.fetcher).toHaveBeenCalledTimes(1)
  })
  it("does not reuse permissions between tool requests", async () => {
    const f = fixture()
    await f.reader.document("Custom Request", "REQ-1")
    f.deny()
    await expect(
      erpReader(f.erp, context).document("Custom Request", "REQ-1"),
    ).rejects.toMatchObject({ status: 403 })
  })
  it("validates query fields/operators and never accepts SQL expressions or secret predicates", async () => {
    const { reader } = fixture()
    for (const input of [
      { fields: ["sum(amount)"] },
      { fields: ["api_secret"] },
      { filters: [["subject", "or 1=1", "x"]] },
      { filters: [["api_secret", "=", "x"]] },
    ])
      await expect(
        reader.search("Custom Request", input),
      ).rejects.toMatchObject({ status: 400 })
  })
  it("preserves explicit Company filters, escapes search wildcards and marks pagination", async () => {
    const f = fixture()
    f.doc.company = "Company A"
    const result = await f.reader.search("Custom Request", {
      fields: ["subject", "company"],
      filters: [["company", "=", "Company A"]],
      search: "a%_",
      limit: 1,
    })
    const url = new URL(String(f.fetcher.mock.calls.at(-1)![0]))
    expect(JSON.parse(url.searchParams.get("filters")!)).toEqual([
      ["company", "=", "Company A"],
    ])
    expect(JSON.parse(url.searchParams.get("or_filters")!)[0][2]).toBe(
      "%a\\%\\_%",
    )
    expect(result.note).toContain("not a complete financial total")
  })
  it("rejects missing, duplicate or wrongly scoped record identities before returning any records", async () => {
    for (const rows of [
      [{}],
      [{ name: "REQ-1" }, { name: "REQ-1" }],
      [{ name: "REQ-1", company: "Company B" }],
    ]) {
      const f = fixture()
      vi.spyOn(f.erp, "page").mockResolvedValue(rows)
      await expect(
        f.reader.search("Custom Request", {
          fields: ["subject"],
          filters: [["company", "=", "Company A"]],
        }),
      ).rejects.toMatchObject({
        status: rows.length === 1 && "company" in rows[0] ? 403 : 502,
      })
    }
  })
  it("pages attachments with lookahead, projects metadata and rechecks parent access", async () => {
    const f = fixture()
    const page = vi.spyOn(f.erp, "page").mockResolvedValue([
      {
        name: "FILE-1",
        file_name: "quote.pdf",
        file_size: 10,
        is_private: 1,
        file_url: "/private/files/quote.pdf",
        password: "never",
      },
      { name: "FILE-2", file_name: "other.pdf" },
    ])
    const result = await f.reader.attachments("Custom Request", "REQ-1", 0, 1)
    expect(result).toMatchObject({
      hasMore: true,
      nextOffset: 1,
      files: [
        {
          name: "FILE-1",
          file_name: "quote.pdf",
          file_size: 10,
          is_private: true,
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain("/private/files")
    expect(JSON.stringify(result)).not.toContain("never")
    expect(page).toHaveBeenLastCalledWith(
      "File",
      expect.objectContaining({ orderBy: "name asc", offset: 0, limit: 2 }),
    )
    page.mockClear()
    f.deny()
    await expect(
      erpReader(f.erp, context).attachments("Custom Request", "REQ-1"),
    ).rejects.toMatchObject({ status: 403 })
    expect(page).not.toHaveBeenCalled()
  })
  it("rejects malformed attachment pages and identities", async () => {
    const f = fixture()
    const page = vi.spyOn(f.erp, "page")
    await expect(
      f.reader.attachments("Custom Request", "REQ-1", 100001),
    ).rejects.toMatchObject({ status: 400 })
    expect(page).not.toHaveBeenCalled()
    for (const rows of [
      [{ name: "", file_name: "test.pdf" }],
      [
        { name: "F-1", file_name: "test.pdf" },
        { name: "F-1", file_name: "test.pdf" },
      ],
    ]) {
      page.mockResolvedValueOnce(rows)
      await expect(
        f.reader.attachments("Custom Request", "REQ-1"),
      ).rejects.toMatchObject({ status: 502 })
    }
  })
  it("requires exact document identity and does not return a mismatched upstream record", async () => {
    const f = fixture()
    f.doc.name = "ANOTHER"
    await expect(f.reader.document("Custom Request", "REQ-1")).rejects.toThrow(
      "invalid document",
    )
  })
  it("uses native report execution with explicit filters, no prepared-report scheduling and no impersonation", async () => {
    const f = fixture()
    await expect(f.reader.runReport("Test", {})).rejects.toThrow(
      "requires filter: from_date",
    )
    const report = await f.reader.runReport("Test", {
      from_date: "2026-10-01",
      company: "Company A",
    })
    expect(report.rows).toEqual([{ amount: 10 }, { amount: 10 }])
    expect(report.totalRowIncluded).toBe(true)
    expect(report.scope).toContain("may ignore")
    const call = f.fetcher.mock.calls.find(([u]) =>
      String(u).includes("query_report.run"),
    )!
    const params = new URL(String(call[0])).searchParams
    expect(params.get("ignore_prepared_report")).toBe("1")
    expect(params.get("are_default_filters")).toBe("0")
    expect(params.has("user")).toBe(false)
  })
  it("does not present conditional branches and loops as a guaranteed approval sequence", async () => {
    const f = fixture(),
      result = await f.reader.approvals("Custom Request", "REQ-1")
    expect(result.currentState).toBe("Pending")
    expect(result.immediateCandidates).toHaveLength(2)
    expect(result.possibleRemainingTransitions).toHaveLength(4)
    expect(result.immediateCandidates![0].conditional).toBe(true)
    expect(result.availableToCurrentUser).toEqual([]) // Owner cannot self-approve.
    expect(result.note).toContain("not named assigned approvers")
  })
  it("preserves native Administrator self-approval eligibility without enabling execution", async () => {
    const f = fixture()
    f.doc.owner = "Administrator"
    const result = await erpReader(f.erp, {
      ...context,
      user: "Administrator",
    }).approvals("Custom Request", "REQ-1")
    expect(result.availableToCurrentUser).toEqual([
      {
        action: "Approve",
        nextState: "Manager Approved",
        approverRole: "System Manager",
      },
    ])
  })
  it("rejects transitions that changed state during inspection", async () => {
    const f = fixture(),
      original = f.fetcher.getMockImplementation()!
    f.fetcher.mockImplementation(async (raw, init) =>
      String(raw).includes("get_transitions")
        ? Response.json({
            message: [
              {
                state: "Manager Approved",
                action: "Approve",
                next_state: "Approved",
                allowed: "CEO",
              },
            ],
          })
        : original(raw, init),
    )
    await expect(
      f.reader.approvals("Custom Request", "REQ-1"),
    ).rejects.toMatchObject({ status: 409 })
  })
  it("excludes security/settings and independent child tables while retaining custom business types", () => {
    expect(
      safeBusinessType({ name: "Custom Request", module: "Operations" }),
    ).toBe(true)
    for (const meta of [
      { name: "User" },
      { name: "Email Account", module: "Email" },
      { name: "Bank API Credentials" },
      { name: "Request Line", istable: 1 },
      { name: "Custom Settings", issingle: 1 },
    ])
      expect(safeBusinessType(meta)).toBe(false)
  })
})

describe("static report filter discovery", () => {
  it("treats prototype-named filters as own data and never satisfies required filters through inheritance", () => {
    const result = reportFilters(
      JSON.parse('{"__proto__":["=","value"],"تصريح_بيئي":"active"}'),
      [],
    )
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(JSON.parse(JSON.stringify(result))).toHaveProperty("__proto__", [
      "=",
      "value",
    ])
    expect(result["تصريح_بيئي"]).toBe("active")
    expect(() =>
      reportFilters({}, [{ fieldname: "constructor", required: true }]),
    ).toThrow("requires filter")
  })
  it("extracts literal and translated labels without executing functions, scripts or defaults", () => {
    const script =
      "throw new Error('must never execute'); frappe.query_reports.X={filters:[{fieldname:'from_date',fieldtype:'Date',label:__('From'),reqd:1,default:stealSecrets()},{fieldname:'api_secret',fieldtype:'Password'}]};"
    expect(reportScriptFilters(script)).toEqual([
      { fieldname: "from_date", fieldtype: "Date", label: "From", reqd: 1 },
    ])
  })
  it("fails safely on unsupported or malformed JS", () => {
    expect(reportScriptFilters("this is not javascript {{{")).toEqual([])
  })
})
