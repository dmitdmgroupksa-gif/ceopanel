import { randomUUID } from "node:crypto"
import { z } from "zod"
import { identity, agentAccess } from "@/lib/platform/auth"
import { agents } from "@/lib/platform/catalog"
import { capabilities, platformConfig } from "@/lib/platform/config"
import { database, audit } from "@/lib/platform/db"
import { runAgent } from "@/lib/platform/agents"
import {
  listProposals,
  review,
  reconcile,
  editProposal,
} from "@/lib/platform/proposals"
import {
  upload,
  documents,
  searchKnowledge,
  maxUpload,
} from "@/lib/platform/knowledge"
import { validSignature, eventId } from "@/lib/platform/events"
import { client, validOrigin } from "@/lib/erpnext-server"
import { ERPNextError } from "@/lib/erpnext-client"
import {
  workspaceResponse,
  workspaceError,
  queryCompany,
} from "@/lib/workspace-http"
import { validMetaSignature, receiveWhatsApp } from "@/lib/platform/channels"
import { voiceSession, speakRun } from "@/lib/platform/voice"
import { readExternal } from "@/lib/platform/external"
import { fieldInput, attachment } from "@/lib/platform/field-inputs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ path: string[] }> }
async function bounded(request: Request, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new ERPNextError("Request exceeds the upload limit.", 413)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
function error(cause: unknown) {
  return cause instanceof z.ZodError || cause instanceof SyntaxError
    ? workspaceResponse({ error: "Invalid request data." }, 400)
    : workspaceError(cause)
}
export async function GET(request: Request, { params }: Context) {
  try {
    const path = (await params).path.join("/")
    if (path === "events/whatsapp") {
      const params = new URL(request.url).searchParams
      if (
        !process.env.WHATSAPP_VERIFY_TOKEN ||
        params.get("hub.verify_token") !== process.env.WHATSAPP_VERIFY_TOKEN ||
        params.get("hub.mode") !== "subscribe"
      )
        throw new ERPNextError("Webhook verification failed.", 403)
      return new Response(params.get("hub.challenge") || "", {
        headers: { "Cache-Control": "no-store" },
      })
    }
    if (path === "status")
      return workspaceResponse({
        ...capabilities(),
        agents: agents.map((a) => ({
          id: a.id,
          configured: !!platformConfig().agents[a.id],
        })),
        modules: platformConfig().modules.filter((m) => m.readValidated).length,
      })
    const context = await identity(queryCompany(request))
    if (path === "links") {
      const params = new URL(request.url).searchParams
      const input = z
        .object({
          module: z.string().min(1),
          field: z.string().min(1),
          search: z.string().max(200),
        })
        .parse({
          module: params.get("module"),
          field: params.get("field"),
          search: params.get("search") || "",
        })
      return workspaceResponse(
        await (
          await client()
        ).bridge("links", { ...input, company: context.company }),
      )
    }
    if (path.startsWith("attachments/"))
      return attachment(context, z.uuid().parse(path.slice(12)))
    if (path === "field-modules")
      return workspaceResponse(
        Object.entries(platformConfig().agents)
          .filter(([, a]) => a.roles.some((r) => context.roles.includes(r)))
          .flatMap(([agent, a]) =>
            a.modules
              .map((id) => {
                const module = platformConfig().modules.find(
                  (m) =>
                    m.id === id &&
                    m.readValidated &&
                    m.writeValidated &&
                    m.fieldInput,
                )
                return module
                  ? { agent, id: module.id, title: module.title }
                  : null
              })
              .filter(Boolean),
          ),
      )
    if (path.startsWith("external/"))
      return workspaceResponse(await readExternal(context, path.slice(9)))
    if (path === "agents")
      return workspaceResponse(
        agents.map((a) => {
          let available = false
          try {
            agentAccess(context, a.id)
            available = true
          } catch {}
          return { ...a, available }
        }),
      )
    if (path === "proposals")
      return workspaceResponse(await listProposals(context))
    if (path === "runs")
      return workspaceResponse(
        (
          await database().query(
            "SELECT id,agent,prompt,response,evidence,status,created_at FROM agent_runs WHERE company=$1 AND owner=$2 ORDER BY created_at DESC LIMIT 50",
            [context.company, context.user],
          )
        ).rows.filter((run) => {
          try {
            agentAccess(context, run.agent)
            return true
          } catch {
            return false
          }
        }),
      )
    if (path === "knowledge")
      return workspaceResponse({
        documents: await documents(context),
        collections: platformConfig()
          .collections.filter(
            (c) =>
              c.approvedForAI && c.roles.some((r) => context.roles.includes(r)),
          )
          .map((c) => ({
            id: c.id,
            title: c.title,
            upload: c.uploadRoles.some((r) => context.roles.includes(r)),
          })),
      })
    if (path === "notifications")
      return workspaceResponse(
        (
          await database().query(
            "SELECT id,title,href,read_at,created_at FROM notifications WHERE company=$1 AND owner=$2 ORDER BY created_at DESC LIMIT 100",
            [context.company, context.user],
          )
        ).rows,
      )
    if (path === "inbox") {
      const rows = (
        await database().query(
          "SELECT provider_id,channel,agent,content,created_at FROM channel_inbox WHERE company=$1 AND owner=$2 ORDER BY created_at DESC LIMIT 100",
          [context.company, context.user],
        )
      ).rows
      return workspaceResponse(
        rows.filter((row) => {
          try {
            agentAccess(context, row.agent)
            return true
          } catch {
            return false
          }
        }),
      )
    }
    if (path === "inventory") {
      if (!context.roles.includes("System Manager"))
        throw new ERPNextError("Administrator access required.", 403)
      const { jobQueue } = await import("@/lib/platform/queue")
      return workspaceResponse({
        config: platformConfig(),
        discovery: await (await client()).bridge("discovery"),
        sync: (await database().query("SELECT * FROM sync_state")).rows,
        queues: await jobQueue().getJobCounts(
          "waiting",
          "active",
          "failed",
          "completed",
        ),
        usage: (
          await database().query(
            "SELECT agent,status,count(*)::int AS runs FROM agent_runs WHERE company=$1 AND created_at>now()-interval '24 hours' GROUP BY agent,status",
            [context.company],
          )
        ).rows,
      })
    }
    throw new ERPNextError("Platform endpoint not found.", 404)
  } catch (cause) {
    return error(cause)
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const path = (await params).path.join("/")
    if (path === "events/whatsapp") {
      if (!platformConfig().channels.whatsapp)
        throw new ERPNextError("Channel awaits validation.", 409)
      const body = (await bounded(request, 200000)).toString("utf8")
      if (!validMetaSignature(body, request.headers.get("X-Hub-Signature-256")))
        throw new ERPNextError("Invalid channel signature.", 401)
      await receiveWhatsApp(JSON.parse(body))
      return workspaceResponse({ accepted: true })
    }
    if (path === "events/erpnext") {
      const body = (await bounded(request, 200000)).toString("utf8")
      if (
        !validSignature(
          body,
          request.headers.get("X-Frappe-Webhook-Signature"),
          process.env.ERPNEXT_WEBHOOK_SECRET,
        )
      )
        throw new ERPNextError("Invalid event signature.", 401)
      const event = JSON.parse(body)
      if (
        typeof event.doctype !== "string" ||
        typeof event.name !== "string" ||
        typeof event.modified !== "string"
      )
        throw new ERPNextError(
          "ERP event requires doctype, name and modified.",
          400,
        )
      const id = eventId(body)
      await database().query(
        "INSERT INTO event_inbox(id) VALUES($1) ON CONFLICT DO NOTHING",
        [id],
      )
      await database().query(
        "INSERT INTO sync_state(source,last_event_at) VALUES('erpnext',now()) ON CONFLICT(source) DO UPDATE SET last_event_at=now()",
      )
      return workspaceResponse({ accepted: true, id }, 202)
    }
    if (!validOrigin(request))
      throw new ERPNextError("Request must originate from this platform.", 403)
    const context = await identity(queryCompany(request))
    if (path === "field-updates") {
      const buffer = await bounded(request, maxUpload + 100000)
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type") || "" },
        body: new Uint8Array(buffer),
      }).formData()
      const agent = z
        .enum([
          "sales",
          "finance",
          "inventory",
          "procurement",
          "logistics",
          "hr",
          "facilities",
          "executive",
        ])
        .parse(form.get("agent"))
      const id = z.uuid().parse(form.get("requestId"))
      const raw = form.get("payload")
      if (typeof raw !== "string")
        throw new ERPNextError("Record fields are required.", 400)
      return workspaceResponse(
        await fieldInput(
          context,
          agent,
          JSON.parse(raw),
          id,
          form.getAll("photos").filter((f): f is File => f instanceof File),
        ),
        202,
      )
    }
    if (path === "knowledge/upload") {
      const buffer = await bounded(request, maxUpload + 100000)
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type") || "" },
        body: new Uint8Array(buffer),
      }).formData()
      const file = form.get("file"),
        collection = form.get("collection")
      if (!(file instanceof File) || typeof collection !== "string")
        throw new ERPNextError("Choose a collection and document.", 400)
      return workspaceResponse(await upload(context, collection, file), 202)
    }
    const body = JSON.parse((await bounded(request, 100000)).toString("utf8"))
    if (path === "voice/session") {
      const input = z
        .object({
          agent: z.string(),
          sdp: z.string().min(1).max(50000),
          language: z.enum(["en", "ar"]),
        })
        .parse(body)
      return workspaceResponse(
        await voiceSession(context, input.agent, input.sdp, input.language),
      )
    }
    if (path === "voice/speech")
      return speakRun(context, z.object({ id: z.uuid() }).parse(body).id)
    if (path === "agents/run") {
      const input = z
        .object({
          agent: z.string(),
          prompt: z.string(),
          language: z.enum(["en", "ar"]).default("en"),
        })
        .parse(body)
      return workspaceResponse(
        await runAgent(context, input.agent, input.prompt, input.language),
      )
    }
    if (path === "proposals/review") {
      const input = z
        .object({
          id: z.uuid(),
          revision: z.number().int().positive(),
          decision: z.enum(["approve", "reject"]),
        })
        .parse(body)
      return workspaceResponse(
        await review(context, input.id, input.revision, input.decision),
      )
    }
    if (path === "proposals/reconcile")
      return workspaceResponse(
        await reconcile(context, z.object({ id: z.uuid() }).parse(body).id),
      )
    if (path === "proposals/edit") {
      const input = z
        .object({
          id: z.uuid(),
          revision: z.number().int().positive(),
          payload: z.unknown(),
        })
        .parse(body)
      return workspaceResponse(
        await editProposal(context, input.id, input.revision, input.payload),
      )
    }
    if (path === "knowledge/search")
      return workspaceResponse(
        await searchKnowledge(
          context,
          z.object({ query: z.string().min(1).max(1000) }).parse(body).query,
        ),
      )
    if (path === "knowledge/retry") {
      const id = z.object({ id: z.uuid() }).parse(body).id
      const allowed = (await documents(context)).some((d) => d.id === id)
      if (!allowed) throw new ERPNextError("Document access denied.", 403)
      await database().query(
        "UPDATE knowledge_documents SET status='queued' WHERE id=$1 AND status='failed'",
        [id],
      )
      await audit(context.user, context.company, "knowledge.retry", id)
      return workspaceResponse({ id, status: "queued" })
    }
    if (path === "notifications/read") {
      const id = z.object({ id: z.uuid() }).parse(body).id
      await database().query(
        "UPDATE notifications SET read_at=now() WHERE id=$1 AND owner=$2 AND company=$3",
        [id, context.user, context.company],
      )
      return workspaceResponse({ id, read: true })
    }
    throw new ERPNextError("Platform endpoint not found.", 404)
  } catch (cause) {
    return error(cause)
  }
}
