import type { Company } from "./model"

// Reserved UI scope, never an ERP Company document or an extra permission grant.
export const ALL_COMPANIES = "__all_companies__"
export const isAllCompanies = (company: string | null | undefined) =>
  company === ALL_COMPANIES
export function companyLabel(company: string | null | undefined) {
  return isAllCompanies(company) ? "All Companies" : company || ""
}
export function scopedCompanies(context: {
  company: string
  companies: Company[]
}) {
  return isAllCompanies(context.company)
    ? context.companies.map((c) => c.name)
    : [context.company]
}
