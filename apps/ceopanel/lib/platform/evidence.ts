import "server-only"
import { database } from "./db"
import { agentAccess, collectionAccess, type UserContext } from "./policy"
import { platformConfig } from "./config"
import { client } from "../erpnext-server"

type Item = {
  id: string
  agent: string
  evidence: unknown[]
  payload?: { module: string; name?: string; values?: Record<string, unknown> }
}
type Check = {
  id: string
  modules: { module: string; fields: string[]; names: string[] }[]
  reports: {
    report: string
    filters: Record<string, unknown>
    rows: unknown[]
    totalRow: unknown
  }[]
}
function payloadFields(values: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(values).flatMap(([key, value]) =>
    key === "_row_id"
      ? []
      : [
          `${prefix}${key}`,
          ...(Array.isArray(value)
            ? value.flatMap((row) =>
                row && typeof row === "object"
                  ? payloadFields(row, `${prefix}${key}.`)
                  : [],
              )
            : []),
        ],
  )
}

// Stored answers and review evidence must not bypass a later permission revocation.
// Missing legacy source metadata, unavailable ERP, and revoked fields fail closed.
export async function permittedEvidence<T extends Item>(
  context: UserContext,
  items: T[],
): Promise<T[]> {
  const config = platformConfig(),
    checks: Check[] = [],
    candidates: T[] = []
  const documentIds = items.flatMap((item) =>
    item.evidence
      .filter(
        (e): e is { id: string } =>
          !!e && typeof e === "object" && "id" in e && typeof e.id === "string",
      )
      .map((e) => e.id),
  )
  const documents = documentIds.length
    ? (
        await database().query(
          "SELECT id,collection FROM knowledge_documents WHERE company=$1 AND id=ANY($2::uuid[])",
          [
            context.company,
            documentIds.filter((id) =>
              /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
            ),
          ],
        )
      ).rows
    : []
  for (const item of items) {
    try {
      const { mapping } = agentAccess(context, item.agent)
      const check: Check = { id: item.id, modules: [], reports: [] }
      if (item.payload) {
        if (!mapping.modules.includes(item.payload.module)) continue
        check.modules.push({
          module: item.payload.module,
          fields: payloadFields(item.payload.values || {}).filter(
            (f) =>
              f !==
              config.modules.find((m) => m.id === item.payload!.module)
                ?.companyField,
          ),
          names: item.payload.name ? [item.payload.name] : [],
        })
      }
      for (const raw of item.evidence) {
        if (!raw || typeof raw !== "object") throw new Error("Unknown evidence")
        const e = raw as Record<string, unknown>
        if (typeof e.id === "string" && "chunk" in e) {
          const doc = documents.find((d) => d.id === e.id)
          if (!doc) throw new Error("Document unavailable")
          collectionAccess(context, doc.collection)
        } else if (Array.isArray(e.records)) {
          const module = config.modules.find(
            (m) =>
              m.readValidated &&
              mapping.modules.includes(m.id) &&
              (e.module ? e.module === m.id : e.source === m.doctype),
          )
          if (!module) throw new Error("Source unavailable")
          const fields = [
            ...new Set(e.records.flatMap((r) => Object.keys(r.values || {}))),
          ]
          if (fields.some((f) => !module.aiFields.includes(f)))
            throw new Error("Field approval revoked")
          check.modules.push({
            module: module.id,
            fields,
            names: e.records.map((r) => r.name),
          })
        } else if (Array.isArray(e.rows)) {
          const report = config.reports.find(
            (r) =>
              r.readValidated &&
              mapping.reports.includes(r.id) &&
              e.report === r.id,
          )
          if (
            !report ||
            !e.filters ||
            typeof e.filters !== "object" ||
            Array.isArray(e.filters) ||
            e.rows.some((r) =>
              Object.keys(r).some((f) => !report.aiFields.includes(f)),
            )
          )
            throw new Error("Report approval revoked")
          if (
            e.totalRow &&
            (typeof e.totalRow !== "object" ||
              Object.keys(e.totalRow).some((f) => !report.aiFields.includes(f)))
          )
            throw new Error("Report total fields revoked")
          check.reports.push({
            report: report.id,
            filters: e.filters as Record<string, unknown>,
            rows: e.rows,
            totalRow: e.totalRow ?? null,
          })
        } else throw new Error("Unknown evidence")
      }
      candidates.push(item)
      checks.push(check)
    } catch {
      /* A stored snapshot cannot grant access. */
    }
  }
  const requiresERP = checks.filter((c) => c.modules.length || c.reports.length)
  if (!requiresERP.length) return candidates
  try {
    const result = await (
      await client()
    ).bridge<{ id: string; allowed: boolean }[]>("evidence_access", {
      company: context.company,
      sources: requiresERP,
    })
    return candidates.filter(
      (item) =>
        !requiresERP.some((c) => c.id === item.id) ||
        result.some((r) => r.id === item.id && r.allowed === true),
    )
  } catch {
    return candidates.filter(
      (item) => !requiresERP.some((c) => c.id === item.id),
    )
  }
}
