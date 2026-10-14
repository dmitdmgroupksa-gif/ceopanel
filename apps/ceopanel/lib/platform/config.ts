import { readFileSync } from "node:fs"
import { z } from "zod"
import type { Field } from "../workspace"

const field: z.ZodType<Field> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    label: z.string(),
    type: z.enum([
      "text",
      "textarea",
      "number",
      "date",
      "select",
      "check",
      "link",
      "table",
    ]),
    required: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    allowOnSubmit: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    fields: z.array(field).optional(),
  }),
)
const moduleConfig = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string(),
  doctype: z.string().min(1),
  description: z.string().default(""),
  custom: z.boolean().default(false),
  companyField: z.string().optional(),
  fields: z.array(field),
  aiFields: z.array(z.string()).default([]),
  readValidated: z.boolean().default(false),
  writeValidated: z.boolean().default(false),
  fieldInput: z.boolean().default(false),
  workflowActions: z.array(z.string()).default([]),
  messageFields: z
    .object({ email: z.string().optional(), whatsapp: z.string().optional() })
    .optional(),
})
const schema = z.object({
  environment: z.enum(["staging", "production"]).default("staging"),
  aiDataApproved: z.boolean().default(false),
  modules: z.array(moduleConfig).default([]),
  agents: z
    .record(
      z.string(),
      z.object({
        roles: z.array(z.string()),
        modules: z.array(z.string()).default([]),
        reports: z.array(z.string()).default([]),
        approvers: z.array(z.string()).default([]),
      }),
    )
    .default({}),
  collections: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        roles: z.array(z.string()),
        uploadRoles: z.array(z.string()),
        approvedForAI: z.boolean().default(false),
      }),
    )
    .default([]),
  reports: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        erpName: z.string(),
        description: z.string().default(""),
        companyField: z.string().optional(),
        filters: z.array(field).default([]),
        readValidated: z.boolean().default(false),
        aiFields: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  dashboards: z
    .record(
      z.string(),
      z.object({
        report: z.string(),
        roles: z.array(z.string()),
        mappingValidated: z.boolean().default(false),
        periodFilters: z.object({ from: z.string(), to: z.string() }),
        metrics: z.array(
          z.object({
            label: z.string(),
            column: z.string(),
            aggregate: z.enum(["sum", "count", "average", "last"]),
            format: z.enum(["number", "currency", "percent"]).optional(),
          }),
        ),
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        chart: z
          .object({
            labelField: z.string(),
            series: z.array(z.object({ key: z.string(), label: z.string() })),
          })
          .optional(),
      }),
    )
    .default({}),
  channels: z
    .object({
      email: z.boolean().default(false),
      whatsapp: z.boolean().default(false),
      voice: z.boolean().default(false),
    })
    .default({ email: false, whatsapp: false, voice: false }),
  channelIdentities: z
    .array(
      z.object({
        channel: z.enum(["email", "whatsapp"]),
        address: z.string(),
        user: z.string(),
        company: z.string(),
        agent: z.string(),
      }),
    )
    .default([]),
})
export type PlatformConfig = z.infer<typeof schema>
export function parseConfig(input: unknown) {
  const config = schema.parse(input)
  if (new Set(config.modules.map((m) => m.id)).size !== config.modules.length)
    throw new Error("Duplicate module configuration")
  for (const m of config.modules) {
    if (m.writeValidated && !m.readValidated)
      throw new Error("Validate reads before writes")
    if (
      m.aiFields.some(
        (f) =>
          !m.fields.some((x) => x.name === f) ||
          /password|secret|token|api_key|bank_account|iban|salary|national_id/i.test(
            f,
          ),
      )
    )
      throw new Error(
        "AI fields must be approved, non-restricted configured fields",
      )
  }
  for (const r of config.reports)
    if (
      r.aiFields.some((f) =>
        /password|secret|token|api_key|bank_account|iban|salary|national_id/i.test(
          f,
        ),
      )
    )
      throw new Error("Restricted report AI fields")
  return config
}
export function platformConfig(): PlatformConfig {
  const path = process.env.PLATFORM_CONFIG_PATH
  return parseConfig(path ? JSON.parse(readFileSync(path, "utf8")) : {})
}
export function capabilities() {
  const config = platformConfig()
  return {
    database: !!process.env.DATABASE_URL,
    queue: !!process.env.REDIS_URL,
    ai:
      !!process.env.OPENAI_API_KEY &&
      !!process.env.OPENAI_MODEL &&
      config.aiDataApproved,
    embeddings: !!process.env.OPENAI_EMBEDDING_MODEL,
    environment: config.environment,
    channels: config.channels,
  }
}
