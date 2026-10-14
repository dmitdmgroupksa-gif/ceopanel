"use client"
import { useEffect, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WorkspaceFields } from "./workspace-fields"
import type {
  Field,
  ModuleSchema,
  RecordValues,
  WorkspaceRecord,
} from "@/lib/workspace"

function editableValues(fields: Field[], values: RecordValues): RecordValues {
  return Object.fromEntries(
    fields
      .filter((field) => !field.readOnly && values[field.name] !== undefined)
      .map((field) => [
        field.name,
        field.type === "table" && Array.isArray(values[field.name])
          ? (values[field.name] as RecordValues[]).map((row) =>
              editableValues(field.fields ?? [], row)
            )
          : values[field.name],
      ])
  )
}

export function WorkspaceEditor({
  open,
  onOpenChange,
  schema,
  record,
  company,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  schema: ModuleSchema
  record: WorkspaceRecord | null
  company?: string
  onSaved: () => Promise<void>
}) {
  const submitted = record?.docstatus === 1
  const fields = schema.fields.map((field) => ({
    ...field,
    readOnly: field.readOnly || (submitted && !field.allowOnSubmit),
  }))
  const canSave = record
    ? schema.permissions.edit &&
      record.docstatus !== 2 &&
      fields.some((field) => !field.readOnly)
    : schema.permissions.create
  const [values, setValues] = useState<RecordValues>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<"submit" | "cancel" | null>(null)
  useEffect(() => {
    setValues(record?.values ?? {})
    setError(null)
    setAction(null)
  }, [record, open])
  const base = `/api/workspace/modules/${encodeURIComponent(schema.module.id)}/records`
  const query = company ? `?company=${encodeURIComponent(company)}` : ""
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(
        `${base}${record ? `/${encodeURIComponent(record.name)}` : ""}${query}`,
        {
          method: record ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: editableValues(fields, values),
            modified: record?.modified,
          }),
        }
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "The record could not be saved.")
      await onSaved()
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The record could not be saved."
      )
    } finally {
      setBusy(false)
    }
  }
  async function runAction() {
    if (!record || !action) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(
        `${base}/${encodeURIComponent(record.name)}/actions${query}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, modified: record.modified }),
        }
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error || "This action could not be completed.")
      await onSaved()
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This action could not be completed."
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {record ? record.name : `New ${schema.module.doctype}`}
          </DialogTitle>
          <DialogDescription>
            {schema.module.title}
            {record
              ? ` · ${record.docstatus === 1 ? "Submitted" : record.docstatus === 2 ? "Cancelled" : "Draft"}`
              : " · Create a company record"}
          </DialogDescription>
        </DialogHeader>
        {action ? (
          <div className="space-y-4">
            <p className="text-sm">
              {action === "submit" ? "Submit" : "Cancel"} {record?.name} in
              ERPNext?
            </p>
            <div className="flex gap-2">
              <Button
                disabled={busy}
                variant={action === "cancel" ? "destructive" : "default"}
                onClick={runAction}
              >
                {busy && <LoaderCircle className="animate-spin" />}
                {action === "submit"
                  ? "Confirm submit"
                  : "Confirm cancellation"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Back to record
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={save}>
            <WorkspaceFields
              fields={fields}
              values={values}
              onChange={setValues}
              disabled={busy || !canSave}
            />
            <div className="flex flex-wrap items-center gap-2">
              {canSave && (
                <Button type="submit" disabled={busy}>
                  {busy && <LoaderCircle className="animate-spin" />}
                  {record ? "Save changes" : "Create record"}
                </Button>
              )}
              {record &&
                schema.submittable &&
                schema.permissions.submit &&
                (record.docstatus ?? 0) === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setAction("submit")}
                  >
                    Submit
                  </Button>
                )}
              {record &&
                schema.submittable &&
                schema.permissions.cancel &&
                record.docstatus === 1 && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setAction("cancel")}
                  >
                    Cancel document
                  </Button>
                )}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
