"use client"
import { useEffect, useId, useState } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/table"
import { useLocale } from "./locale-provider"
import type { NativeField } from "@/lib/erp-native/explorer-types"
import { ALL_COMPANIES } from "@/lib/company-scope"
import type { Company } from "@/lib/model"

export function NativeValueInput({
  field,
  value,
  onChange,
  disabled = false,
  companies,
}: {
  field: NativeField
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
  companies?: Company[]
}) {
  const { t } = useLocale()
  const instance = useId()
  const id = `native-filter-${instance}-${field.fieldname}`
  const multiple = [
    "MultiSelectList",
    "Table MultiSelect",
    "MultiSelect",
    "DateRange",
  ].includes(field.fieldtype)
  const accessible = {
    "aria-labelledby": `${id}-label`,
    "aria-describedby": multiple ? `${id}-hint` : undefined,
  }
  return (
    <label className="block min-w-0 space-y-2 text-sm" htmlFor={id}>
      <span id={`${id}-label`}>
        {t(field.label || field.fieldname)}
        {field.required ? " *" : ""}
      </span>
      {field.options === "Company" &&
      field.fieldtype === "Link" &&
      companies ? (
        <select
          {...accessible}
          id={id}
          className="h-9 w-full rounded-md border bg-background px-3"
          disabled={disabled}
          required={field.required}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">{t("Choose")}</option>
          <option value={ALL_COMPANIES}>{t("All Companies")}</option>
          {companies.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      ) : field.fieldtype === "Check" ? (
        <select
          {...accessible}
          id={id}
          className="h-9 w-full rounded-md border bg-background px-3"
          disabled={disabled}
          value={
            value === undefined || value === "" ? "" : String(Number(value))
          }
          required={field.required}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
        >
          <option value="">{t("Any")}</option>
          <option value="1">{t("Yes")}</option>
          <option value="0">{t("No")}</option>
        </select>
      ) : field.fieldtype === "Select" && field.options ? (
        <select
          {...accessible}
          id={id}
          className="h-9 w-full rounded-md border bg-background px-3"
          disabled={disabled}
          required={field.required}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("Choose")}</option>
          {field.options
            .split("\n")
            .filter(Boolean)
            .map((option) => (
              <option key={option} value={option}>
                {t(option)}
              </option>
            ))}
          {value !== undefined &&
            value !== "" &&
            !field.options.split("\n").includes(String(value)) && (
              <option value={String(value)}>{String(value)}</option>
            )}
        </select>
      ) : multiple ? (
        <textarea
          {...accessible}
          id={id}
          disabled={disabled}
          required={field.required}
          className="min-h-20 w-full rounded-md border bg-background p-2"
          value={Array.isArray(value) ? value.join("\n") : String(value ?? "")}
          onChange={(e) => onChange(e.target.value.split("\n"))}
        />
      ) : (
        <Input
          {...accessible}
          id={id}
          disabled={disabled}
          required={field.required}
          maxLength={4000}
          type={
            field.fieldtype === "Date"
              ? "date"
              : ["Int", "Float", "Currency", "Percent"].includes(
                    field.fieldtype
                  )
                ? "number"
                : "text"
          }
          step={field.fieldtype === "Int" ? "1" : "any"}
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? undefined
                : ["Int", "Float", "Currency", "Percent"].includes(
                      field.fieldtype
                    )
                  ? Number(e.target.value)
                  : e.target.value
            )
          }
        />
      )}
      {multiple && (
        <span id={`${id}-hint`} className="block text-xs text-muted-foreground">
          {t("One value per line")}
        </span>
      )}
    </label>
  )
}
export function NativeReadTable({
  columns,
  rows,
  openRecord,
  pageSize = 20,
}: {
  columns: { fieldname: string; label?: string }[]
  rows: Record<string, unknown>[]
  openRecord?: (name: string) => void
  pageSize?: number
}) {
  const { t, locale } = useLocale()
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [rows])
  const last = Math.max(0, Math.ceil(rows.length / pageSize) - 1),
    current = Math.min(last, page)
  function display(value: unknown) {
    if (value === undefined || value === null || value === "") return "—"
    if (typeof value === "boolean") return t(value ? "Yes" : "No")
    if (typeof value === "number")
      return value.toLocaleString(locale, { maximumSignificantDigits: 21 })
    return String(value).replace(/<[^>]*>/g, " ")
  }
  return (
    <div className="min-w-0 space-y-3">
      <div className="max-w-full overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.fieldname}>
                  {t(c.label || c.fieldname)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .slice(current * pageSize, (current + 1) * pageSize)
              .map((row, index) => (
                <TableRow key={index}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.fieldname}
                      className="max-w-80 whitespace-normal break-words align-top"
                    >
                      {c.fieldname === "name" &&
                      openRecord &&
                      typeof row.name === "string" ? (
                        <button
                          type="button"
                          className="text-start text-primary underline underline-offset-4"
                          onClick={() => openRecord(row.name as string)}
                        >
                          {row.name}
                        </button>
                      ) : (
                        display(row[c.fieldname])
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      {rows.length === 0 && (
        <p
          role="status"
          className="py-5 text-center text-sm text-muted-foreground"
        >
          {t("No records match these filters.")}
        </p>
      )}
      {rows.length > pageSize && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("Previous")}
          </Button>
          <span>
            {current + 1} / {last + 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current === last}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Next")}
          </Button>
        </div>
      )}
    </div>
  )
}
