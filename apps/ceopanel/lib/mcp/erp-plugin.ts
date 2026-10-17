import "server-only"
import { z } from "zod"
import { createHash } from "node:crypto"
import type { BusinessPlugin, PluginTool, ToolScope } from "./types"
import { ERPNextError } from "../erpnext-error"
import { client } from "../erpnext-server"
import { erpReader } from "../erp-native/reader"
import { erpExport, exportSchema } from "../erp-native/files"
import { requireNativeRead } from "../erp-native/read-policy"

const id = z
  .string()
  .min(1)
  .max(180)
  .refine(
    (s) => !!s.trim() && !/[\x00-\x1f]/.test(s),
    "Use an exact ERP identifier without control characters.",
  )
const offset = z.number().int().min(0).max(100000).default(0)
const titles: Record<string, string> = {
  erp_list_companies: "List my accessible ERP companies",
  erp_search_sources: "Find ERP reports and record types",
  erp_describe_doctype: "Inspect ERP record fields",
  erp_search_records: "Search ERP records",
  erp_read_document: "Read an ERP document",
  erp_describe_report: "Inspect ERP report filters",
  erp_run_report: "Run an ERP report",
  erp_check_approvals: "Inspect approval workflow",
  erp_list_attachments: "List document attachments",
  erp_export_file: "Export ERP PDF or spreadsheet",
}
export function requireERPScope(scope: ToolScope) {
  requireNativeRead(scope.context)
  if (scope.erpRead !== true)
    throw new ERPNextError(
      "Reconnect MCP and consent to ceopanel:erp-read for ERP-wide reading and files.",
      403,
    )
}
function tool(
  name: string,
  description: string,
  schema: z.ZodObject,
  run: (scope: ToolScope, args: any) => Promise<unknown>,
): PluginTool {
  return {
    name,
    title: titles[name],
    description,
    schema,
    run: async (scope, args) => {
      requireERPScope(scope)
      return run(scope, args)
    },
    audience: "agent",
    effect: "read",
    requiresERPRead: true,
  }
}
async function read(
  scope: ToolScope,
  operation: (reader: ReturnType<typeof erpReader>) => Promise<any>,
) {
  const data = await operation(erpReader(await client(), scope.context))
  if (data.provenance)
    scope.evidence.push({
      ...data.provenance,
      companyContext: scope.context.company,
      digest: nativeEvidenceDigest(data),
    })
  return data
}
export function nativeEvidenceDigest(data: Record<string, unknown>) {
  const { provenance: _provenance, ...content } = data
  return createHash("sha256").update(JSON.stringify(content)).digest("hex")
}
export const erpExportTool = tool(
  "erp_export_file",
  "Deliver a quotation/order/invoice PDF, a native report as PDF/CSV/XLSX, or an existing attached file. Use delivery=embedded if your MCP client cannot read resource links. Link delivery checks access now and regenerates on download; files are limited to 6 MB, report PDFs to 500 rows. This never creates or changes an ERP document.",
  z
    .object({
      request: exportSchema,
      delivery: z.enum(["link", "embedded"]).default("link"),
    })
    .strict(),
  async (scope, args) => {
    const file = await erpExport(
      await client(),
      scope.context,
      args.request,
      args.delivery === "embedded",
    )
    scope.evidence.push({
      kind: "native-erp",
      type: "file",
      source: args.request.kind,
      request: args.request,
      file: file.data.file,
      retrievedAt: new Date().toISOString(),
    })
    return file
  },
)
export const erpReadPlugin: BusinessPlugin = {
  id: "erp-native-read",
  title: "ERP-wide business discovery and files",
  version: "1.0.0",
  tools: [
    tool(
      "erp_list_companies",
      "List the companies currently accessible to this authenticated Frappe user, including currencies and the default company context. Call this before selecting company filters; permissions are refreshed on every MCP request. Never assume the user has only one company.",
      z.object({}).strict(),
      async (s) => ({
        companies: s.context.companies.map((c) => ({
          name: c.name,
          currency: c.default_currency,
        })),
        selectedCompany: s.context.company,
        scope: "Current authenticated Frappe user's permitted companies",
      }),
    ),
    tool(
      "erp_search_sources",
      "Find enabled ERP reports and standard/custom business DocTypes by words in their name or module. Start here for unknown/custom sources; a name ending in Report may be a saved report, not a DocType. Search kind=all when unsure. Results are metadata candidates, not a permission guarantee. Follow nextOffset when hasMore is true; try synonyms or individual words if no match.",
      z
        .object({
          query: z.string().max(200),
          kind: z.enum(["all", "doctype", "report"]).default("all"),
          offset,
          limit: z.number().int().min(1).max(50).default(20),
        })
        .strict(),
      (s, a) => read(s, (r) => r.sources(a.query, a.kind, a.offset, a.limit)),
    ),
    tool(
      "erp_describe_doctype",
      "Discover effective native and custom fields, child tables and Company links before selecting fields or filters. Security/settings sources and credential fields are excluded. Reads follow the ERP user's permissions across the site.",
      z.object({ doctype: id }).strict(),
      (s, a) => read(s, (r) => r.describe(a.doctype)),
    ),
    tool(
      "erp_search_records",
      "Search one native/custom business DocType using fields discovered from its schema. Structured filters are [field,operator,value]. Add Company and date filters explicitly if requested. Follow nextOffset when hasMore is true. Record pages cannot establish complete financial totals.",
      z
        .object({
          doctype: id,
          search: z.string().max(200).default(""),
          fields: z.array(id).max(28).default([]),
          filters: z
            // Homogeneous JSON Schema arrays work in both MCP and OpenAI
            // function definitions. The reader validates all three tuple values.
            .array(z.array(z.unknown()).length(3))
            .max(20)
            .default([]),
          offset,
          limit: z.number().int().min(1).max(100).default(20),
        })
        .strict(),
      (s, a) => read(s, (r) => r.search(a.doctype, a)),
    ),
    tool(
      "erp_read_document",
      "Read a permitted native or custom business document, including custom fields and child rows. Exact DocType/name required; discover/search first. Returns source and modification timestamp.",
      z.object({ doctype: id, name: id }).strict(),
      (s, a) => read(s, (r) => r.document(a.doctype, a.name)),
    ),
    tool(
      "erp_describe_report",
      "Check native report access and discover required filters, their types and options. Report Builder views expose saved fields, filters and supported grouping. Never invent a report name, date default or SQL query.",
      z.object({ report: id }).strict(),
      (s, a) => read(s, (r) => r.report(a.report)),
    ),
    tool(
      "erp_run_report",
      "Run an enabled native Query/Script/Custom report or saved Report Builder view under ERP permissions. Supply discovered required filters. Builder extra filters use field:value or field:[operator,value] and combine with saved filters. Native reports may use fixed dates or ignore company filters: disclose unverified scope. Never sum native total rows twice. Large results fail without truncation; narrow filters or export a file.",
      z
        .object({
          report: id,
          filters: z.record(z.string(), z.unknown()).default({}),
        })
        .strict(),
      (s, a) => read(s, (r) => r.runReport(a.report, a.filters)),
    ),
    tool(
      "erp_check_approvals",
      "Inspect a permitted document's actual native workflow state, candidate next approver roles, possible future branches and transitions ERP currently permits for this user. Does not approve or submit. Conditions for other roles/future states cannot be assumed satisfied; roles do not identify assigned individuals.",
      z.object({ doctype: id, name: id }).strict(),
      (s, a) => read(s, (r) => r.approvals(a.doctype, a.name)),
    ),
    tool(
      "erp_list_attachments",
      "List paginated attachment identifiers for one permitted document. Follow nextOffset when hasMore is true. Use each file's name as erp_export_file request.name with kind=attachment, not its filename. Downloads recheck access.",
      z
        .object({
          doctype: id,
          name: id,
          offset,
          limit: z.number().int().min(1).max(100).default(20),
        })
        .strict(),
      (s, a) =>
        read(s, (r) => r.attachments(a.doctype, a.name, a.offset, a.limit)),
    ),
    erpExportTool,
  ],
}
