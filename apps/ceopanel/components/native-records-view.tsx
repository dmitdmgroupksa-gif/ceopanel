"use client"
import { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { NativeReadTable, NativeValueInput } from "./native-read-controls"
import { NativeRecordInspector } from "./native-record-inspector"
import { useLocale } from "./locale-provider"
import { explorerRead } from "@/lib/explorer-client"
import { companyLabel, isAllCompanies } from "@/lib/company-scope"
import type {
  NativeSchema,
  NativeRecords,
  NativeField,
} from "@/lib/erp-native/explorer-types"

type Rule = { id: string; field: string; operator: string; value: unknown }
export function NativeRecordsView({
  schema,
  company,
  site,
}: {
  schema: NativeSchema
  company: string
  site: string
}) {
  const { t } = useLocale()
  const fields: NativeField[] = [
    { fieldname: "name", label: "Record", fieldtype: "Data" },
    { fieldname: "modified", label: "Last updated", fieldtype: "Datetime" },
    ...schema.fields.filter((f) => !f.fieldtype.startsWith("Table")),
  ]
  const hasCompany = fields.some(
    (f) => f.fieldname === "company" && f.options === "Company"
  )
  const [companyOnly, setCompanyOnly] = useState(hasCompany)
  const [selected, setSelected] = useState([
    "name",
    "modified",
    ...fields
      .filter((f) =>
        [
          "company",
          "status",
          "workflow_state",
          "subject",
          "title",
          "customer_name",
          "employee_name",
        ].includes(f.fieldname)
      )
      .slice(0, 4)
      .map((f) => f.fieldname),
  ])
  const [rules, setRules] = useState<Rule[]>([])
  const [search, setSearch] = useState("")
  const [result, setResult] = useState<NativeRecords | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [record, setRecord] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    void load()
    return () => controller.current?.abort()
  }, [schema.doctype, company])
  function changed() {
    controller.current?.abort()
    setBusy(false)
    setResult(null)
    setRecord("")
    setError("")
  }
  async function load(offset = 0) {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setResult(null)
    setError("")
    setRecord("")
    try {
      const normalized = rules.map((r) => ({
        ...r,
        value: Array.isArray(r.value)
          ? r.value
              .map((v) => (typeof v === "string" ? v.trim() : v))
              .filter((v) => v !== "")
          : r.value,
      }))
      if (
        normalized.some(
          (r) =>
            r.value === undefined ||
            r.value === "" ||
            (Array.isArray(r.value) && !r.value.length)
        )
      )
        throw new Error("Enter a value for every record filter.")
      if (
        normalized.some(
          (r) =>
            r.operator === "between" &&
            (!Array.isArray(r.value) || r.value.length !== 2)
        )
      )
        throw new Error("Between filters require two values.")
      const filters: unknown[][] = normalized.map((r) => [
        r.field,
        r.operator,
        r.value,
      ])
      if (companyOnly && hasCompany && !isAllCompanies(company))
        filters.push(["company", "=", company])
      const data = await explorerRead<NativeRecords>(
        company,
        {
          action: "records",
          doctype: schema.doctype,
          search,
          fields: selected.filter((f) => f !== "name"),
          filters,
          offset,
        },
        abort.signal
      )
      if (!abort.signal.aborted) setResult(data)
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message)
    } finally {
      if (!abort.signal.aborted) setBusy(false)
    }
  }
  function updateRule(id: string, update: Partial<Rule>) {
    changed()
    setRules((current) =>
      current.map((r) => (r.id === id ? { ...r, ...update } : r))
    )
  }
  return (
    <section className="min-w-0 space-y-5" aria-label={t("Record explorer")}>
      <div>
        <h2 className="break-words text-lg font-semibold">{schema.doctype}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{t(schema.scope)}</p>
      </div>
      <form
        className="space-y-4 rounded-lg border p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
      >
        <label className="block space-y-2 text-sm">
          <span>{t("Search records")}</span>
          <Input
            maxLength={200}
            value={search}
            disabled={busy}
            onChange={(e) => {
              changed()
              setSearch(e.target.value)
            }}
          />
        </label>
        {hasCompany && !isAllCompanies(company) && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={companyOnly}
              disabled={busy}
              onChange={(e) => {
                changed()
                setCompanyOnly(e.target.checked)
              }}
            />
            {t("Filter to selected company")}: {t(companyLabel(company))}
          </label>
        )}
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm">
            {t("Choose columns")}
          </summary>
          <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
            {fields.map((f) => (
              <label
                key={f.fieldname}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  disabled={
                    busy ||
                    f.fieldname === "name" ||
                    (!selected.includes(f.fieldname) && selected.length >= 28)
                  }
                  checked={selected.includes(f.fieldname)}
                  onChange={(e) => {
                    changed()
                    setSelected((current) =>
                      e.target.checked
                        ? [...current, f.fieldname]
                        : current.filter((n) => n !== f.fieldname)
                    )
                  }}
                />
                {t(f.label || f.fieldname)}
              </label>
            ))}
          </div>
        </details>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm">
            {t("Advanced filters")}
            {rules.length ? ` (${rules.length})` : ""}
          </summary>
          <div className="mt-3 space-y-3">
            {rules.map((rule) => {
              const field = fields.find((f) => f.fieldname === rule.field)!
              const valueField = {
                ...field,
                required: true,
                fieldtype: ["in", "not in", "between"].includes(rule.operator)
                  ? "MultiSelectList"
                  : rule.operator === "is"
                    ? "Select"
                    : field.fieldtype,
                ...(rule.operator === "is" ? { options: "set\nnot set" } : {}),
              }
              return (
                <div
                  key={rule.id}
                  className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-2 xl:grid-cols-4"
                >
                  <label className="space-y-2 text-sm">
                    <span>{t("Field")}</span>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2"
                      disabled={busy}
                      value={rule.field}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          field: e.target.value,
                          value: undefined,
                        })
                      }
                    >
                      {fields.map((f) => (
                        <option key={f.fieldname} value={f.fieldname}>
                          {f.label || f.fieldname}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>{t("Condition")}</span>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2"
                      disabled={busy}
                      value={rule.operator}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          operator: e.target.value,
                          value: undefined,
                        })
                      }
                    >
                      {[
                        "=",
                        "!=",
                        ">",
                        ">=",
                        "<",
                        "<=",
                        "like",
                        "not like",
                        "in",
                        "not in",
                        "between",
                        "is",
                      ].map((op) => (
                        <option key={op}>{op}</option>
                      ))}
                    </select>
                  </label>
                  <NativeValueInput
                    field={valueField}
                    value={rule.value}
                    disabled={busy}
                    onChange={(value) => updateRule(rule.id, { value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      changed()
                      setRules((current) =>
                        current.filter((r) => r.id !== rule.id)
                      )
                    }}
                  >
                    {t("Remove filter")}
                  </Button>
                </div>
              )
            })}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || rules.length >= 19}
                onClick={() => {
                  changed()
                  setRules((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      field: "name",
                      operator: "=",
                      value: undefined,
                    },
                  ])
                }}
              >
                {t("Add record filter")}
              </Button>
            </div>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {t(busy ? "Loading…" : "Load records")}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      {result && (
        <>
          <p className="text-xs text-muted-foreground">{t(result.note)}</p>
          <NativeReadTable
            columns={fields.filter((f) => selected.includes(f.fieldname))}
            rows={result.records}
            openRecord={setRecord}
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              {result.offset + (result.records.length ? 1 : 0)}–
              {result.offset + result.records.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || result.offset === 0}
                onClick={() => void load(Math.max(0, result.offset - 20))}
              >
                {t("Previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !result.hasMore}
                onClick={() => void load(result.offset + 20)}
              >
                {t("Next")}
              </Button>
            </div>
          </div>
        </>
      )}
      {record && (
        <NativeRecordInspector
          key={`${schema.doctype}:${record}`}
          name={record}
          schema={schema}
          company={company}
          site={site}
          onClose={() => setRecord("")}
        />
      )}
    </section>
  )
}
