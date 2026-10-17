import "server-only"
import { z } from "zod"
import { ERPNextError, type ERPNextClient } from "../erpnext-client"
import { erpReader } from "./reader"
import { requireNativeRead } from "./read-policy"
import type { UserContext } from "../platform/policy"

const id = z.string().trim().min(1).max(180)
const page = { offset: z.number().int().min(0).max(100000).default(0) }
export const explorerRequest = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("sources"),
      query: z.string().max(200).default(""),
      kind: z.enum(["all", "doctype", "report"]).default("all"),
      ...page,
    })
    .strict(),
  z.object({ action: z.literal("schema"), doctype: id }).strict(),
  z
    .object({
      action: z.literal("records"),
      doctype: id,
      search: z.string().max(200).default(""),
      fields: z.array(id).max(28).default([]),
      filters: z
        .array(z.tuple([id, z.string().max(20), z.unknown()]))
        .max(20)
        .default([]),
      ...page,
    })
    .strict(),
  z
    .object({ action: z.literal("document"), doctype: id, name: id, ...page })
    .strict(),
  z
    .object({ action: z.literal("workflow"), doctype: id, name: id, ...page })
    .strict(),
  z
    .object({
      action: z.literal("attachments"),
      doctype: id,
      name: id,
      ...page,
    })
    .strict(),
  z.object({ action: z.literal("report"), report: id }).strict(),
  z
    .object({
      action: z.literal("run-report"),
      report: id,
      filters: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
  z.object({ action: z.literal("export"), request: z.unknown() }).strict(),
])
type Client = ERPNextClient
export async function explore(
  context: UserContext,
  input: unknown,
  erp: Client,
) {
  requireNativeRead(context)
  const parsed = explorerRequest.safeParse(input)
  if (!parsed.success) throw new ERPNextError("Invalid explorer request.", 400)
  const args = parsed.data
  const reader = erpReader(erp, context)
  switch (args.action) {
    case "sources":
      return reader.sources(args.query, args.kind, args.offset, 20)
    case "schema":
      return reader.describe(args.doctype)
    case "records": {
      const companyFilter = args.filters.find(
        (f) => f[0] === "company" && f[1] === "=",
      )
      const fields = companyFilter
        ? [...new Set([...args.fields, "company"])]
        : args.fields
      const data = await reader.search(args.doctype, {
        ...args,
        fields,
        limit: 20,
      })
      if (
        data.records.some((r) => typeof r.name !== "string" || !r.name) ||
        new Set(data.records.map((r) => r.name)).size !== data.records.length
      )
        throw new ERPNextError(
          "ERP returned missing or duplicate record identities.",
          502,
        )
      if (
        companyFilter &&
        data.records.some((r) => r.company !== companyFilter[2])
      )
        throw new ERPNextError(
          "ERP returned records outside the requested company filter.",
          403,
        )
      return data
    }
    case "document":
      return reader.document(args.doctype, args.name)
    case "workflow":
      return reader.approvals(args.doctype, args.name)
    case "report":
      return reader.report(args.report)
    case "run-report":
      return reader.runReport(args.report, args.filters)
    case "attachments": {
      await reader.document(args.doctype, args.name)
      const files = await erp.page<Record<string, unknown>>("File", {
        fields: ["name", "file_name", "file_size", "is_private"],
        filters: [
          ["attached_to_doctype", "=", args.doctype],
          ["attached_to_name", "=", args.name],
        ],
        offset: args.offset,
        limit: 21,
        orderBy: "name asc",
      })
      if (
        files.some(
          (f) => typeof f.name !== "string" || typeof f.file_name !== "string",
        ) ||
        new Set(files.map((f) => f.name)).size !== files.length
      )
        throw new ERPNextError(
          "ERP returned invalid attachment identities.",
          502,
        )
      return {
        files: files.slice(0, 20).map((f) => ({
          name: f.name as string,
          filename: f.file_name as string,
          size: typeof f.file_size === "number" ? f.file_size : null,
          private: !!f.is_private,
        })),
        hasMore: files.length > 20,
      }
    }
    case "export": {
      const { erpExport, exportSchema } = await import("./files")
      const request = exportSchema.safeParse(args.request)
      if (!request.success) throw new ERPNextError("Invalid file request.", 400)
      return (await erpExport(erp, context, request.data, false)).data.file
    }
    default:
      throw new ERPNextError("Unknown explorer operation.", 400)
  }
}
