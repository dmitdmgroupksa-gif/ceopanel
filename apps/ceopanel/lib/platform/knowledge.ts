import { createHash, randomUUID } from "node:crypto"
import { mkdir, writeFile, readFile, rm } from "node:fs/promises"
import path from "node:path"
import OpenAI from "openai"
import { database, transaction } from "./db"
import { collectionAccess, type UserContext } from "./policy"
import { platformConfig } from "./config"
import { jobQueue } from "./queue"
import { ERPNextError } from "../erpnext-client"
import { redactRestrictedText } from "./privacy"
export const maxUpload = 10 * 1024 * 1024
export function privatePath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid document identity")
  return path.join(
    process.env.DOCUMENT_STORAGE_PATH || ".private-documents",
    id,
  )
}
export function splitText(text: string) {
  const result: string[] = []
  for (let start = 0; start < text.length; start += 1600)
    result.push(text.slice(start, start + 2000))
  return result
}
export async function extractText(buffer: Buffer, name: string) {
  const ext = path.extname(name).toLowerCase()
  if (ext === ".pdf") {
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse({ data: buffer })
    try {
      return (await parser.getText()).text
    } finally {
      await parser.destroy()
    }
  }
  if (ext === ".xlsx") {
    const { default: ExcelJS } = await import("exceljs")
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as never)
    const lines: string[] = []
    workbook.eachSheet((sheet) => {
      lines.push(sheet.name)
      sheet.eachRow((row) =>
        lines.push(
          row.values instanceof Array
            ? row.values
                .map((v) =>
                  typeof v === "object" && v && "text" in v
                    ? v.text
                    : typeof v === "object"
                      ? JSON.stringify(v)
                      : v,
                )
                .join("\t")
            : "",
        ),
      )
    })
    return lines.join("\n")
  }
  if ([".txt", ".csv", ".md"].includes(ext)) return buffer.toString("utf8")
  throw new ERPNextError(
    "Upload a PDF, XLSX, CSV, Markdown or text document.",
    400,
  )
}
export async function upload(
  context: UserContext,
  collection: string,
  file: File,
) {
  collectionAccess(context, collection, true)
  if (!file.size || file.size > maxUpload)
    throw new ERPNextError("Document must be between 1 byte and 10 MB.", 413)
  if (
    ![".pdf", ".xlsx", ".csv", ".txt", ".md"].includes(
      path.extname(file.name).toLowerCase(),
    )
  )
    throw new ERPNextError("Unsupported document format.", 400)
  const buffer = Buffer.from(await file.arrayBuffer())
  const checksum = createHash("sha256").update(buffer).digest("hex")
  const id = randomUUID()
  const existing = await database().query(
    "SELECT id FROM knowledge_documents WHERE company=$1 AND collection=$2 AND checksum=$3",
    [context.company, collection, checksum],
  )
  if (existing.rowCount) return { id: existing.rows[0].id, duplicate: true }
  await mkdir(path.dirname(privatePath(id)), { recursive: true })
  await writeFile(privatePath(id), buffer, { flag: "wx", mode: 0o600 })
  let saved: { id: string; duplicate: boolean }
  try {
    saved = await transaction(async (db) => {
      const inserted = await db.query(
        "INSERT INTO knowledge_documents(id,company,owner,collection,title,filename,mime,checksum) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(company,collection,checksum) DO NOTHING RETURNING id",
        [
          id,
          context.company,
          context.user,
          collection,
          path.basename(file.name),
          path.basename(file.name),
          file.type || "application/octet-stream",
          checksum,
        ],
      )
      if (!inserted.rowCount) {
        const prior = (
          await db.query(
            "SELECT id FROM knowledge_documents WHERE company=$1 AND collection=$2 AND checksum=$3",
            [context.company, collection, checksum],
          )
        ).rows[0]
        return { id: prior.id, duplicate: true }
      }
      await db.query(
        "INSERT INTO audit_events(actor,company,event,target) VALUES($1,$2,'knowledge.uploaded',$3)",
        [context.user, context.company, id],
      )
      return { id, duplicate: false }
    })
  } catch (error) {
    await rm(privatePath(id))
    throw error
  }
  if (saved.duplicate) {
    await rm(privatePath(id), { force: true })
    return saved
  }
  // The document row is a durable outbox: reconciliation schedules uploads if Redis is unavailable.
  try {
    await jobQueue().add("document", { id }, { jobId: id })
  } catch {
    /* worker reconciliation recovers */
  }
  return { id, status: "queued" }
}
export async function documents(context: UserContext) {
  const allowed = platformConfig()
    .collections.filter(
      (c) => c.approvedForAI && c.roles.some((r) => context.roles.includes(r)),
    )
    .map((c) => c.id)
  return (
    await database().query(
      "SELECT id,title,collection,version,status,created_at FROM knowledge_documents WHERE company=$1 AND collection=ANY($2::text[]) ORDER BY created_at DESC LIMIT 200",
      [context.company, allowed],
    )
  ).rows
}
export async function ingest(id: string) {
  const doc = (
    await database().query("SELECT * FROM knowledge_documents WHERE id=$1", [
      id,
    ])
  ).rows[0]
  if (!doc || doc.status === "ready") return
  const config = platformConfig()
  if (
    !config.aiDataApproved ||
    !config.collections.find((c) => c.id === doc.collection)?.approvedForAI ||
    !process.env.OPENAI_EMBEDDING_MODEL ||
    !process.env.OPENAI_API_KEY
  )
    throw new ERPNextError(
      "Document AI processing awaits approval and embedding configuration.",
      409,
    )
  const text = redactRestrictedText(
    await extractText(await readFile(privatePath(id)), doc.filename),
  )
    .replace(/\u0000/g, "")
    .trim()
  if (!text || text.length > 300000)
    throw new Error("Document needs OCR or exceeds the text extraction limit")
  const chunks = splitText(text)
  const model = process.env.OPENAI_EMBEDDING_MODEL
  const result = await new OpenAI().embeddings.create({ model, input: chunks })
  await transaction(async (db) => {
    await db.query("DELETE FROM knowledge_chunks WHERE document_id=$1", [id])
    for (let index = 0; index < chunks.length; index++)
      await db.query(
        "INSERT INTO knowledge_chunks(document_id,chunk,content,embedding,model) VALUES($1,$2,$3,$4::vector,$5)",
        [
          id,
          index,
          chunks[index],
          JSON.stringify(result.data[index].embedding),
          model,
        ],
      )
    await db.query(
      "UPDATE knowledge_documents SET status='ready' WHERE id=$1",
      [id],
    )
  })
}
export async function searchKnowledge(context: UserContext, query: string) {
  const config = platformConfig()
  if (
    !config.aiDataApproved ||
    !process.env.OPENAI_EMBEDDING_MODEL ||
    !process.env.OPENAI_API_KEY
  )
    throw new ERPNextError("Knowledge search awaits AI configuration.", 409)
  const allowed = config.collections
    .filter(
      (c) => c.approvedForAI && c.roles.some((r) => context.roles.includes(r)),
    )
    .map((c) => c.id)
  if (!allowed.length) return []
  const model = process.env.OPENAI_EMBEDDING_MODEL
  const vector = (
    await new OpenAI().embeddings.create({
      model,
      input: redactRestrictedText(query),
    })
  ).data[0].embedding
  return (
    await database().query(
      "SELECT d.id,d.title,d.collection,d.version,d.created_at,k.chunk,k.content FROM knowledge_chunks k JOIN knowledge_documents d ON d.id=k.document_id WHERE d.company=$1 AND d.collection=ANY($2::text[]) AND d.status='ready' AND k.model=$3 ORDER BY k.embedding <=> $4::vector LIMIT 6",
      [context.company, allowed, model, JSON.stringify(vector)],
    )
  ).rows
}
