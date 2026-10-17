import { readFileSync } from "node:fs"
import path from "node:path"
import PDFDocument from "pdfkit"
import ExcelJS from "exceljs"
import { z } from "zod"
import type { ERPNextClient } from "../erpnext-client"
import { ERPNextError } from "../erpnext-error"
import type { UserContext } from "../platform/policy"
import { erpReader, reportFilters } from "./reader"
import { spreadsheetText } from "../spreadsheet"
import { validateERPFilePath } from "../erp-file-path"
import { companyLabel } from "../company-scope"
export { spreadsheetText } from "../spreadsheet"

const id = z.string().min(1).max(180)
export const exportSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("document"),
      doctype: id,
      name: id,
      format: z.literal("pdf").default("pdf"),
      printFormat: id.optional(),
      language: z.enum(["en", "ar"]).default("en"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("report"),
      report: id,
      filters: z.record(z.string(), z.unknown()).default({}),
      format: z.enum(["pdf", "csv", "xlsx"]),
    })
    .strict(),
  z.object({ kind: z.literal("attachment"), name: id }).strict(),
])
export type ExportRequest = z.infer<typeof exportSchema>
export type FileDescriptor = {
  uri: string
  name: string
  mimeType: string
  downloadUrl: string
  note: string
}
export class ERPFileResult {
  constructor(
    public data: { file: FileDescriptor },
    public blob?: Buffer
  ) {}
}
const mimeTypes = {
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
export function filename(name: string, extension: string) {
  return `${
    name
      .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 140) || "ERP-export"
  }.${extension}`
}
export function exportToken(request: ExportRequest) {
  const token = Buffer.from(JSON.stringify(request)).toString("base64url")
  if (token.length > 10000)
    throw new ERPNextError(
      "File request is too long. Use fewer report filters.",
      413
    )
  return token
}
export function parseExportToken(token: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 10000)
    throw new ERPNextError("Invalid ERP file request.", 400)
  try {
    return exportSchema.parse(
      JSON.parse(Buffer.from(token, "base64url").toString("utf8"))
    )
  } catch {
    throw new ERPNextError("Invalid ERP file request.", 400)
  }
}
function plain(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
}
export async function reportPDF(
  report: {
    report: string
    scope?: string
    filters: object
    columns: { fieldname: string; label: string }[]
    rows: Record<string, unknown>[]
    totalRowIncluded: boolean
  },
  company: string
) {
  if (report.rows.length > 500)
    throw new ERPNextError(
      "PDF exports support up to 500 report rows. Narrow the report or use CSV/XLSX for the complete result.",
      413
    )
  if (
    report.columns.length * report.rows.length > 8000 ||
    JSON.stringify(report).length > 200000
  )
    throw new ERPNextError(
      "This report is too wide or text-heavy for PDF. Narrow it or use CSV/XLSX; no rows were truncated.",
      413
    )
  const font = (name: string) =>
    readFileSync(path.join(process.cwd(), "lib/erp-native/fonts", name))
  const pdf = new PDFDocument({
    size: "A4",
    margin: 44,
    bufferPages: true,
    autoFirstPage: true,
    font: path.join(process.cwd(), "lib/erp-native/fonts/NotoSans-Regular.ttf"),
    info: { Title: report.report, Author: "Durar Masagh" },
  })
  pdf.registerFont("arabic", font("NotoSansArabic-Regular.ttf"))
  pdf.registerFont("latin", font("NotoSans-Regular.ttf"))
  const chunks: Buffer[] = []
  let size = 0
  const result = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > 6 * 1024 * 1024) pdf.destroy(new Error("PDF too large"))
      else chunks.push(chunk)
    })
    pdf.on("end", () => resolve(Buffer.concat(chunks)))
    pdf.on("error", () =>
      reject(
        new ERPNextError(
          "Report PDF could not be generated within the file size limit.",
          413
        )
      )
    )
  })
  function text(value: string, fontSize = 9) {
    const v = plain(value)
    const parts = v
      .split(/([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]+)/)
      .filter(Boolean)
    for (const [index, part] of parts.entries())
      pdf
        .font(
          /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(part)
            ? "arabic"
            : "latin"
        )
        .fontSize(fontSize)
        .text(part, {
          align: /[\u0600-\u06ff]/.test(v) ? "right" : "left",
          continued: index < parts.length - 1,
        })
  }
  text(report.report, 17)
  text(`Requested from ${company} • ${new Date().toISOString()}`, 8)
  text(report.scope || "Native ERP report scope applies.", 8)
  text(`Filters: ${JSON.stringify(report.filters)}`, 8)
  text(
    `${report.rows.length} rows. Native total row included: ${report.totalRowIncluded ? "yes" : "no"}.`,
    8
  )
  for (const [index, row] of report.rows.entries()) {
    pdf.moveDown(0.7)
    text(`Row ${index + 1}`, 10)
    for (const col of report.columns)
      if (row[col.fieldname] !== undefined && row[col.fieldname] !== null)
        text(`${plain(col.label)}: ${plain(row[col.fieldname])}`)
  }
  const pages = pdf.bufferedPageRange()
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    pdf.switchToPage(i)
    pdf
      .font("latin")
      .fontSize(7)
      .text(`${i + 1} / ${pages.count}`, 44, pdf.page.height - 33, {
        lineBreak: false,
      })
  }
  pdf.end()
  return result
}

