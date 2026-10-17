import { describe, expect, it, vi } from "vitest"
import {
  erpExport,
  exportToken,
  parseExportToken,
  reportPDF,
  spreadsheetText,
} from "./files"
import { ERPNextClient } from "../erpnext-client"
import type { UserContext } from "../platform/policy"
import { PDFParse } from "pdf-parse"

const context: UserContext = {
  user: "reader",
  roles: ["System Manager"],
  company: "Company A",
  currency: "SAR",
  siteUrl: "https://erp.example",
  companies: [],
}
describe("ERP file delivery", () => {
  it("round trips bounded export descriptors without credentials or public file access", () => {
    const request = {
      kind: "document",
      doctype: "Quotation",
      name: "Q-1",
      format: "pdf",
      language: "en",
    } as const
    expect(parseExportToken(exportToken(request))).toEqual(request)
    expect(() => parseExportToken("../../etc/passwd")).toThrow(
      "Invalid ERP file request",
    )
    expect(() => parseExportToken("a".repeat(24001))).toThrow(
      "Invalid ERP file request",
    )
  })
  it("blocks spreadsheet formula injection but preserves numeric negative values", () => {
    for (const value of [
      '=HYPERLINK("evil")',
      " +CMD",
      "\t@SUM(A1:A2)",
      "-1+1",
    ])
      expect(spreadsheetText(value)).toBe(`'${value}`)
    expect(spreadsheetText(-12)).toBe("-12")
  })
  it("generates a real PDF with native rows and a complete-result limit", async () => {
    const report = {
      report: "Test Report",
      columns: [{ fieldname: "amount", label: "Amount" }],
      rows: [{ amount: 10 }],
      filters: { company: "Company A" },
      totalRowIncluded: false,
    }
    const pdf = await reportPDF(report, context.company)
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
    expect(pdf.length).toBeGreaterThan(1000)
    await expect(
      reportPDF(
        { ...report, rows: Array.from({ length: 501 }, () => ({ amount: 1 })) },
        context.company,
      ),
    ).rejects.toMatchObject({ status: 413 })
  })
  it("blocks arbitrary URLs, RPC endpoints and traversal before sending credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(),
      erp = new ERPNextClient(context.siteUrl, "private-sid", fetcher)
    for (const path of [
      "https://evil.example/file",
      "/api/method/frappe.client.delete",
      "/private/files/../api/method/evil",
      "/files/%2e%2e/evil",
      "/files/%252e%252e/evil",
      "/files/name%255csecret.pdf",
      "/files/file?x=1",
    ])
      await expect(erp.binary(path)).rejects.toMatchObject({ status: 400 })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("preserves Latin text when a PDF line also contains Arabic", async () => {
    const pdf = await reportPDF(
      {
        report: "Mixed report",
        columns: [{ fieldname: "subject", label: "Subject" }],
        rows: [{ subject: "المبيعات Test 10" }],
        filters: {},
        totalRowIncluded: false,
      },
      "Company A",
    )
    const parser = new PDFParse({ data: pdf })
    try {
      const text = (await parser.getText()).text
      expect(text).toContain("Subject")
      expect(text).toContain("Test 10")
      expect(text).toMatch(/[\u0600-\u06ff]/)
    } finally {
      await parser.destroy()
    }
  })
  it("streams a bounded ERP PDF and refuses redirects or oversized files", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("%PDF-1.7 file"))
      .mockResolvedValueOnce(new Response(new Uint8Array(20)))
    const erp = new ERPNextClient(context.siteUrl, "private-sid", fetcher)
    expect(
      (
        await erp.binary(
          "/api/method/frappe.utils.print_format.download_pdf?doctype=Quotation&name=Q-1",
        )
      )
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-")
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      cache: "no-store",
      headers: { Cookie: "sid=private-sid" },
    })
    await expect(erp.binary("/files/test.pdf", 10)).rejects.toMatchObject({
      status: 413,
    })
  })
  it("denies print export without native print permission even when the document is readable", async () => {
    const fetcher = vi.fn<typeof fetch>(async (raw) => {
      const url = new URL(String(raw))
      if (url.pathname.endsWith("has_permission"))
        return Response.json({
          message: {
            has_permission: url.searchParams.get("perm_type") === "read",
          },
        })
      if (url.pathname.endsWith("getdoctype"))
        return Response.json({
          docs: [{ name: "Quotation", module: "Selling", fields: [] }],
        })
      return Response.json({ message: { name: "Q-1", doctype: "Quotation" } })
    })
    await expect(
      erpExport(
        new ERPNextClient(context.siteUrl, "sid", fetcher),
        context,
        { kind: "document", doctype: "Quotation", name: "Q-1" },
        true,
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(
      fetcher.mock.calls.some(([u]) => String(u).includes("download_pdf")),
    ).toBe(false)
  })
  it.each(["/files/%", "/private/files/%252e%252e/secret.pdf"])(
    "rejects an unsafe attachment path even when creating only a link: %s",
    async (path) => {
      const fetcher = vi.fn<typeof fetch>(async (raw) => {
        const url = new URL(String(raw))
        if (url.pathname.endsWith("has_permission"))
          return Response.json({ message: { has_permission: true } })
        if (url.pathname.endsWith("getdoctype"))
          return Response.json({
            docs: [{ name: "Quotation", module: "Selling", fields: [] }],
          })
        return Response.json({
          message:
            url.searchParams.get("doctype") === "File"
              ? {
                  doctype: "File",
                  name: "FILE-1",
                  attached_to_doctype: "Quotation",
                  attached_to_name: "Q-1",
                  file_name: "quote.pdf",
                  file_url: path,
                }
              : { doctype: "Quotation", name: "Q-1" },
        })
      })
      await expect(
        erpExport(
          new ERPNextClient(context.siteUrl, "sid", fetcher),
          context,
          { kind: "attachment", name: "FILE-1" },
          false,
        ),
      ).rejects.toMatchObject({ status: 400 })
    },
  )
})
