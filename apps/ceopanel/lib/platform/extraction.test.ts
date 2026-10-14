import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import ExcelJS from "exceljs"
import { extractText, splitText, privatePath } from "./knowledge"
function pdf(text: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  let file = "%PDF-1.4\n",
    offsets = [0]
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(file))
    file += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const start = Buffer.byteLength(file)
  file += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${start}\n%%EOF`
  return Buffer.from(file)
}
describe("private approved document extraction", () => {
  it("extracts actual PDF text and workbook cells", async () => {
    expect(
      await extractText(pdf("Manager approval required"), "policy.pdf"),
    ).toContain("Manager approval required")
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Policies")
    sheet.addRow(["Department", "Policy"])
    sheet.addRow(["Sales", "Manager review"])
    expect(
      await extractText(
        Buffer.from(await workbook.xlsx.writeBuffer()),
        "policies.xlsx",
      ),
    ).toContain("Manager review")
  })
  it("refuses executable formats and filesystem traversal identities", async () => {
    await expect(
      extractText(Buffer.from("<script>"), "file.html"),
    ).rejects.toMatchObject({ status: 400 })
    expect(() => privatePath("../../credentials")).toThrow("identity")
    const chunks = splitText("x".repeat(4500))
    expect(chunks).toHaveLength(3)
    expect(chunks.every((chunk) => chunk.length <= 2000)).toBe(true)
  })
})
