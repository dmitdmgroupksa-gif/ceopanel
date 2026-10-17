import type { erpReader } from "./reader"
type Reader = ReturnType<typeof erpReader>
export type NativeSchema = Awaited<ReturnType<Reader["describe"]>>
export type NativeDocument = Awaited<ReturnType<Reader["document"]>>
export type NativeRecords = Awaited<ReturnType<Reader["search"]>>
export type NativeReport = Awaited<ReturnType<Reader["report"]>>
export type NativeReportResult = Awaited<ReturnType<Reader["runReport"]>>
export type NativeWorkflow = Awaited<ReturnType<Reader["approvals"]>>
export type NativeField = {
  fieldname: string
  label?: string
  fieldtype: string
  options?: string
  required?: boolean
}
export type Source = {
  kind: "doctype" | "report"
  name: string
  module?: string
  custom?: boolean
  reportType?: string
  doctype?: string
  canRead?: boolean
}
export type SourceResults = {
  results: Source[]
  totalMatches: number
  hasMore: boolean
  offset: number
  note: string
}
export type Attachments = {
  files: {
    name: string
    filename: string
    size: number | null
    private: boolean
  }[]
  hasMore: boolean
}
