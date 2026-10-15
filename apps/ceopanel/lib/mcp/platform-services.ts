import "server-only"
import { z } from "zod"
import type { BusinessPlugin } from "./types"
import { platformConfig } from "../platform/config"
import { database } from "../platform/db"
import { agentAccess } from "../platform/policy"
import { agents } from "../platform/catalog"
import { permittedEvidence } from "../platform/evidence"
import { client } from "../erpnext-server"
import { ERPNextError } from "../erpnext-client"
import { fieldInput, attachment } from "../platform/field-inputs"
import { voiceSession, speakRun } from "../platform/voice"
import { readExternal } from "../platform/external"
const id = z.string().min(1).max(140)
const file = z
  .object({
    filename: id,
    mime: z.string().max(140),
    base64: z.string().max(14000000),
  })
  .strict()
export async function binaryResult(response: Response) {
  return {
    base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
    contentType:
      response.headers.get("Content-Type") || "application/octet-stream",
    disposition: response.headers.get("Content-Disposition"),
  }
}
export function binaryResponse(
  result: Awaited<ReturnType<typeof binaryResult>>,
) {
  return new Response(Buffer.from(result.base64, "base64"), {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      ...(result.disposition
        ? { "Content-Disposition": result.disposition }
        : {}),
    },
  })
}
export async function fileArgument(file: File) {
  return {
    filename: file.name,
    mime: file.type,
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  }
}
export const platformPlugin: BusinessPlugin = {
  id: "platform",
  title: "Field operations and assistant services",
  version: "1.0.0",
  tools: [
    {
      name: "record_links",
      description: "Search native permitted link-field choices.",
      schema: z
        .object({ module: id, field: id, search: z.string().max(200) })
        .strict(),
      audience: "human",
      effect: "read",
      run: async (s, a) =>
        (await client()).bridge("links", { ...a, company: s.context.company }),
    },
    {
      name: "field_modules",
      description: "List validated field submission forms.",
      schema: z.object({}).strict(),
      audience: "human",
      effect: "read",
      run: async (s) =>
        Object.entries(platformConfig().agents)
          .filter(([, a]) => a.roles.some((r) => s.context.roles.includes(r)))
          .flatMap(([agent, a]) =>
            a.modules.flatMap((id) => {
              const m = platformConfig().modules.find(
                (m) =>
                  m.id === id &&
                  m.readValidated &&
                  m.writeValidated &&
                  m.fieldInput,
              )
              return m ? [{ agent, id: m.id, title: m.title }] : []
            }),
          ),
    },
    {
      name: "field_submit",
      description:
        "Submit a human field update and selected photos for approval.",
      schema: z
        .object({
          agent: id,
          payload: z.unknown(),
          requestId: z.uuid(),
          photos: z.array(file).max(5),
        })
        .strict(),
      audience: "human",
      effect: "proposal",
      run: (s, a) =>
        fieldInput(
          s.context,
          a.agent,
          a.payload,
          a.requestId,
          a.photos.map(
            (f: z.infer<typeof file>) =>
              new File([Buffer.from(f.base64, "base64")], f.filename, {
                type: f.mime,
              }),
          ),
        ),
    },
    {
      name: "attachment_read",
      description: "Download an authorized private field attachment.",
      schema: z.object({ id: z.uuid() }).strict(),
      audience: "human",
      effect: "read",
      run: async (s, a) => binaryResult(await attachment(s.context, a.id)),
    },
    {
      name: "external_read",
      description: "Read a validated external connector.",
      schema: z.object({ connector: id }).strict(),
      audience: "human",
      effect: "read",
      run: (s, a) => readExternal(s.context, a.connector),
    },
    {
      name: "agents_list",
      description: "List configured assistant profiles and current access.",
      schema: z.object({}).strict(),
      audience: "human",
      effect: "read",
      run: async (s) =>
        agents.map((a) => {
          let available = false
          try {
            agentAccess(s.context, a.id)
            available = true
          } catch {}
          return { ...a, available }
        }),
    },
    {
      name: "agent_run",
      description:
        "Start an assistant conversation using permission-scoped MCP tools.",
      schema: z
        .object({
          agent: id,
          prompt: z.string().min(1).max(12000),
          language: z.enum(["en", "ar"]).default("en"),
        })
        .strict(),
      audience: "human",
      effect: "proposal",
      run: async (s, a) =>
        (await import("../platform/agents")).runAgent(
          s.context,
          a.agent,
          a.prompt,
          a.language,
        ),
    },
    {
      name: "agent_history",
      description:
        "Read personal run history after rechecking evidence access.",
      schema: z.object({}).strict(),
      audience: "human",
      effect: "read",
      run: async (s) =>
        permittedEvidence(
          s.context,
          (
            await database().query(
              "SELECT id,agent,prompt,response,evidence,status,created_at FROM agent_runs WHERE company=$1 AND owner=$2 ORDER BY created_at DESC LIMIT 50",
              [s.context.company, s.context.user],
            )
          ).rows.filter((r) => {
            try {
              agentAccess(s.context, r.agent)
              return true
            } catch {
              return false
            }
          }),
        ),
    },
    {
      name: "voice_session",
      description: "Start a consented bilingual voice session.",
      schema: z
        .object({
          agent: id,
          sdp: z.string().min(1).max(50000),
          language: z.enum(["en", "ar"]),
        })
        .strict(),
      audience: "human",
      effect: "write",
      run: (s, a) => voiceSession(s.context, a.agent, a.sdp, a.language),
    },
    {
      name: "voice_speech",
      description: "Speak a permitted assistant answer.",
      schema: z.object({ id: z.uuid() }).strict(),
      audience: "human",
      effect: "write",
      run: async (s, a) => binaryResult(await speakRun(s.context, a.id)),
    },
    {
      name: "channel_inbox",
      description: "Read the user's permitted channel intake.",
      schema: z.object({}).strict(),
      audience: "human",
      effect: "read",
      run: async (s) =>
        (
          await database().query(
            "SELECT provider_id,channel,agent,content,created_at FROM channel_inbox WHERE company=$1 AND owner=$2 ORDER BY created_at DESC LIMIT 100",
            [s.context.company, s.context.user],
          )
        ).rows.filter((r) => {
          try {
            agentAccess(s.context, r.agent)
            return true
          } catch {
            return false
          }
        }),
    },
    {
      name: "knowledge_catalog",
      description: "Read permitted collections and document indexing status.",
      schema: z.object({}).strict(),
      audience: "human",
      effect: "read",
      run: async (s) => ({
        documents: await (
          await import("../platform/knowledge")
        ).documents(s.context),
        collections: platformConfig()
          .collections.filter(
            (c) =>
              c.approvedForAI &&
              c.roles.some((r) => s.context.roles.includes(r)),
          )
          .map((c) => ({
            id: c.id,
            title: c.title,
            upload: c.uploadRoles.some((r) => s.context.roles.includes(r)),
          })),
      }),
    },
    {
      name: "integration_inventory",
      description:
        "Inspect integration discovery and operational health as a System Manager.",
      schema: z.object({}).strict(),
      audience: "human",
      effect: "read",
      run: async (s) => {
        if (!s.context.roles.includes("System Manager"))
          throw new ERPNextError("Administrator access required.", 403)
        const { jobQueue } = await import("../platform/queue")
        return {
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
              [s.context.company],
            )
          ).rows,
        }
      },
    },
  ],
}
