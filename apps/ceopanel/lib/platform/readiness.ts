import type { PlatformConfig } from "./config"

export type ReadinessCheck = {
  id: string
  phase: "foundation" | "reads" | "assistants" | "approvals" | "channels"
  state: "pass" | "blocked" | "disabled"
  title: string
  detail: string
}
type Environment = Record<string, string | undefined>
function origin(value: string | undefined, allowLocal = false) {
  try {
    const url = new URL(value || "")
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      !url.hostname.endsWith(".invalid") &&
      (url.protocol === "https:" ||
        (allowLocal && local && url.protocol === "http:"))
    )
  } catch {
    return false
  }
}
function connection(value: string | undefined, protocols: string[]) {
  try {
    return protocols.includes(new URL(value || "").protocol)
  } catch {
    return false
  }
}

// Configuration inventory only. No check here claims ERP permission or live model validation.
// Details contain instructions and counts, never environment values or account identities.
export function configurationReadiness(
  config: PlatformConfig,
  env: Environment,
) {
  const checks: ReadinessCheck[] = []
  function check(
    id: string,
    phase: ReadinessCheck["phase"],
    title: string,
    ready: boolean,
    detail: string,
    enabled = true,
  ) {
    checks.push({
      id,
      phase,
      title,
      state: !enabled ? "disabled" : ready ? "pass" : "blocked",
      detail,
    })
  }
  check(
    "config",
    "foundation",
    "Private platform configuration",
    !!env.PLATFORM_CONFIG_PATH,
    "Set PLATFORM_CONFIG_PATH to the reviewed private configuration file.",
  )
  check(
    "erp",
    "foundation",
    "ERP origin",
    origin(env.ERPNEXT_URL, config.environment === "staging"),
    "Set ERPNEXT_URL to the actual ERP origin. The setup placeholder cannot connect.",
  )
  check(
    "company",
    "foundation",
    "Exact ERP Company",
    !!env.ERPNEXT_COMPANY?.trim(),
    "Set ERPNEXT_COMPANY to the exact Company document name from ERPNext.",
  )
  check(
    "database",
    "foundation",
    "PostgreSQL configuration",
    env.DATABASE_URL
      ? connection(env.DATABASE_URL, ["postgres:", "postgresql:"])
      : !!env.PGHOST?.trim(),
    "Set DATABASE_URL or the PostgreSQL PGHOST/PGUSER/PGDATABASE settings; apply migrations next.",
  )
  check(
    "redis",
    "foundation",
    "Redis configuration",
    connection(env.REDIS_URL, ["redis:", "rediss:"]),
    "Set REDIS_URL for document jobs and worker maintenance.",
  )
  check(
    "receipts",
    "foundation",
    "ERP execution receipt secret",
    (env.ERPNEXT_RECEIPT_SECRET?.length || 0) >= 32,
    "Set a secret of at least 32 characters and configure the same secret privately on the ERP bridge.",
  )
  const modules = config.modules.filter(
    (m) => m.readValidated && m.fields.length,
  )
  const reports = config.reports.filter((r) => r.readValidated)
  const dashboards = Object.values(config.dashboards).filter(
    (d) => d.mappingValidated,
  )
  check(
    "modules",
    "reads",
    "Verified record schemas",
    modules.length > 0,
    "Verify enabled record schemas, company scope and allowed/denied users in staging.",
  )
  check(
    "reports",
    "reads",
    "Verified ERP reports",
    reports.length > 0,
    "Confirm enabled report filters, currencies, completeness and native total rows.",
  )
  check(
    "dashboards",
    "reads",
    "Dashboard report mappings",
    dashboards.length > 0,
    "Compare every enabled dashboard KPI with the native ERP report.",
  )
  const assigned = Object.values(config.agents).filter(
    (a) =>
      a.roles.length &&
      (a.modules.some((id) =>
        modules.some((m) => m.id === id && m.aiFields.length),
      ) ||
        a.reports.some((id) =>
          reports.some((r) => r.id === id && r.aiFields.length),
        )),
  )
  const assistantsEnabled =
    !!env.OPENAI_API_KEY ||
    !!env.OPENAI_MODEL ||
    Object.keys(config.agents).length > 0
  check(
    "agents",
    "assistants",
    "Agent roles and sources",
    assigned.length > 0,
    "Assign actual roles and enabled AI fields to agents, then evaluate company scenarios.",
    assistantsEnabled,
  )
  check(
    "ai",
    "assistants",
    "Approved AI configuration",
    !!env.OPENAI_API_KEY && !!env.OPENAI_MODEL && config.aiDataApproved,
    "Set server-side model credentials and approve the mapped fields before enabling AI.",
    assistantsEnabled,
  )
  check(
    "knowledge",
    "assistants",
    "Approved knowledge collections",
    !!env.OPENAI_API_KEY &&
      !!env.OPENAI_EMBEDDING_MODEL &&
      config.aiDataApproved &&
      config.collections.some((c) => c.approvedForAI && c.roles.length),
    "Approve collection roles/content and configure the embedding model before document ingestion.",
    config.collections.length > 0,
  )
  const writes = config.modules.filter((m) => m.writeValidated)
  check(
    "approvers",
    "approvals",
    "Mapped human approvers",
    writes.length > 0 &&
      writes.every((m) =>
        Object.values(config.agents).some(
          (a) =>
            a.roles.length && a.approvers.length && a.modules.includes(m.id),
        ),
      ),
    "Every enabled write module needs an assigned agent, actual roles and individual approver usernames.",
  )
  check(
    "public-origin",
    "channels",
    "Public portal origin",
    origin(env.CEOPANEL_ORIGIN),
    "Set CEOPANEL_ORIGIN to the deployed HTTPS origin before activating remote clients or signed callbacks.",
    config.environment === "production" ||
      env.MCP_EXTERNAL_ENABLED === "true" ||
      config.channels.whatsapp,
  )
  check(
    "mcp",
    "channels",
    "External MCP authentication",
    /^[a-fA-F0-9]{64}$/.test(env.MCP_AUTH_SECRET || "") &&
      config.aiDataApproved,
    "Set a 64-hex-character MCP_AUTH_SECRET and approve AI data before external MCP activation.",
    env.MCP_EXTERNAL_ENABLED === "true",
  )
  check(
    "email",
    "channels",
    "ERP email delivery",
    writes.some((m) => m.messageFields?.email),
    "Map verified ERP recipient fields, native email configuration and send roles; test approved delivery.",
    config.channels.email,
  )
  check(
    "whatsapp",
    "channels",
    "WhatsApp delivery configuration",
    !!env.WHATSAPP_ACCESS_TOKEN &&
      /^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID || "") &&
      /^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION || "") &&
      !!env.WHATSAPP_APP_SECRET &&
      !!env.WHATSAPP_VERIFY_TOKEN &&
      writes.some((m) => m.messageFields?.whatsapp),
    "Configure the Business API, signed callbacks and verified ERP recipient fields; test delivery.",
    config.channels.whatsapp,
  )
  check(
    "voice",
    "channels",
    "Voice models",
    !!env.OPENAI_API_KEY &&
      !!env.OPENAI_TRANSCRIPTION_MODEL &&
      !!env.OPENAI_SPEECH_MODEL &&
      !!env.OPENAI_SPEECH_VOICE,
    "Configure transcription and speech models, then evaluate Arabic/English audio on supported devices.",
    config.channels.voice,
  )
  return {
    verification: "configuration_inventory_only" as const,
    environment: config.environment,
    configured: checks.every((c) => c.state !== "blocked"),
    checks,
    liveAcceptanceRequired: true as const,
  }
}
