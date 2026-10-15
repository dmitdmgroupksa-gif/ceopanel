import "server-only"
import { randomUUID, createHash } from "node:crypto"
import { z } from "zod"
import { database, transaction } from "./db"
import {
  agentAccess,
  moduleAccess,
  companyValues,
  type UserContext,
} from "./policy"
import { platformConfig } from "./config"
import type { AgentId, ActionPayload, Proposal } from "./catalog"
import { client } from "../erpnext-server"
import { ERPNextError } from "../erpnext-client"
import { requiredValues, validateValues } from "../workspace"
import { verifiedReceipt, executionAuthorization } from "./receipts"
import { permittedEvidence } from "./evidence"

const moduleId = z.string().min(1).max(140)
const recordIdentity = {
  module: moduleId,
  name: z.string().min(1).max(140),
  modified: z.string().min(1).max(140),
}
export const actionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("create"),
      module: moduleId,
      values: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("update"),
      ...recordIdentity,
      values: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("workflow"),
      ...recordIdentity,
      action: z.string().min(1).max(140),
    })
    .strict(),
  z
    .object({
      kind: z.literal("message"),
      ...recordIdentity,
      channel: z.enum(["email", "whatsapp"]),
      recipient: z.string().min(1).max(254).optional(),
      text: z.string().trim().min(1).max(10000),
    })
    .strict(),
])
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
  if (
    schema.module?.id !== mapping.id ||
    schema.module.doctype !== mapping.doctype
  )
    throw new ERPNextError(
      "ERP schema does not match the configured module.",
      409,
    )
  if (!schema.permissions.read)
    throw new ERPNextError("Record access denied.", 403)
  if (payload.kind === "create" || payload.kind === "update") {
    if (!schema.permissions[payload.kind === "create" ? "create" : "edit"])
      throw new ERPNextError("Record write access denied.", 403)
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
    if (payload.kind === "update") validateRecordValues(record.docstatus === 1)
    if (
      payload.kind === "workflow" &&
      (!schema.permissions.edit ||
        !record.workflowActions?.includes(payload.action!))
    )
      throw new ERPNextError(
        "This native workflow transition is not currently available.",
        409,
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
  if (payload.kind === "create") validateRecordValues(false)
  return payload

  function validateRecordValues(submitted: boolean) {
    const values = companyValues(
      payload.values,
      schema.companyField,
      context.company,
    )
    try {
      const validated = validateValues(values, schema.fields, submitted)
      if (schema.companyField) validated[schema.companyField] = context.company
      if (payload.kind === "create") requiredValues(validated, schema.fields)
      payload.values = validated
    } catch (error) {
      throw new ERPNextError(
        error instanceof Error ? error.message : "Invalid record fields.",
        400,
      )
    }
  }
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
    .update(
      canonical(
        attachments.length
          ? {
              input,
              attachments: attachments.map(({ filename, mime, checksum }) => ({
                filename,
                mime,
                checksum,
              })),
            }
          : input,
      ),
    )
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
      return prior.status as Proposal["status"]
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
    return null
  })
  return {
    id,
    status: duplicate ?? "pending",
    approvalRequired: true,
    duplicate: duplicate !== null,
  }
}
export async function listProposals(context: UserContext) {
  const allowed = Object.keys(platformConfig().agents).filter((id) => {
    try {
      agentAccess(context, id)
      return true
    } catch {
      return false
    }
  })
  const reviewing = allowed.filter((id) =>
    canReview(context, { agent: id as AgentId, company: context.company }),
  )
  const rows = (
    await database().query<Proposal>(
      "SELECT * FROM proposals WHERE company=$1 AND agent=ANY($2::text[]) AND (proposer=$3 OR agent=ANY($4::text[])) ORDER BY created_at DESC LIMIT 200",
      [context.company, allowed, context.user, reviewing],
    )
  ).rows
  const visible = await permittedEvidence(
    context,
    rows.filter((p) => {
      try {
        agentAccess(context, p.agent)
        return p.proposer === context.user || canReview(context, p)
      } catch {
        return false
      }
    }),
  )
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
  id = id.toLowerCase()
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
    if (decision === "approve") {
      if (!(await permittedEvidence(context, [row])).length)
        throw new ERPNextError(
          "Proposal sources are no longer available to your account.",
          403,
        )
      if (row.payload.kind === "message" && row.payload.channel === "whatsapp")
        (await import("./channels")).assertWhatsAppConfigured()
      else if (!process.env.ERPNEXT_RECEIPT_SECRET)
        throw new ERPNextError(
          "ERP receipt verification awaits configuration.",
          409,
        )
      await validateAction(context, row.agent, row.payload)
    }
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
            payload: JSON.stringify(proposal.payload),
            authorization: executionAuthorization(
              id,
              context.company,
              JSON.stringify(proposal.payload),
              context.user,
            ),
          })
    if (proposal.payload.channel !== "whatsapp")
      verifiedReceipt(
        result,
        id,
        context.company,
        proposal.payload.module,
        proposal.payload.name,
        proposal.payload,
        context.user,
      )
    await confirmExecution(context, id, result, "proposal.executed")
    return { status: "executed", result }
  } catch {
    const uncertain = await database().query(
      "UPDATE proposals SET status='needs_reconciliation',updated_at=now() WHERE id=$1 AND status='executing' RETURNING id",
      [id],
    )
    if (!uncertain.rowCount) {
      const confirmed = (
        await database().query(
          "SELECT status,result FROM proposals WHERE id=$1",
          [id],
        )
      ).rows[0]
      if (confirmed?.status === "executed") return confirmed
    }
    throw new ERPNextError(
      "Execution outcome requires reconciliation. Do not repeat this action.",
      409,
    )
  }
}
export async function reconcile(context: UserContext, id: string) {
  id = id.toLowerCase()
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
      p.payload,
      p.approver,
    )
  await confirmExecution(context, id, result, "proposal.reconciled")
  return { status: "executed", result }
}
async function confirmExecution(
  context: UserContext,
  id: string,
  result: unknown,
  event: string,
) {
  await transaction(async (db) => {
    const updated = await db.query(
      "UPDATE proposals SET status='executed',result=$2,updated_at=now() WHERE id=$1 AND status IN ('executing','needs_reconciliation') RETURNING id",
      [id, JSON.stringify(result)],
    )
    if (updated.rowCount)
      await db.query(
        "INSERT INTO audit_events(actor,company,event,target) VALUES($1,$2,$3,$4)",
        [context.user, context.company, event, id],
      )
  })
}
export async function editProposal(
  context: UserContext,
  id: string,
  revision: number,
  input: unknown,
) {
  id = id.toLowerCase()
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
      "UPDATE proposals SET payload=$2,request_hash=$3,evidence='[]'::jsonb,revision=revision+1,status='pending',approver=NULL,result=NULL,updated_at=now() WHERE id=$1",
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
    const { agent } = agentAccess(context, row.agent)
    for (const owner of platformConfig().agents[row.agent]?.approvers ?? [])
      await db.query(
        "INSERT INTO notifications(id,owner,company,title,href) VALUES($1,$2,$3,$4,'/approvals')",
        [
          randomUUID(),
          owner,
          context.company,
          `${agent.name}: approval requested`,
        ],
      )
    return {
      id,
      revision: revision + 1,
      status: "pending",
      approvalRequired: true,
    }
  })
}
