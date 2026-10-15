import "server-only"
import { randomUUID, createHash } from "node:crypto"
import { mkdir, writeFile, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { database } from "./db"
import { propose, canReview, actionSchema } from "./proposals"
import { privatePath, maxUpload } from "./knowledge"
import type { UserContext } from "./policy"
import type { AgentId, Proposal } from "./catalog"
import { ERPNextError } from "../erpnext-client"
import { agentAccess, moduleAccess } from "./policy"
export async function fieldInput(
  context: UserContext,
  agent: AgentId,
  payload: unknown,
  requestId: string,
  files: File[],
) {
  const input = actionSchema.parse(payload)
  const mapping = moduleAccess(context, agent, input.module)
  if (input.kind !== "create" || !mapping.fieldInput || !mapping.writeValidated)
    throw new ERPNextError("Field input is not enabled for this module.", 403)
  if (
    files.length > 5 ||
    files.reduce((total, f) => total + f.size, 0) > maxUpload
  )
    throw new ERPNextError("Upload at most five photos totaling 10 MB.", 413)
  const attachments: {
    id: string
    filename: string
    mime: string
    checksum: string
  }[] = []
  try {
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer())
      const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const jpeg =
        bytes.length > 3 &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255
      if (!png && !jpeg)
        throw new ERPNextError("Field photos must be PNG or JPEG images.", 400)
      const id = randomUUID()
      await mkdir(path.dirname(privatePath(id)), { recursive: true })
      await writeFile(privatePath(id), bytes, { flag: "wx", mode: 0o600 })
      attachments.push({
        id,
        filename: path.basename(file.name),
        mime: png ? "image/png" : "image/jpeg",
        checksum: createHash("sha256").update(bytes).digest("hex"),
      })
    }
    const result = await propose(
      context,
      agent,
      payload,
      [],
      requestId,
      attachments,
    )
    if (result.duplicate)
      for (const file of attachments)
        await rm(privatePath(file.id), { force: true })
    return result
  } catch (error) {
    for (const file of attachments)
      await rm(privatePath(file.id), { force: true })
    throw error
  }
}
export async function attachment(context: UserContext, id: string) {
  const row = (
    await database().query(
      "SELECT a.*,p.company,p.proposer,p.agent FROM proposal_attachments a JOIN proposals p ON p.id=a.proposal WHERE a.id=$1",
      [id],
    )
  ).rows[0]
  if (
    !row ||
    row.company !== context.company ||
    (row.proposer !== context.user && !canReview(context, row as Proposal))
  )
    throw new ERPNextError("Attachment access denied.", 403)
  agentAccess(context, row.agent)
  return new Response(new Uint8Array(await readFile(privatePath(id))), {
    headers: {
      "Content-Type": row.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
