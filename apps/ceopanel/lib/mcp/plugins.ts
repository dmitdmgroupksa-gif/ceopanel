import "server-only"
import { z } from "zod"
import { agentService } from "./agent-services"
import type { BusinessPlugin, PluginTool } from "./types"
import * as workspace from "../workspace-server"
import {
  listProposals,
  review,
  editProposal,
  reconcile,
} from "../platform/proposals"
import { documents, upload, searchKnowledge } from "../platform/knowledge"
import { database, audit } from "../platform/db"
import { collectionAccess } from "../platform/policy"
import { ERPNextError } from "../erpnext-client"
import { loadDashboard } from "../dashboard-server"
import { loadSnapshot } from "../erpnext-server"
import { platformPlugin } from "./platform-services"
import { externalPlugin } from "./external-plugin"
import { erpReadPlugin } from "./erp-plugin"
const id = z.string().min(1).max(140),
  uuid = z.uuid(),
  values = z.record(z.string(), z.unknown())
const agentTool = (
  name: string,
  description: string,
  schema: z.ZodObject,
  effect: PluginTool["effect"] = "read",
): PluginTool => ({
  name,
  description,
  schema,
  effect,
  audience: "agent",
  run: (scope, args) => agentService(scope, name, args),
})
export const businessPlugins: BusinessPlugin[] = [
  erpReadPlugin,
  platformPlugin,
  externalPlugin,
  {
    id: "erp",
    title: "ERP records and workflows",
    version: "1.0.0",
    tools: [
      agentTool(
        "list_sources",
        "Discover the assigned validated module and report identifiers. Unconfigured sources are unavailable.",
        z.object({}).strict(),
      ),
      agentTool(
        "describe_module",
        "Discover approved fields and permitted operations before drafting.",
        z.object({ module: id }).strict(),
      ),
      agentTool(
        "read_records",
        "Read approved ERP fields with source records and timestamps. Paginated lists must not be used for financial totals.",
        z.object({ module: id, search: z.string().max(200) }).strict(),
      ),
      agentTool(
        "read_record",
        "Read the approved fields of one permitted ERP record by exact identity.",
        z.object({ module: id, name: id }).strict(),
      ),
      {
        name: "workspace_schema",
        description: "Read the current user's native ERP form schema.",
        schema: z.object({ module: id }).strict(),
        audience: "human",
        effect: "read",
        run: (s, a) => workspace.workspaceSchema(a.module, s.context.company),
      },
      {
        name: "workspace_list",
        description: "Browse permitted ERP records.",
        schema: z
          .object({
            module: id,
            search: z.string().max(200),
            offset: z.number().int().nonnegative(),
            limit: z.number().int().min(1).max(100),
          })
          .strict(),
        audience: "human",
        effect: "read",
        run: (s, a) => workspace.workspaceList(a.module, s.context.company, a),
      },
      {
        name: "workspace_record",
        description: "Read an ERP record for manual operations.",
        schema: z.object({ module: id, name: id }).strict(),
        audience: "human",
        effect: "read",
        run: (s, a) =>
          workspace.workspaceGet(a.module, a.name, s.context.company),
      },
      {
        name: "workspace_save",
        description:
          "Save an explicit human-entered change through native ERP validation.",
        schema: z
          .object({
            module: id,
            name: id.optional(),
            modified: id.optional(),
            values,
          })
          .strict(),
        audience: "human",
        effect: "write",
        run: (s, a) => workspace.workspaceSave(a.module, s.context.company, a),
      },
      {
        name: "workspace_action",
        description:
          "Perform an explicit human-requested native ERP workflow action.",
        schema: z
          .object({ module: id, name: id, action: id, modified: id })
          .strict(),
        audience: "human",
        effect: "write",
        run: (s, a) =>
          workspace.workspaceAction(
            a.module,
            a.name,
            s.context.company,
            a.action,
            a.modified,
          ),
      },
    ],
  },
  {
    id: "reports",
    title: "Reports and dashboards",
    version: "1.0.0",
    tools: [
      {
        name: "company_snapshot",
        description: "Read company summary under native ERP permissions.",
        schema: z.object({ days: z.number().int().min(1).max(366) }).strict(),
        audience: "human",
        effect: "read",
        run: (s, a) => loadSnapshot(a.days, s.context.company),
      },
      agentTool(
        "read_report",
        "Run a validated assigned report for financial totals or KPIs. Filters are a JSON object serialized as a string.",
        z.object({ report: id, filters: z.string().max(20000) }).strict(),
      ),
      {
        name: "workspace_report",
        description:
          "Run a verified native report with company-scoped filters.",
        schema: z.object({ report: id, filters: values }).strict(),
        audience: "human",
        effect: "read",
        run: (s, a) =>
          workspace.workspaceReport(a.report, s.context.company, a.filters),
      },
      {
        name: "dashboard_read",
        description: "Read a connected, permission-scoped CEO dashboard.",
        schema: z
          .object({ dashboard: id, days: z.number().int().min(1).max(366) })
          .strict(),
        audience: "human",
        effect: "read",
        run: (s, a) => loadDashboard(a.dashboard, a.days, s.context.company),
      },
    ],
  },
  {
    id: "proposals",
    title: "Drafts and human approvals",
    version: "1.0.0",
    tools: [
      agentTool(
        "propose_action",
        "Prepare a create, update, workflow or message proposal. Never executes a business change. Supply JSON payload and a stable request_id when retrying.",
        z
          .object({
            payload: z.string().min(2).max(100000),
            request_id: uuid.optional(),
          })
          .strict(),
        "proposal",
      ),
      {
        name: "proposals_list",
        description: "List proposals currently visible to the reviewing user.",
        schema: z.object({}).strict(),
        audience: "human",
        effect: "read",
        run: (s) => listProposals(s.context),
      },
      {
        name: "proposal_review",
        description:
          "Record an explicit human decision and execute only a validated approval.",
        schema: z
          .object({
            id: uuid,
            revision: z.number().int().positive(),
            decision: z.enum(["approve", "reject"]),
          })
          .strict(),
        audience: "human",
        effect: "approval",
        run: (s, a) => review(s.context, a.id, a.revision, a.decision),
      },
      {
        name: "proposal_edit",
        description:
          "Edit an owned draft; invalidates previous approval and evidence.",
        schema: z
          .object({
            id: uuid,
            revision: z.number().int().positive(),
            payload: z.unknown(),
          })
          .strict(),
        audience: "human",
        effect: "write",
        run: (s, a) => editProposal(s.context, a.id, a.revision, a.payload),
      },
      {
        name: "proposal_reconcile",
        description:
          "Reconcile an uncertain action using a signed receipt; never repeats the write.",
        schema: z.object({ id: uuid }).strict(),
        audience: "human",
        effect: "read",
        run: (s, a) => reconcile(s.context, a.id),
      },
    ],
  },
  {
    id: "knowledge",
    title: "Approved knowledge collections",
    version: "1.0.0",
    tools: [
      agentTool(
        "search_knowledge",
        "Search approved documents permitted for the current user and company.",
        z.object({ query: z.string().min(1).max(1000) }).strict(),
      ),
      {
        name: "knowledge_documents",
        description: "List permitted knowledge documents.",
        schema: z.object({}).strict(),
        audience: "human",
        effect: "read",
        run: (s) => documents(s.context),
      },
      {
        name: "knowledge_search",
        description: "Search permitted knowledge from the human interface.",
        schema: z.object({ query: z.string().min(1).max(1000) }).strict(),
        audience: "human",
        effect: "read",
        run: (s, a) => searchKnowledge(s.context, a.query),
      },
      {
        name: "knowledge_upload",
        description:
          "Upload an explicitly selected document to an approved collection.",
        schema: z
          .object({
            collection: id,
            filename: id,
            mime: z.string().max(140),
            base64: z.string().max(14000000),
          })
          .strict(),
        audience: "human",
        effect: "write",
        run: async (s, a) =>
          upload(
            s.context,
            a.collection,
            new File([Buffer.from(a.base64, "base64")], a.filename, {
              type: a.mime,
            }),
          ),
      },
      {
        name: "knowledge_retry",
        description:
          "Retry a failed document index job under upload permissions.",
        schema: z.object({ id: uuid }).strict(),
        audience: "human",
        effect: "write",
        run: async (s, a) => {
          const doc = (
            await database().query(
              "SELECT collection FROM knowledge_documents WHERE id=$1 AND company=$2",
              [a.id, s.context.company],
            )
          ).rows[0]
          if (!doc) throw new ERPNextError("Document access denied.", 403)
          collectionAccess(s.context, doc.collection, true)
          const result = await database().query(
            "UPDATE knowledge_documents SET status='queued' WHERE id=$1 AND status='failed' RETURNING id",
            [a.id],
          )
          if (!result.rowCount)
            throw new ERPNextError("Only failed documents can be retried.", 409)
          await audit(
            s.context.user,
            s.context.company,
            "knowledge.retry",
            a.id,
          )
          return { id: a.id, status: "queued" }
        },
      },
    ],
  },
  {
    id: "communications",
    title: "Messages and notifications",
    version: "1.0.0",
    tools: [
      {
        name: "notifications_list",
        description: "List personal company notifications.",
        schema: z.object({}).strict(),
        audience: "human",
        effect: "read",
        run: async (s) =>
          (
            await database().query(
              "SELECT id,title,href,read_at,created_at FROM notifications WHERE company=$1 AND owner=$2 ORDER BY created_at DESC LIMIT 100",
              [s.context.company, s.context.user],
            )
          ).rows,
      },
      {
        name: "notification_read",
        description: "Mark a personal notification as read.",
        schema: z.object({ id: uuid }).strict(),
        audience: "human",
        effect: "write",
        run: async (s, a) => {
          await database().query(
            "UPDATE notifications SET read_at=now() WHERE id=$1 AND owner=$2 AND company=$3",
            [a.id, s.context.user, s.context.company],
          )
          return { id: a.id, read: true }
        },
      },
    ],
  },
]
