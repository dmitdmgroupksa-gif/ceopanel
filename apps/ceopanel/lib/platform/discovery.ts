import { z } from "zod"
import type { Field } from "../workspace"
import { parseConfig, type PlatformConfig } from "./config"

type DiscoveredField = {
  name?: string | null
  label?: string | null
  type: string
  options?: string | null
  required?: number | boolean | null
  readOnly?: number | boolean | null
  allowOnSubmit?: number | boolean | null
  fields?: DiscoveredField[]
}
const field: z.ZodType<DiscoveredField> = z.lazy(() =>
  z.object({
    name: z.string().nullish(),
    label: z.string().nullish(),
    type: z.string(),
    options: z.string().nullish(),
    required: z.union([z.number(), z.boolean()]).nullish(),
    readOnly: z.union([z.number(), z.boolean()]).nullish(),
    allowOnSubmit: z.union([z.number(), z.boolean()]).nullish(),
    fields: z.array(field).optional(),
  }),
)
const inventory = z.object({
  schemas: z.record(
    z.string(),
    z.object({
      doctype: z.string(),
      state: z.enum(["available", "missing_doctype"]).optional(),
      fields: z.array(field),
    }),
  ),
})
const types: Record<string, Field["type"]> = {
  Data: "text",
  "Small Text": "textarea",
  Text: "textarea",
  "Long Text": "textarea",
  "Text Editor": "textarea",
  Int: "number",
  Float: "number",
  Currency: "number",
  Percent: "number",
  Date: "date",
  Check: "check",
  Link: "link",
  Select: "select",
  Table: "table",
}

export function draftFromDiscovery(config: PlatformConfig, input: unknown) {
  const wrapped = z.object({ discovery: z.unknown() }).safeParse(input)
  const discovered = inventory.parse(
    wrapped.success ? wrapped.data.discovery : input,
  )
  const warnings: string[] = []
  function fields(source: DiscoveredField[], module: string): Field[] {
    return source.flatMap((f) => {
      if (!f.name) return [] // Layout fields have no record field name.
      const type = types[f.type]
      if (!type) {
        warnings.push(
          `${module}.${f.name}: unsupported ${f.type}; review separately.`,
        )
        return []
      }
      const options =
        type === "select"
          ? (f.options || "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined
      if (type === "select" && !options?.length) {
        warnings.push(
          `${module}.${f.name}: select options need manual mapping.`,
        )
        return []
      }
      const children =
        type === "table"
          ? fields(f.fields || [], `${module}.${f.name}`)
          : undefined
      if (type === "table" && !children?.length) {
        warnings.push(
          `${module}.${f.name}: child schema needs discovery or manual mapping.`,
        )
        return []
      }
      return [
        {
          name: f.name,
          label: f.label || f.name,
          type,
          required: !!f.required,
          readOnly: !!f.readOnly,
          allowOnSubmit: !!f.allowOnSubmit,
          ...(options ? { options } : {}),
          ...(children ? { fields: children } : {}),
        },
      ]
    })
  }
  const modules = config.modules.map((m) => {
    const schema = discovered.schemas[m.id]
    const mapped =
      schema &&
      schema.doctype === m.doctype &&
      schema.state !== "missing_doctype"
    if (!mapped) warnings.push(`${m.id}: matching ERP schema unavailable.`)
    if (!m.companyField)
      warnings.push(
        `${m.id}: verify company scope, shared-master or parent-document permissions.`,
      )
    return {
      ...m,
      fields: mapped ? fields(schema.fields, m.id) : [],
      aiFields: [],
      readValidated: false,
      writeValidated: false,
      fieldInput: false,
      workflowActions: [],
      messageFields: undefined,
    }
  })
  const draft = parseConfig({
    ...config,
    environment: "staging",
    aiDataApproved: false,
    modules,
    reports: config.reports.map((r) => ({
      ...r,
      readValidated: false,
      aiFields: [],
    })),
    dashboards: Object.fromEntries(
      Object.entries(config.dashboards).map(([id, d]) => [
        id,
        { ...d, mappingValidated: false },
      ]),
    ),
    collections: config.collections.map((c) => ({
      ...c,
      approvedForAI: false,
    })),
    externalSources: config.externalSources.map((s) => ({
      ...s,
      readValidated: false,
    })),
    channels: { email: false, whatsapp: false, voice: false },
    channelIdentities: [],
  })
  return { draft, warnings }
}
