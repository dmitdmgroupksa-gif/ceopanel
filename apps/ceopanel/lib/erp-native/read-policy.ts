import { ERPNextError } from "../erpnext-error"

// This enables business-data reads, never ERP mutations or access to credentials.
export function nativeReadEnabled() {
  return process.env.ERP_AI_READ_ENABLED === "true"
}
export function nativeReadRoles() {
  return (process.env.ERP_AI_READ_ROLES || "System Manager")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}
export function nativeReadAccess(context: { roles: string[] }) {
  return (
    nativeReadEnabled() &&
    nativeReadRoles().some((r) => context.roles.includes(r))
  )
}
export function requireNativeRead(context: { roles: string[] }) {
  if (!nativeReadAccess(context))
    throw new ERPNextError(
      "ERP-wide business reading is not enabled for this account.",
      403,
    )
}

// Settings and security infrastructure are not business records. Child tables
// are read only through their permitted parent, never independently.
export function safeBusinessType(meta: {
  name: string
  issingle?: number
  istable?: number
  module?: string
}) {
  return (
    !meta.issingle &&
    !meta.istable &&
    !/^(Core|Email|Integrations|OAuth|Website|Social|Printing)$/.test(
      meta.module || "",
    ) &&
    !/(?:Settings?|Credentials?|Secrets?|Tokens?|Passwords?|API Keys?|OAuth|Session|User Permission|DocPerm|Authentication|Webhook|Server Script|Client Script|Connected App|Integration Request)/i.test(
      meta.name,
    ) &&
    ![
      "User",
      "Role",
      "Has Role",
      "File",
      "DocType",
      "Report",
      "Workflow",
      "Custom Field",
      "Property Setter",
      "Error Log",
      "Activity Log",
      "Access Log",
      "Version",
      "Communication",
      "Comment",
      "Notification Log",
    ].includes(meta.name)
  )
}
export function secretField(name: string, type = "") {
  return (
    type === "Password" ||
    /password|passwd|secret|token|api_?key|authorization|private_?key|credential|connection_string/i.test(
      name,
    )
  )
}
