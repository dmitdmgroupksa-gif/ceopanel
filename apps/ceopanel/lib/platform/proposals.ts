import "server-only"
import { randomUUID, createHash } from "node:crypto"
import { z } from "zod"
import { database, transaction, audit } from "./db"
import { agentAccess, moduleAccess, type UserContext } from "./policy"
import { platformConfig } from "./config"
import type { AgentId, ActionPayload, Proposal } from "./catalog"
import { client } from "../erpnext-server"
import { ERPNextError } from "../erpnext-client"
import { requiredValues, validateValues } from "../workspace"
import { verifiedReceipt } from "./receipts"

export const actionSchema = z
  .object({
    kind: z.enum(["create", "update", "workflow", "message"]),
    module: z.string().min(1),
    name: z.string().optional(),
    modified: z.string().optional(),
    values: z.record(z.string(), z.unknown()).optional(),
    action: z.string().optional(),
    channel: z.enum(["email", "whatsapp"]).optional(),
    recipient: z.string().optional(),
    text: z.string().max(10000).optional(),
  })
  .strict()
export function canReview(
  context: UserContext,
  proposal: Pick<Proposal, "agent" | "company">,
) {
  const mapping = platformConfig().agents[proposal.agent]
  return (
    proposal.company === context.company &&
    !!mapping?.approvers.includes(context.user) &&
    mapping.roles.some((r) => context.roles.includes(r))
  )
}
async function validateAction(
  context: UserContext,
  agent: AgentId,
  input: unknown,
) {
  const payload: ActionPayload = actionSchema.parse(input)
  const mapping = moduleAccess(context, agent, payload.module)
  if (payload.kind !== "message" && !mapping.writeValidated)
    throw new ERPNextError(
      "Writes for this module await staging validation.",
      409,
    )
  const erp = await client()
  const schema = await erp.bridge<import("../workspace").ModuleSchema>(
    "schema",
    { module: payload.module, company: context.company },
  )
  if (!schema.ready)
    throw new ERPNextError("Module schema is awaiting validation.", 409)
  if (!schema.permissions.read)
    throw new ERPNextError("Record access denied.", 403)
  if (payload.kind === "create" || payload.kind === "update") {
    if (!schema.permissions[payload.kind === "create" ? "create" : "edit"])
      throw new ERPNextError("Record write access denied.", 403)
    payload.values = validateValues(payload.values, schema.fields)
    if (schema.companyField)
      payload.values[schema.companyField] = context.company
    if (payload.kind === "create")
      requiredValues(
        payload.values as import("../workspace").RecordValues,
        schema.fields,
      )
  }
  if (payload.kind !== "create") {
    if (!payload.name || !payload.modified)
      throw new ERPNextError("Record identity and version are required.", 400)
    const record = await erp.bridge<import("../workspace").WorkspaceRecord>(
      "record",
      { module: payload.module, company: context.company, name: payload.name },
    )
    if (record.modified !== payload.modified)
      throw new ERPNextError("Record changed. Prepare a new proposal.", 409)
    if (record.docstatus === 2)
      throw new ERPNextError("Cancelled records cannot be changed.", 409)
    if (payload.kind === "message") {
      const field = payload.channel && mapping.messageFields?.[payload.channel]
      if (
        !field ||
        !payload.channel ||
        !platformConfig().channels[payload.channel] ||
        !payload.text?.trim()
      )
        throw new ERPNextError(
          "Outbound channels await recipient and workflow validation.",
          409,
        )
      const recipient = record.values[field]
      if (
        typeof recipient !== "string" ||
        (payload.recipient && payload.recipient !== recipient)
      )
        throw new ERPNextError(
          "Recipient must match the verified ERP contact.",
          403,
        )
      if (
        payload.channel === "email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
      )
        throw new ERPNextError("ERP contact email is invalid.", 409)
      if (
        payload.channel === "whatsapp" &&
        !/^\+[1-9]\d{7,14}$/.test(recipient)
      )
        throw new ERPNextError(
          "ERP contact phone requires international format.",
          409,
        )
      payload.recipient = recipient
    }
    if (payload.kind === "update")
      payload.values = validateValues(
        payload.values,
        schema.fields,
        record.docstatus === 1,
      )
  }
  if (
    payload.kind === "workflow" &&
    (!payload.action || !mapping.workflowActions.includes(payload.action))
  )
    throw new ERPNextError(
      "This native workflow action is not configured.",
      409,
    )
  return payload
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
export async function propose(
  context: UserContext,
  agent: AgentId,
  input: unknown,
  evidence: unknown[] = [],
  requestId?: string,
  attachments: {
    id: string
    filename: string
    mime: string
    checksum: string
  }[] = [],
) {
  const { agent: definition } = agentAccess(context, agent)
  const requestHash = createHash("sha256")
    .update(canonical(input))
    .digest("hex")
  if (requestId) {
    const prior = (
      await database().query(
        "SELECT id,status,proposer,company,agent,request_hash FROM proposals WHERE id=$1",
        [requestId],
      )
    ).rows[0]
    if (prior) {
      if (
        prior.proposer !== context.user ||
        prior.company !== context.company ||
        prior.agent !== agent ||
        prior.request_hash !== requestHash
      )
        throw new ERPNextError(
          "Request identity conflicts with another proposal.",
          409,
        )
      return {
        id: prior.id,
        status: prior.status,
        approvalRequired: true,
        duplicate: true,
      }
    }
  }
  const payload = await validateAction(context, agent, input)
  const id = requestId || randomUUID()
  const duplicate = await transaction(async (db) => {
    const inserted = await db.query(
      "INSERT INTO proposals(id,company,proposer,agent,department,payload,evidence,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id",
      [
        id,
        context.company,
        context.user,
        agent,
        definition.department,
        JSON.stringify(payload),
        JSON.stringify(evidence),
        requestHash,
      ],
    )
    if (!inserted.rowCount) {
      const prior = (
        await db.query("SELECT * FROM proposals WHERE id=$1", [id])
      ).rows[0]
      if (
        prior.proposer !== context.user ||
        prior.company !== context.company ||
        prior.agent !== agent ||
        prior.request_hash !== requestHash
      )
        throw new ERPNextError(
          "Request identity conflicts with another proposal.",
          409,
        )
      return true
    }
    for (const file of attachments)
      await db.query(
        "INSERT INTO proposal_attachments(id,proposal,filename,mime,checksum) VALUES($1,$2,$3,$4,$5)",
        [file.id, id, file.filename, file.mime, file.checksum],
      )
    await db.query(
      "INSERT INTO audit_events(actor,company,event,target) VALUES($1,$2,'proposal.created',$3)",
      [context.user, context.company, id],
    )
    for (const owner of platformConfig().agents[agent]?.approvers ?? [])
      await db.query(
        "INSERT INTO notifications(id,owner,company,title,href) VALUES($1,$2,$3,$4,'/approvals')",
        [
          randomUUID(),
          owner,
          context.company,
          `${definition.name}: approval requested`,
        ],
      )
    return false
  })
  return { id, status: "pending", approvalRequired: true, duplicate }
}
export async function listProposals(context: UserContext) {
  const rows = (
    await database().query<Proposal>(
      "SELECT * FROM proposals WHERE company=$1 ORDER BY created_at DESC LIMIT 200",
      [context.company],
    )
  ).rows
  const visible = rows.filter((p) => {
    try {
      agentAccess(context, p.agent)
      return p.proposer === context.user || canReview(context, p)
    } catch {
      return false
    }
  })
  const attachments = (
    await database().query(
      "SELECT id,proposal,filename FROM proposal_attachments WHERE proposal=ANY($1::uuid[])",
      [visible.map((p) => p.id)],
    )
  ).rows
  return visible.map((p) => ({
    ...p,
    canReview: canReview(context, p),
    attachments: attachments.filter((a) => a.proposal === p.id),
  }))
}
export async function review(
  context: UserContext,
  id: string,
  revision: number,
  decision: "approve" | "reject",
) {
  if (decision === "approve" && !process.env.ERPNEXT_RECEIPT_SECRET)
    throw new ERPNextError(
      "ERP receipt verification awaits configuration.",
      409,
    )
  const proposal = await transaction(async (db) => {
    const row = (
      await db.query<Proposal>(
        "SELECT * FROM proposals WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0]
    if (!row || !canReview(context, row))
      throw new ERPNextError("Approval access denied.", 403)
    if (row.status !== "pending" || row.revision !== revision)
      throw new ERPNextError(
        "This proposal has already changed or been reviewed.",
        409,
      )
    if (decision === "approve")
      await validateAction(context, row.agent, row.payload)
    await db.query(
      "UPDATE proposals SET status=$2,approver=$3,updated_at=now() WHERE id=$1",
      [id, decision === "reject" ? "rejected" : "executing", context.user],
    )
    await db.query(
      "INSERT INTO audit_events(actor,company,event,target,details) VALUES($1,$2,$3,$4,$5)",
      [
        context.user,
        context.company,
        `proposal.${decision}`,
        id,
        JSON.stringify({ revision }),
      ],
    )
    return row
  })
  if (decision === "reject") return { status: "rejected" }
  // Never place an approving user's SID in Redis or a persisted job.
  // The ERP bridge durably receipts this ID. Unknown outcomes are reconciled, not retried.
  try {
    const result =
      proposal.payload.kind === "message" &&
      proposal.payload.channel === "whatsapp"
        ? await (await import("./channels")).sendWhatsApp(id, proposal.payload)
        : await (
            await client()
          ).bridge("execute_proposal", {
            proposal: id,
            company: context.company,
            payload: proposal.payload,
          })
    if (proposal.payload.channel !== "whatsapp")
      verifiedReceipt(
        result,
        id,
        context.company,
        proposal.payload.module,
        proposal.payload.name,
      )
    await database().query(
      "UPDATE proposals SET status='executed',result=$2,updated_at=now() WHERE id=$1",
      [id, JSON.stringify(result)],
    )
    await audit(context.user, context.company, "proposal.executed", id)
    return { status: "executed", result }
  } catch {
    await database().query(
      "UPDATE proposals SET status='needs_reconciliation',updated_at=now() WHERE id=$1",
      [id],
    )
    throw new ERPNextError(
      "Execution outcome requires reconciliation. Do not repeat this action.",
      409,
    )
  }
}
export async function reconcile(context: UserContext, id: string) {
  const p = (
    await database().query<Proposal>("SELECT * FROM proposals WHERE id=$1", [
      id,
    ])
  ).rows[0]
  if (
    !p ||
    !canReview(context, p) ||
    !["executing", "needs_reconciliation"].includes(p.status)
  )
    throw new ERPNextError("Reconciliation access denied.", 403)
  const result =
    p.payload.channel === "whatsapp"
      ? (
          await database().query(
            "SELECT provider_id AS \"messageId\",status FROM message_deliveries WHERE proposal=$1 AND status IN ('accepted','sent','delivered','read')",
            [id],
          )
        ).rows[0]
      : await (
          await client()
        ).bridge("proposal_receipt", { proposal: id, company: context.company })
  if (!result)
    throw new ERPNextError(
      "No confirmed ERP receipt. An administrator must investigate before retrying.",
      409,
    )
  if (p.payload.channel !== "whatsapp")
    verifiedReceipt(
      result,
      id,
      context.company,
      p.payload.module,
      p.payload.name,
    )
  await database().query(
    "UPDATE proposals SET status='executed',result=$2,updated_at=now() WHERE id=$1",
    [id, JSON.stringify(result)],
  )
  await audit(context.user, context.company, "proposal.reconciled", id)
  return { status: "executed", result }
}
export async function editProposal(
  context: UserContext,
  id: string,
  revision: number,
  input: unknown,
) {
  return transaction(async (db) => {
    const row = (
      await db.query<Proposal>(
        "SELECT * FROM proposals WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0]
    if (
      !row ||
      row.proposer !== context.user ||
      row.company !== context.company
    )
      throw new ERPNextError("Proposal edit access denied.", 403)
    if (
      !["pending", "rejected"].includes(row.status) ||
      row.revision !== revision
    )
      throw new ERPNextError("This proposal can no longer be edited.", 409)
    const payload = await validateAction(context, row.agent, input)
    await db.query(
      "UPDATE proposals SET payload=$2,request_hash=$3,revision=revision+1,status='pending',approver=NULL,result=NULL,updated_at=now() WHERE id=$1",
      [
        id,
        JSON.stringify(payload),
        createHash("sha256").update(canonical(input)).digest("hex"),
      ],
    )
    await db.query(
      "INSERT INTO audit_events(actor,company,event,target) VALUES($1,$2,'proposal.edited',$3)",
      [context.user, context.company, id],
    )
    return {
      id,
      revision: revision + 1,
      status: "pending",
      approvalRequired: true,
    }
  })
}
