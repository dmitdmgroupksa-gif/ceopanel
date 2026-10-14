export const standardModules = [
  {
    id: "customers",
    title: "Customers",
    doctype: "Customer",
    description: "Customer records and company relationships.",
  },
  {
    id: "leads",
    title: "Leads",
    doctype: "Lead",
    description: "Lead records and sales qualification.",
  },
  {
    id: "quotations",
    title: "Quotations",
    doctype: "Quotation",
    description: "Prepare and manage customer quotations.",
  },
  {
    id: "sales-orders",
    title: "Sales Orders",
    doctype: "Sales Order",
    description: "Manage customer orders and fulfillment.",
  },
  {
    id: "invoices",
    title: "Invoices",
    doctype: "Sales Invoice",
    description: "Sales invoices and their document lifecycle.",
  },
  {
    id: "delivery-notes",
    title: "Delivery Notes",
    doctype: "Delivery Note",
    description: "Delivery documents and shipment records.",
  },
  {
    id: "items",
    title: "Items",
    doctype: "Item",
    description: "Your item catalog and product information.",
  },
  {
    id: "employees",
    title: "Employees",
    doctype: "Employee",
    description: "Employee records and custom HR fields.",
  },
  {
    id: "attendance",
    title: "Attendance",
    doctype: "Attendance",
    description: "Attendance records and approvals.",
  },
  {
    id: "payroll",
    title: "Payroll",
    doctype: "Payroll Entry",
    description: "Payroll entries and company payroll workflows.",
  },
  {
    id: "expenses",
    title: "Expenses",
    doctype: "Expense Claim",
    description: "Employee expenses and expense claims.",
  },
  {
    id: "purchase-orders",
    title: "Purchase Orders",
    doctype: "Purchase Order",
    description: "Supplier orders and purchasing activity.",
  },
  {
    id: "stock",
    title: "Stock",
    doctype: "Stock Entry",
    description: "Stock entries and inventory workflows.",
  },
  {
    id: "projects",
    title: "Projects",
    doctype: "Project",
    description: "Project records and operational work.",
  },
] as const

export type WorkspaceModule = {
  id: string
  title: string
  doctype: string
  description: string
  custom?: boolean
}
export type Field = {
  name: string
  label: string
  type:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "select"
    | "check"
    | "link"
    | "table"
  required?: boolean
  readOnly?: boolean
  allowOnSubmit?: boolean
  options?: string[]
  fields?: Field[]
}
export type FieldValue = string | number | boolean | null | RecordValues[]
export type RecordValues = { [field: string]: FieldValue }
export type WorkspaceRecord = {
  name: string
  modified: string
  docstatus?: number
  values: RecordValues
}
export type Permissions = {
  read: boolean
  create: boolean
  edit: boolean
  submit: boolean
  cancel: boolean
}
export type ModuleSchema = {
  module: WorkspaceModule
  ready: boolean
  fields: Field[]
  columns: { key: string; label: string }[]
  permissions: Permissions
  companyField?: string
  submittable: boolean
}
export type ReportDefinition = {
  id: string
  title: string
  description: string
  filters: Field[]
  companyField?: string
}
export type ReportData = {
  columns: { key: string; label: string }[]
  rows: Record<string, string | number | null>[]
}

export function pendingSchema(module: WorkspaceModule): ModuleSchema {
  return {
    module,
    ready: false,
    fields: [],
    columns: [
      { key: "name", label: "Record" },
      { key: "modified", label: "Updated" },
    ],
    permissions: {
      read: false,
      create: false,
      edit: false,
      submit: false,
      cancel: false,
    },
    submittable: false,
  }
}

export function validateValues(
  values: unknown,
  fields: Field[],
  submitted = false
): RecordValues {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("Enter valid record fields.")
  const input = values as Record<string, unknown>
  const output: RecordValues = {}
  for (const [name, value] of Object.entries(input)) {
    if (
      [
        "__proto__",
        "constructor",
        "prototype",
        "doctype",
        "docstatus",
        "owner",
        "modified",
        "ignore_permissions",
      ].includes(name)
    )
      throw new Error("This field cannot be changed here.")
    const field = fields.find((item) => item.name === name)
    if (!field || field.readOnly || (submitted && !field.allowOnSubmit))
      throw new Error("One or more fields cannot be changed here.")
    if (field.type === "table") {
      if (!Array.isArray(value) || value.length > 200)
        throw new Error(`${field.label} must contain at most 200 rows.`)
      output[name] = value.map((row) => validateValues(row, field.fields ?? []))
    } else if (field.type === "check") {
      if (typeof value !== "boolean")
        throw new Error(`${field.label} must be checked or unchecked.`)
      output[name] = value
    } else if (field.type === "number") {
      if (
        value !== null &&
        (typeof value !== "number" || !Number.isFinite(value))
      )
        throw new Error(`${field.label} must be a number.`)
      output[name] = value as number | null
    } else {
      if (value !== null && (typeof value !== "string" || value.length > 20000))
        throw new Error(`${field.label} contains an invalid value.`)
      if (
        field.type === "select" &&
        value &&
        !field.options?.includes(String(value))
      )
        throw new Error(`Choose a valid ${field.label}.`)
      if (
        field.type === "date" &&
        value &&
        !/^\d{4}-\d{2}-\d{2}$/.test(String(value))
      )
        throw new Error(`${field.label} must be a date.`)
      output[name] = value as string | null
    }
  }
  return output
}

export function requiredValues(values: RecordValues, fields: Field[]) {
  for (const field of fields) {
    if (field.readOnly) continue
    const value = values[field.name]
    if (
      field.required &&
      (value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0))
    )
      throw new Error(`${field.label} is required.`)
    if (field.type === "table" && Array.isArray(value))
      value.forEach((row) => requiredValues(row, field.fields ?? []))
  }
}
