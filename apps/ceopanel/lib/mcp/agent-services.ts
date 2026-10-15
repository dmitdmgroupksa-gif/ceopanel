import "server-only"
import { agentAccess, moduleAccess, companyValues } from "../platform/policy"
import { platformConfig } from "../platform/config"
import { client } from "../erpnext-server"
import { ERPNextError } from "../erpnext-client"
import {
  validateValues,
  requiredValues,
  type ModuleSchema,
  type ReportData,
} from "../workspace"
import { redactRestrictedText } from "../platform/privacy"
import { propose, actionSchema } from "../platform/proposals"
import { searchKnowledge } from "../platform/knowledge"
import type { ToolScope } from "./types"

function approved(values: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(
        ([key, value]) =>
          fields.includes(key) &&
          (value === null ||
            ["string", "number", "boolean"].includes(typeof value)),
      )
      .map(([key, value]) => [
        key,
        typeof value === "string" ? redactRestrictedText(value) : value,
      ]),
  )
}
export async function agentService(
  scope: ToolScope,
  name: string,
  args: Record<string, any>,
) {
  const { context, agent } = scope
  if (!agent) throw new ERPNextError("An agent profile is required.", 403)
  const { mapping: assignment } = agentAccess(context, agent)
  let output: unknown
  if (name === "list_sources") {
    const config = platformConfig()
    return {
      company: context.company,
      agent,
      modules: config.modules
        .filter(
          (m) =>
            assignment.modules.includes(m.id) &&
            m.readValidated &&
            m.aiFields.length,
        )
        .map((m) => ({
          id: m.id,
          title: m.title,
          doctype: m.doctype,
          proposalValidated: m.writeValidated,
        })),
      reports: config.reports
        .filter(
          (r) =>
            assignment.reports.includes(r.id) &&
            r.readValidated &&
            r.aiFields.length,
        )
        .map((r) => ({ id: r.id, name: r.erpName, filters: r.filters })),
      approvalRequired: true,
    }
  } else if (name === "describe_module") {
    const mapping = moduleAccess(context, agent, args.module)
    const schema = await (
      await client()
    ).bridge<ModuleSchema>("schema", {
      module: mapping.id,
      company: context.company,
    })
    if (
      !schema.ready ||
      schema.module?.id !== mapping.id ||
      schema.module.doctype !== mapping.doctype
    )
      throw new ERPNextError("Module schema awaits validation.", 409)
    output = {
      module: mapping.id,
      doctype: mapping.doctype,
      fields: schema.fields.filter(
        (f) => mapping.aiFields.includes(f.name) && f.type !== "table",
      ),
      permissions: schema.permissions,
      workflowActions: mapping.workflowActions,
    }
  } else if (name === "read_records" || name === "read_record") {
    const mapping = moduleAccess(context, agent, args.module)
    const result =
      name === "read_record"
        ? {
            company: context.company,
            retrievedAt: new Date().toISOString(),
            hasMore: false,
            records: [
              await (
                await client()
              ).bridge<any>("record", {
                module: mapping.id,
                company: context.company,
                name: args.name,
              }),
            ],
          }
        : await (
            await client()
          ).bridge<any>("ai_records", {
            module: mapping.id,
            company: context.company,
            search: args.search,
          })
    if (result.company !== context.company || !Array.isArray(result.records))
      throw new ERPNextError("AI source returned a different company.", 403)
    output = {
      source: mapping.doctype,
      module: mapping.id,
      company: context.company,
      retrievedAt: result.retrievedAt,
      hasMore: result.hasMore,
      records: result.records.map((r: any) => ({
        name: r.name,
        modified: r.modified,
        values: approved(r.values, mapping.aiFields),
      })),
    }
  } else if (name === "read_report") {
    const report = platformConfig().reports.find(
      (r) => r.id === args.report && r.readValidated && r.aiFields.length,
    )
    if (!report || !assignment.reports.includes(report.id))
      throw new ERPNextError("This report is not assigned to this agent.", 403)
    const filters = validateValues(
      companyValues(
        typeof args.filters === "string"
          ? JSON.parse(args.filters)
          : args.filters,
        report.companyField,
        context.company,
      ),
      report.filters,
    )
    if (report.companyField) filters[report.companyField] = context.company
    requiredValues(filters, report.filters)
    const result = await (
      await client()
    ).bridge<ReportData>("report", {
      report: report.id,
      company: context.company,
      filters,
    })
    output = {
      source: report.erpName,
      report: report.id,
      filters,
      retrievedAt: new Date().toISOString(),
      columns: result.columns.filter((c) => report.aiFields.includes(c.key)),
      totalRow: result.totalRow
        ? approved(result.totalRow, report.aiFields)
        : null,
      rows: result.rows.map((r) => approved(r, report.aiFields)),
    }
  } else if (name === "search_knowledge")
    output = await searchKnowledge(context, args.query)
  else if (name === "propose_action") {
    if (scope.canPropose === false)
      throw new ERPNextError("This connection has read-only access.", 403)
    const payload = actionSchema.parse(
      typeof args.payload === "string"
        ? JSON.parse(args.payload)
        : args.payload,
    )
    const mapping = moduleAccess(context, agent, payload.module)
    if (
      (payload.kind === "create" || payload.kind === "update") &&
      Object.keys(payload.values).some(
        (field) =>
          !mapping.aiFields.includes(field) && field !== mapping.companyField,
      )
    )
      throw new ERPNextError(
        "A proposal contains fields that are not approved for AI processing.",
        403,
      )
    return propose(context, agent, payload, scope.evidence, args.request_id)
  } else throw new ERPNextError("Tool unavailable.", 403)
  if (JSON.stringify(output).length > 200000)
    throw new ERPNextError(
      "Source exceeds the AI context limit. Use narrower filters; no partial totals were calculated.",
      413,
    )
  if (name === "search_knowledge") scope.evidence.push(...(output as unknown[]))
  else if (name !== "describe_module") scope.evidence.push(output)
  return output
}
