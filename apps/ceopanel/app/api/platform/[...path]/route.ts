import { z } from "zod"
import { agents } from "@/lib/platform/catalog"
import { capabilities, platformConfig } from "@/lib/platform/config"
import { maxUpload } from "@/lib/upload-limits"
import { validSignature, receiveERPEvent } from "@/lib/platform/events"
import { validOrigin } from "@/lib/erpnext-server"
import { ERPNextError } from "@/lib/erpnext-client"
import {
  workspaceResponse,
  workspaceError,
  queryCompany,
} from "@/lib/workspace-http"
import { validMetaSignature, receiveWhatsApp } from "@/lib/platform/channels"
import { humanTool } from "@/lib/mcp/human-tool"
import { binaryResponse, fileArgument } from "@/lib/mcp/binary"
import { identity } from "@/lib/platform/auth"
import { configurationReadiness } from "@/lib/platform/readiness"
import { requestBody as bounded } from "@/lib/request-body"
import { nativeReadEnabled } from "@/lib/erp-native/read-policy"
import { ERP_READ_ONLY, denyERPWrite } from "@/lib/erp-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ path: string[] }> }
function error(cause: unknown) {
  return cause instanceof z.ZodError || cause instanceof SyntaxError
    ? workspaceResponse({ error: "Invalid request data." }, 400)
    : workspaceError(cause)
}
export async function GET(request: Request, { params }: Context) {
  try {
    const path = (await params).path.join("/")
    if (path === "health") {
      let ready = false
      try {
        ready = await (await import("@/lib/platform/health")).healthy()
      } catch {}
      return workspaceResponse({ ready }, ready ? 200 : 503)
    }
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
          configured: !!platformConfig().agents[a.id] || nativeReadEnabled(),
        })),
        modules: platformConfig().modules.filter((m) => m.readValidated).length,
      })
    const company = queryCompany(request)
    if (path === "readiness") {
      const context = await identity(company)
      if (!context.roles.includes("System Manager"))
        throw new ERPNextError("Administrator access required.", 403)
      return workspaceResponse(
        configurationReadiness(platformConfig(), process.env),
      )
    }
    const query = new URL(request.url).searchParams
    if (path.startsWith("attachments/"))
      return binaryResponse(
        await humanTool(company, "attachment_read", { id: path.slice(12) }),
      )
    if (path.startsWith("external/"))
      return workspaceResponse(
        await humanTool(company, "external_read", { connector: path.slice(9) }),
      )
    const reads: Record<string, string> = {
      inputs: "input_readiness",
      "external-sources": "external_sources",
      "field-modules": "field_modules",
      agents: "agents_list",
      proposals: "proposals_list",
      runs: "agent_history",
      knowledge: "knowledge_catalog",
      notifications: "notifications_list",
      inbox: "channel_inbox",
      inventory: "integration_inventory",
    }
    if (path === "links")
      return workspaceResponse(
        await humanTool(company, "record_links", {
          module: query.get("module"),
          field: query.get("field"),
          search: query.get("search") || "",
        }),
      )
    if (Object.hasOwn(reads, path))
      return workspaceResponse(await humanTool(company, reads[path]))
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
      return workspaceResponse(await receiveERPEvent(body), 202)
    }
    if (!validOrigin(request))
      throw new ERPNextError("Request must originate from this platform.", 403)
    if (
      ERP_READ_ONLY &&
      [
        "field-updates",
        "knowledge/upload",
        "knowledge/retry",
        "proposals/review",
        "proposals/edit",
        "notifications/read",
      ].includes(path)
    )
      denyERPWrite()
    const company = queryCompany(request)
    if (path === "field-updates" || path === "knowledge/upload") {
      await identity(company)
      const buffer = await bounded(request, maxUpload + 100000)
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type") || "" },
        body: new Uint8Array(buffer),
      }).formData()
      if (path === "field-updates") {
        const raw = form.get("payload")
        if (typeof raw !== "string")
          throw new ERPNextError("Record fields are required.", 400)
        return workspaceResponse(
          await humanTool(company, "field_submit", {
            agent: form.get("agent"),
            payload: JSON.parse(raw),
            requestId: form.get("requestId"),
            photos: await Promise.all(
              form
                .getAll("photos")
                .filter((f): f is File => f instanceof File)
                .map(fileArgument),
            ),
          }),
          202,
        )
      }
      const file = form.get("file"),
        collection = form.get("collection")
      if (!(file instanceof File) || typeof collection !== "string")
        throw new ERPNextError("Choose a collection and document.", 400)
      return workspaceResponse(
        await humanTool(company, "knowledge_upload", {
          collection,
          ...(await fileArgument(file)),
        }),
        202,
      )
    }
    const body = JSON.parse((await bounded(request, 100000)).toString("utf8"))
    if (path === "voice/speech")
      return binaryResponse(await humanTool(company, "voice_speech", body))
    const writes: Record<string, string> = {
      "voice/session": "voice_session",
      "agents/run": "agent_run",
      "proposals/review": "proposal_review",
      "proposals/reconcile": "proposal_reconcile",
      "proposals/edit": "proposal_edit",
      "knowledge/search": "knowledge_search",
      "knowledge/retry": "knowledge_retry",
      "notifications/read": "notification_read",
    }
    if (Object.hasOwn(writes, path))
      return workspaceResponse(await humanTool(company, writes[path], body))
    throw new ERPNextError("Platform endpoint not found.", 404)
  } catch (cause) {
    return error(cause)
  }
}
