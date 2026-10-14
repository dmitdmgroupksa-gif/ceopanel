"use client"
import { useLocale } from "./locale-provider"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Field, FieldValue, RecordValues } from "@/lib/workspace"
import { ERPLinkField } from "./erp-link-field"

export function WorkspaceFields({
  fields,
  values,
  onChange,
  disabled = false,
  prefix = "record",
  moduleId,
  company,
  pathPrefix = "",
}: {
  fields: Field[]
  values: RecordValues
  onChange: (values: RecordValues) => void
  disabled?: boolean
  prefix?: string
  moduleId?: string
  company?: string
  pathPrefix?: string
}) {
  const { t, locale } = useLocale()
  const update = (name: string, value: FieldValue) =>
    onChange({ ...values, [name]: value })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `${prefix}-${field.name}`
        const value = values[field.name]
        const readOnly = disabled || field.readOnly
        if (field.type === "table") {
          const rows = Array.isArray(value) ? value : []
          return (
            <div key={field.name} className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t(field.label)}
                  {field.required && " *"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={readOnly || rows.length >= 200}
                  onClick={() => update(field.name, [...rows, {}])}
                >
                  <Plus />
                  {t("Add row")}
                </Button>
              </div>
              {rows.map((row, index) => (
                <div key={index} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {t("Row")} {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${t(field.label)} row ${index + 1}`}
                      disabled={readOnly}
                      onClick={() =>
                        update(
                          field.name,
                          rows.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X />
                    </Button>
                  </div>
                  <WorkspaceFields
                    fields={field.fields ?? []}
                    moduleId={moduleId}
                    company={company}
                    pathPrefix={`${pathPrefix}${field.name}.`}
                    values={row}
                    disabled={readOnly}
                    prefix={`${id}-${index}`}
                    onChange={(next) =>
                      update(
                        field.name,
                        rows.map((current, i) =>
                          i === index ? next : current,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              {rows.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {t("No rows added.")}
                </p>
              )}
            </div>
          )
        }
        return (
          <div
            key={field.name}
            className={`space-y-2 ${field.type === "textarea" ? "sm:col-span-2" : ""}`}
          >
            <label htmlFor={id} className="text-sm font-medium">
              {t(field.label)}
              {field.required && " *"}
            </label>
            {field.type === "check" ? (
              <div>
                <input
                  id={id}
                  type="checkbox"
                  className="size-4"
                  checked={!!value}
                  disabled={readOnly}
                  onChange={(event) => update(field.name, event.target.checked)}
                />
              </div>
            ) : field.type === "select" ? (
              <select
                id={id}
                required={field.required}
                disabled={readOnly}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => update(field.name, event.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">
                  {t("Choose")} {t(field.label)}
                </option>
                {field.options?.map((option) => (
                  <option key={t(option)} value={t(option)}>
                    {t(option)}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                id={id}
                required={field.required}
                disabled={readOnly}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => update(field.name, event.target.value)}
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
              />
            ) : field.type === "link" && moduleId ? (
              <ERPLinkField
                id={id}
                module={moduleId}
                field={`${pathPrefix}${field.name}`}
                company={company}
                value={typeof value === "string" ? value : ""}
                required={field.required}
                disabled={readOnly}
                onChange={(next) => update(field.name, next)}
              />
            ) : (
              <Input
                id={id}
                required={field.required}
                disabled={readOnly}
                type={
                  field.type === "number"
                    ? "number"
                    : field.type === "date"
                      ? "date"
                      : "text"
                }
                step={field.type === "number" ? "any" : undefined}
                value={
                  typeof value === "string" || typeof value === "number"
                    ? value
                    : ""
                }
                onChange={(event) =>
                  update(
                    field.name,
                    field.type === "number"
                      ? event.target.value === ""
                        ? null
                        : Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
