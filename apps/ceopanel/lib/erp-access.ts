import { ERPNextError } from "./erpnext-error"
import type { ModuleSchema } from "./workspace"

// Deliberately not an environment switch: enabling business writes requires a
// reviewed code change after the user explicitly requests it.
export const ERP_READ_ONLY = true
export const ERP_READ_ONLY_MESSAGE =
  "This application is read-only. Creating, editing and submitting ERP records is disabled."

export function denyERPWrite(): void {
  throw new ERPNextError(ERP_READ_ONLY_MESSAGE, 403)
}

export function readOnlySchema(schema: ModuleSchema): ModuleSchema {
  const fields = (items: ModuleSchema["fields"]): ModuleSchema["fields"] =>
    items.map((field) => ({
      ...field,
      readOnly: true,
      ...(field.fields ? { fields: fields(field.fields) } : {}),
    }))
  return {
    ...schema,
    fields: fields(schema.fields),
    permissions: {
      read: schema.permissions.read,
      create: false,
      edit: false,
      submit: false,
      cancel: false,
    },
    workflowActions: [],
  }
}
