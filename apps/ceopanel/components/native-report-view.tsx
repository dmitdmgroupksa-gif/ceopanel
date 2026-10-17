"use client"
import { useEffect, useRef, useState } from "react"
import { Download, LoaderCircle } from "lucide-react"
import { Button } from "./ui/button"
import { useLocale } from "./locale-provider"
import { NativeReadTable, NativeValueInput } from "./native-read-controls"
import { explorerRead, downloadERPFile } from "@/lib/explorer-client"
import { useSession } from "./session-provider"
import type {
  NativeReport,
  NativeReportResult,
  NativeField,
} from "@/lib/erp-native/explorer-types"

export function NativeReportView({
  description,
  company,
}: {
  description: NativeReport
  company: string
}) {
  const { t } = useLocale()
  const { context } = useSession()
  const [filters, setFilters] = useState<Record<string, unknown>>({
    ...description.defaultFilters,
    ...(description.filters.some(
      (f) => f.fieldname === "company" && f.options === "Company"
    ) && !Object.hasOwn(description.defaultFilters, "company")
      ? { company }
      : {}),
  })
  const [optional, setOptional] = useState<string[]>([
    ...Object.keys(description.defaultFilters),
    ...description.filters
      .filter((f) => f.fieldname === "company" && f.options === "Company")
      .map((f) => f.fieldname),
  ])
  const [result, setResult] = useState<NativeReportResult | null>(null)
  const [runFilters, setRunFilters] = useState<Record<string, unknown> | null>(
    null
  )
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const definitions: NativeField[] = description.filters
  const visible = definitions.filter(
    (f) => f.required || optional.includes(f.fieldname)
  )
  async function run(event: React.FormEvent) {
    event.preventDefault()
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setBusy("report")
    setError("")
    setResult(null)
    setRunFilters(null)
    const input = Object.fromEntries(
      Object.entries(filters)
        .map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value
                .map((v) => (typeof v === "string" ? v.trim() : v))
                .filter((v) => v !== "")
            : value,
        ])
        .filter(
          ([, v]) =>
            v !== undefined &&
            v !== "" &&
            v !== null &&
            !(Array.isArray(v) && !v.length)
        )
    )
    try {
      if (
        definitions.some(
          (f) =>
            f.fieldtype === "DateRange" &&
            Object.hasOwn(input, f.fieldname) &&
            (!Array.isArray(input[f.fieldname]) ||
              input[f.fieldname].length !== 2)
        )
      )
        throw new Error("Date range filters require two dates.")
      const data = await explorerRead<NativeReportResult>(
        company,
        { action: "run-report", report: description.name, filters: input },
        abort.signal
      )
      if (!abort.signal.aborted) {
        setResult(data)
        setRunFilters(input)
      }
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message)
    } finally {
      if (!abort.signal.aborted) setBusy("")
    }
  }
  async function download(
    format: "pdf" | "csv" | "xlsx",
    selectedFilters = runFilters
  ) {
    if (!runFilters) return
    const abort = new AbortController()
    controller.current = abort
    setBusy(format)
    setError("")
    try {
      await downloadERPFile(
        company,
        {
          kind: "report",
          report: description.name,
          filters: selectedFilters!,
          format,
        },
        abort.signal
      )
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message)
    } finally {
      if (!abort.signal.aborted) setBusy("")
    }
  }
  function edit(name: string, value: unknown) {
    setFilters((current) => ({ ...current, [name]: value }))
    setResult(null)
    setRunFilters(null)
    setError("")
  }
  return (
    <section className="min-w-0 space-y-5" aria-label={t("Report results")}>
      <div>
        <h2 className="break-words text-lg font-semibold">
          {description.name}
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(description.scope)}
        </p>
      </div>
      <form
        onSubmit={(event) => void run(event)}
        className="space-y-4 rounded-lg border p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((field) => (
            <div key={field.fieldname} className="space-y-2">
              <NativeValueInput
                companies={context?.companies}
                field={field}
                value={filters[field.fieldname]}
                disabled={!!busy}
                onChange={(value) => edit(field.fieldname, value)}
              />
              {!field.required && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() => {
                    setOptional((fields) =>
                      fields.filter((f) => f !== field.fieldname)
                    )
                    edit(field.fieldname, undefined)
                  }}
                >
                  {t("Remove filter")}
                </Button>
              )}
            </div>
          ))}
        </div>
        {definitions.some(
          (f) => !f.required && !optional.includes(f.fieldname)
        ) && (
          <label className="block space-y-2 text-sm">
            <span>{t("Add report filter")}</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              disabled={!!busy}
              value=""
              onChange={(e) => {
                if (e.target.value)
                  setOptional((current) => [...current, e.target.value])
              }}
            >
              <option value="">{t("Choose")}</option>
              {definitions
                .filter((f) => !f.required && !optional.includes(f.fieldname))
                .map((f) => (
                  <option key={f.fieldname} value={f.fieldname}>
                    {f.label || f.fieldname}
                  </option>
                ))}
            </select>
          </label>
        )}
        <p className="text-xs text-muted-foreground">{t(description.note)}</p>
        {"savedFilters" in description && (
          <details className="text-xs">
            <summary className="cursor-pointer">
              {t("Saved report filters")}
            </summary>
            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(description.savedFilters, null, 2)}
            </pre>
          </details>
        )}
        <Button disabled={!!busy} type="submit">
          {busy === "report" && <LoaderCircle className="animate-spin" />}
          {t("Run report")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      {result?.companyResults && (
        <div className="space-y-6">
          {result.companyResults.map((part) => (
            <section
              key={part.company}
              className="space-y-3 rounded-lg border p-4"
            >
              <h3 className="font-semibold">
                {part.company} · {part.currency}
              </h3>
              {part.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {t(part.error)}
                </p>
              ) : (
                part.result && (
                  <>
                    <p className="text-sm">
                      {part.result.rowCount} {t("Rows returned")}
                    </p>
                    <div className="flex gap-2">
                      {(["csv", "xlsx", "pdf"] as const).map((format) => (
                        <Button
                          key={format}
                          variant="outline"
                          size="sm"
                          disabled={!!busy}
                          onClick={() => void download(format, part.filters)}
                        >
                          {format.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                    <NativeReadTable
                      columns={part.result.columns}
                      rows={part.result.rows}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(part.result.note)}
                    </p>
                  </>
                )
              )}
            </section>
          ))}
        </div>
      )}
      {result && !result.companyResults && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {result.rowCount} {t("Rows returned")}
              {result.totalRowIncluded
                ? ` · ${t("Includes the ERP total row")}`
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["csv", "xlsx", "pdf"] as const).map((format) => (
                <Button
                  key={format}
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void download(format)}
                >
                  {busy === format ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Downloads rerun these filters using your current ERP permissions."
            )}
          </p>
          <NativeReadTable columns={result.columns} rows={result.rows} />
          <p className="text-xs text-muted-foreground">{t(result.note)}</p>
        </>
      )}
    </section>
  )
}