export async function erpExport(
  erp: ERPNextClient,
  context: UserContext,
  raw: unknown,
  embedded: boolean
): Promise<ERPFileResult> {
  const request = exportSchema.parse(raw),
    reader = erpReader(erp, context)
  let name: string, mimeType: string, blob: Buffer | undefined
  if (request.kind === "document") {
    await reader.document(request.doctype, request.name)
    await reader.permission(request.doctype, request.name, "print")
    name = filename(request.name, "pdf")
    mimeType = mimeTypes.pdf
    if (embedded) {
      const params = new URLSearchParams({
        doctype: request.doctype,
        name: request.name,
        language: request.language,
        ...(request.printFormat ? { format: request.printFormat } : {}),
      })
      blob = await erp.binary(
        `/api/method/frappe.utils.print_format.download_pdf?${params}`
      )
      if (blob.subarray(0, 5).toString() !== "%PDF-")
        throw new ERPNextError("ERP did not return a valid PDF.")
    }
  } else if (request.kind === "report") {
    const description = await reader.report(request.report)
    if (!description.supported) throw new ERPNextError(description.note, 409)
    reportFilters(
      { ...description.defaultFilters, ...request.filters },
      description.filters || [],
      description.reportType === "Report Builder"
    )
    await reader.permission(description.doctype, "", "export")
    name = filename(request.report, request.format)
    mimeType = mimeTypes[request.format]
    if (embedded) {
      const report = await reader.runReport(request.report, request.filters)
      if (request.format === "pdf")
        blob = await reportPDF(report, companyLabel(context.company))
      else if (request.format === "csv") {
        const csv = [
          report.columns.map((c: any) => c.label),
          ...report.rows.map((r: any) =>
            report.columns.map((c: any) => r[c.fieldname])
          ),
        ]
          .map((row) =>
            row
              .map((v: any) => `"${spreadsheetText(v).replace(/"/g, '""')}"`)
              .join(",")
          )
          .join("\r\n")
        blob = Buffer.from(`\uFEFF${csv}`, "utf8")
      } else {
        const workbook = new ExcelJS.Workbook(),
          sheet = workbook.addWorksheet("Report")
        sheet.addRow(report.columns.map((c: any) => c.label))
        for (const row of report.rows)
          sheet.addRow(
            report.columns.map((c: any) =>
              typeof row[c.fieldname] === "number"
                ? row[c.fieldname]
                : spreadsheetText(row[c.fieldname])
            )
          )
        blob = Buffer.from(await workbook.xlsx.writeBuffer())
      }
    }
  } else {
    const params = new URLSearchParams({ doctype: "File", name: request.name })
    const file = (await erp.request(`/api/method/frappe.client.get?${params}`))
      .message
    if (
      file?.doctype !== "File" ||
      file.name !== request.name ||
      !file.attached_to_doctype ||
      !file.attached_to_name ||
      file.attached_to_doctype === "File"
    )
      throw new ERPNextError(
        "Only files attached to a permitted business record can be downloaded.",
        403
      )
    await reader.document(file.attached_to_doctype, file.attached_to_name)
    const ext = String(file.file_name || "")
      .split(".")
      .pop()!
      .toLowerCase()
    const allowed: Record<string, string> = {
      pdf: mimeTypes.pdf,
      csv: mimeTypes.csv,
      xlsx: mimeTypes.xlsx,
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      txt: "text/plain; charset=utf-8",
    }
    if (!allowed[ext])
      throw new ERPNextError(
        "Unsupported attachment format. Use PDF, CSV, XLSX, DOCX, PNG, JPEG or text.",
        400
      )
    const path = String(file.file_url || "")
    validateERPFilePath(path)
    name = filename(String(file.file_name).slice(0, -(ext.length + 1)), ext)
    mimeType = allowed[ext]
    if (embedded) blob = await erp.binary(path)
  }
  if (blob && blob.length > 6 * 1024 * 1024)
    throw new ERPNextError("ERP file exceeds the 6 MB delivery limit.", 413)
  const token = exportToken(request)
  return new ERPFileResult(
    {
      file: {
        uri: `erp://export/${token}`,
        name,
        mimeType,
        downloadUrl: `/api/erp/files?request=${token}&company=${encodeURIComponent(context.company)}`,
        note: "Access checked under current ERP permissions. Link delivery regenerates the export on access; attachment rendering depends on the MCP client.",
      },
    },
    blob
  )
}
