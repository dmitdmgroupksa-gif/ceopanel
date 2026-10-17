import type { Field, WorkspaceModule } from "../workspace"

export type NativeModule = {
  module: WorkspaceModule
  scope: "company" | "shared"
  fields: Field[]
  searchFields: string[]
}

// Explicit field allowlists checked against the installed ERP schema.
// No API keys, row data, child tables, write operations or AI field grants.
export const nativeModules: NativeModule[] = [
  {
    module: {
      id: "customers",
      title: "Customers",
      doctype: "Customer",
      description: "Shared ERP catalog under your account permissions.",
    },
    scope: "shared",
    fields: [
      {
        name: "customer_name",
        label: "Customer Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "customer_type",
        label: "Customer Type",
        type: "text",
        readOnly: true,
      },
      {
        name: "customer_group",
        label: "Customer Group",
        type: "text",
        readOnly: true,
      },
      {
        name: "territory",
        label: "Territory",
        type: "text",
        readOnly: true,
      },
      {
        name: "disabled",
        label: "Disabled",
        type: "check",
        readOnly: true,
      },
    ],
    searchFields: ["name", "customer_name"],
  },
  {
    module: {
      id: "leads",
      title: "Leads",
      doctype: "Lead",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "lead_name",
        label: "Full Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "company_name",
        label: "Organization Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
      {
        name: "territory",
        label: "Territory",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "lead_name"],
  },
  {
    module: {
      id: "opportunities",
      title: "Opportunities",
      doctype: "Opportunity",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "party_name",
        label: "Party",
        type: "text",
        readOnly: true,
      },
      {
        name: "transaction_date",
        label: "Opportunity Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
      {
        name: "opportunity_amount",
        label: "Opportunity Amount",
        type: "number",
        readOnly: true,
      },
      {
        name: "currency",
        label: "Currency",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "party_name"],
  },
  {
    module: {
      id: "quotations",
      title: "Quotations",
      doctype: "Quotation",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "party_name",
        label: "Party",
        type: "text",
        readOnly: true,
      },
      {
        name: "transaction_date",
        label: "Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "valid_till",
        label: "Valid Till",
        type: "date",
        readOnly: true,
      },
      {
        name: "base_net_total",
        label: "Net Total (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "party_name"],
  },
  {
    module: {
      id: "sales-orders",
      title: "Sales Orders",
      doctype: "Sales Order",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "customer_name",
        label: "Customer Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "transaction_date",
        label: "Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "delivery_date",
        label: "Delivery Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "base_net_total",
        label: "Net Total (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "per_delivered",
        label: "%  Delivered",
        type: "number",
        readOnly: true,
      },
      {
        name: "per_billed",
        label: "% Amount Billed",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "customer_name"],
  },
  {
    module: {
      id: "invoices",
      title: "Invoices",
      doctype: "Sales Invoice",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "customer_name",
        label: "Customer Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "posting_date",
        label: "Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "due_date",
        label: "Payment Due Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "base_net_total",
        label: "Net Total (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "currency",
        label: "Currency",
        type: "text",
        readOnly: true,
      },
      {
        name: "outstanding_amount",
        label: "Outstanding Amount",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "currency"],
  },
  {
    module: {
      id: "delivery-notes",
      title: "Delivery Notes",
      doctype: "Delivery Note",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "customer_name",
        label: "Customer Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "posting_date",
        label: "Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "base_net_total",
        label: "Net Total (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "customer_name"],
  },
  {
    module: {
      id: "items",
      title: "Items",
      doctype: "Item",
      description: "Shared ERP catalog under your account permissions.",
    },
    scope: "shared",
    fields: [
      {
        name: "item_name",
        label: "Item Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "item_group",
        label: "Item Group",
        type: "text",
        readOnly: true,
      },
      {
        name: "stock_uom",
        label: "Default Unit of Measure",
        type: "text",
        readOnly: true,
      },
      {
        name: "disabled",
        label: "Disabled",
        type: "check",
        readOnly: true,
      },
    ],
    searchFields: ["name", "item_name"],
  },
  {
    module: {
      id: "employees",
      title: "Employees",
      doctype: "Employee",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "employee_name",
        label: "Full Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "department",
        label: "Department",
        type: "text",
        readOnly: true,
      },
      {
        name: "designation",
        label: "Designation",
        type: "text",
        readOnly: true,
      },
      {
        name: "date_of_joining",
        label: "Date of Joining",
        type: "date",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "employee_name"],
  },
  {
    module: {
      id: "attendance",
      title: "Attendance",
      doctype: "Attendance",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "employee_name",
        label: "Employee Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "attendance_date",
        label: "Attendance Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "department",
        label: "Department",
        type: "text",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
      {
        name: "working_hours",
        label: "Working Hours",
        type: "number",
        readOnly: true,
      },
    ],
    searchFields: ["name", "employee_name"],
  },
  {
    module: {
      id: "expenses",
      title: "Expenses",
      doctype: "Expense Claim",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "employee_name",
        label: "Employee Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "posting_date",
        label: "Posting Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "total_claimed_amount",
        label: "Total Claimed Amount",
        type: "number",
        readOnly: true,
      },
      {
        name: "total_sanctioned_amount",
        label: "Total Sanctioned Amount",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "employee_name"],
  },
  {
    module: {
      id: "purchase-orders",
      title: "Purchase Orders",
      doctype: "Purchase Order",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "supplier_name",
        label: "Supplier Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "transaction_date",
        label: "Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "schedule_date",
        label: "Required By",
        type: "date",
        readOnly: true,
      },
      {
        name: "base_net_total",
        label: "Net Total (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "per_received",
        label: "% Received",
        type: "number",
        readOnly: true,
      },
      {
        name: "per_billed",
        label: "% Billed",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "supplier_name"],
  },
  {
    module: {
      id: "stock",
      title: "Stock Entries",
      doctype: "Stock Entry",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "stock_entry_type",
        label: "Stock Entry Type",
        type: "text",
        readOnly: true,
      },
      {
        name: "posting_date",
        label: "Posting Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "total_incoming_value",
        label: "Total Incoming Value (Receipt)",
        type: "number",
        readOnly: true,
      },
      {
        name: "total_outgoing_value",
        label: "Total Outgoing Value (Consumption)",
        type: "number",
        readOnly: true,
      },
    ],
    searchFields: ["name", "stock_entry_type"],
  },
  {
    module: {
      id: "projects",
      title: "Projects",
      doctype: "Project",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "project_name",
        label: "Project Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
      {
        name: "percent_complete",
        label: "% Completed",
        type: "number",
        readOnly: true,
      },
      {
        name: "expected_start_date",
        label: "Expected Start Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "expected_end_date",
        label: "Expected End Date",
        type: "date",
        readOnly: true,
      },
    ],
    searchFields: ["name", "project_name"],
  },
  {
    module: {
      id: "suppliers",
      title: "Suppliers",
      doctype: "Supplier",
      description: "Shared ERP catalog under your account permissions.",
    },
    scope: "shared",
    fields: [
      {
        name: "supplier_name",
        label: "Supplier Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "supplier_group",
        label: "Supplier Group",
        type: "text",
        readOnly: true,
      },
      {
        name: "supplier_type",
        label: "Supplier Type",
        type: "text",
        readOnly: true,
      },
      {
        name: "disabled",
        label: "Disabled",
        type: "check",
        readOnly: true,
      },
    ],
    searchFields: ["name", "supplier_name"],
  },
  {
    module: {
      id: "purchase-invoices",
      title: "Purchase Invoices",
      doctype: "Purchase Invoice",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "supplier_name",
        label: "Supplier Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "posting_date",
        label: "Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "due_date",
        label: "Due Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "base_net_total",
        label: "Net Total (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "currency",
        label: "Currency",
        type: "text",
        readOnly: true,
      },
      {
        name: "outstanding_amount",
        label: "Outstanding Amount",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "supplier_name"],
  },
  {
    module: {
      id: "leave-applications",
      title: "Leave Applications",
      doctype: "Leave Application",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "employee_name",
        label: "Employee Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "leave_type",
        label: "Leave Type",
        type: "text",
        readOnly: true,
      },
      {
        name: "from_date",
        label: "From Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "to_date",
        label: "To Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "total_leave_days",
        label: "Total Leave Days",
        type: "number",
        readOnly: true,
      },
    ],
    searchFields: ["name", "employee_name"],
  },
  {
    module: {
      id: "bank-accounts",
      title: "Bank Accounts",
      doctype: "Bank Account",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "account_name",
        label: "Account Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "bank",
        label: "Bank",
        type: "text",
        readOnly: true,
      },
      {
        name: "account",
        label: "Company Account",
        type: "text",
        readOnly: true,
      },
      {
        name: "is_company_account",
        label: "Is Company Account",
        type: "check",
        readOnly: true,
      },
      {
        name: "disabled",
        label: "Disabled",
        type: "check",
        readOnly: true,
      },
    ],
    searchFields: ["name", "account_name"],
  },
  {
    module: {
      id: "bank-transactions",
      title: "Bank Transactions",
      doctype: "Bank Transaction",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "date",
        label: "Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "bank_account",
        label: "Bank Account",
        type: "text",
        readOnly: true,
      },
      {
        name: "deposit",
        label: "Deposit",
        type: "number",
        readOnly: true,
      },
      {
        name: "withdrawal",
        label: "Withdrawal",
        type: "number",
        readOnly: true,
      },
      {
        name: "currency",
        label: "Currency",
        type: "text",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "bank_account"],
  },
  {
    module: {
      id: "payment-entries",
      title: "Payment Entries",
      doctype: "Payment Entry",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "party_name",
        label: "Party Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "posting_date",
        label: "Posting Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "payment_type",
        label: "Payment Type",
        type: "text",
        readOnly: true,
      },
      {
        name: "base_paid_amount",
        label: "Paid Amount (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "base_received_amount",
        label: "Received Amount (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "party_name"],
  },
  {
    module: {
      id: "journal-entries",
      title: "Journal Entries",
      doctype: "Journal Entry",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "posting_date",
        label: "Posting Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "voucher_type",
        label: "Entry Type",
        type: "text",
        readOnly: true,
      },
      {
        name: "total_debit",
        label: "Total Debit",
        type: "number",
        readOnly: true,
      },
      {
        name: "total_credit",
        label: "Total Credit",
        type: "number",
        readOnly: true,
      },
      {
        name: "remark",
        label: "Remark",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name"],
  },
  {
    module: {
      id: "purchase-receipts",
      title: "Purchase Receipts",
      doctype: "Purchase Receipt",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "supplier_name",
        label: "Supplier Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "posting_date",
        label: "Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "base_net_total",
        label: "Net Total (Company Currency)",
        type: "number",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "supplier_name"],
  },
  {
    module: {
      id: "warehouses",
      title: "Warehouses",
      doctype: "Warehouse",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "warehouse_name",
        label: "Warehouse Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "parent_warehouse",
        label: "Parent Warehouse",
        type: "text",
        readOnly: true,
      },
      {
        name: "is_group",
        label: "Is Group Warehouse",
        type: "check",
        readOnly: true,
      },
    ],
    searchFields: ["name", "warehouse_name"],
  },
  {
    module: {
      id: "assets",
      title: "Assets",
      doctype: "Asset",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "asset_name",
        label: "Asset Name",
        type: "text",
        readOnly: true,
      },
      {
        name: "asset_category",
        label: "Asset Category",
        type: "text",
        readOnly: true,
      },
      {
        name: "location",
        label: "Location",
        type: "text",
        readOnly: true,
      },
      {
        name: "purchase_date",
        label: "Purchase Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "asset_name"],
  },
  {
    module: {
      id: "facilities",
      title: "Facilities",
      doctype: "DM Facilities Management",
      description: "Read-only records for the selected company.",
      custom: true,
    },
    scope: "company",
    fields: [
      {
        name: "facility_detail",
        label: "Facility Detail",
        type: "text",
        readOnly: true,
      },
      {
        name: "facility_contract_status",
        label: "Facility Contract Status",
        type: "text",
        readOnly: true,
      },
      {
        name: "facility_type",
        label: "Facility Type",
        type: "text",
        readOnly: true,
      },
      {
        name: "rentdate_to",
        label: "Agreement Date To",
        type: "date",
        readOnly: true,
      },
      {
        name: "payment_due",
        label: "Payment Due",
        type: "date",
        readOnly: true,
      },
      {
        name: "com_lic_exp",
        label: "Commercial Licence Expiry",
        type: "date",
        readOnly: true,
      },
      {
        name: "fire_expiry",
        label: "Fire Maintanance Expiry",
        type: "date",
        readOnly: true,
      },
    ],
    searchFields: ["name"],
  },
  {
    module: {
      id: "it-assets",
      title: "IT Assets",
      doctype: "IT Asset",
      description: "Read-only records for the selected company.",
      custom: true,
    },
    scope: "company",
    fields: [
      {
        name: "employee",
        label: "Assigned To",
        type: "text",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "employee"],
  },
  {
    module: {
      id: "loan-applications",
      title: "Loan Applications",
      doctype: "Loan Application",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "applicant",
        label: "Applicant",
        type: "text",
        readOnly: true,
      },
      {
        name: "applicant_type",
        label: "Applicant Type",
        type: "text",
        readOnly: true,
      },
      {
        name: "posting_date",
        label: "Posting Date",
        type: "date",
        readOnly: true,
      },
      {
        name: "loan_amount",
        label: "Loan Amount",
        type: "number",
        readOnly: true,
      },
    ],
    searchFields: ["name", "applicant"],
  },
  {
    module: {
      id: "delivery-trips",
      title: "Delivery Trips",
      doctype: "Delivery Trip",
      description: "Read-only records for the selected company.",
    },
    scope: "company",
    fields: [
      {
        name: "departure_time",
        label: "Departure Time",
        type: "date",
        readOnly: true,
      },
      {
        name: "driver",
        label: "Driver",
        type: "text",
        readOnly: true,
      },
      {
        name: "vehicle",
        label: "Vehicle",
        type: "text",
        readOnly: true,
      },
      {
        name: "status",
        label: "Status",
        type: "text",
        readOnly: true,
      },
    ],
    searchFields: ["name", "driver"],
  },
]

export function nativeModule(id: string) {
  return nativeModules.find((entry) => entry.module.id === id)
}
