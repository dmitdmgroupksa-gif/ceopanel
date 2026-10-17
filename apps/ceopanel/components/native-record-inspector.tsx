"use client"
import { useEffect, useRef, useState } from "react"
import { ExternalLink, Download, LoaderCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { useLocale } from "./locale-provider"
import { NativeReadTable } from "./native-read-controls"
import {
  explorerRead,
  downloadERPFile,
  erpRecordHref,
} from "@/lib/explorer-client"
import type {
  NativeDocument,
  NativeWorkflow,
  NativeSchema,
  Attachments,
} from "@/lib/erp-native/explorer-types"
import type { ExportRequest } from "@/lib/erp-native/files"

export function NativeRecordInspector({
  name,
  schema,
  company,
  site,
  onClose,
}: {
  name: string
  schema: NativeSchema
  company: string
  site: string
  onClose: () => void
}) {
  const { t, locale } = useLocale()
  const [record, setRecord] = useState<NativeDocument | null>(null)
  const [workflow, setWorkflow] = useState<NativeWorkflow | null>(null)
  const [attachments, setAttachments] = useState<Attachments | null>(null)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("document")
  const controller = useRef<AbortController | null>(null)
  const doctype = schema.doctype
  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    void explorerRead<NativeDocument>(
      company,
      { action: "document", doctype, name },
      abort.signal,
    )
      .then(setRecord)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy("")
      })
    return () => abort.abort()
  }, [company, doctype, name])
  async function perform(
    kind: string,
    action: (signal: AbortSignal) => Promise<void>,
  ) {
    const signal = controller.current!.signal
    if (busy || signal.aborted) return
    setBusy(kind)
    setError("")
    try {
      await action(signal)
    } catch (e) {
      if (!signal.aborted) setError((e as Error).message)
    } finally {
      if (!signal.aborted) setBusy("")
    }
  }
  function download(request: ExportRequest) {
    void perform("download", (signal) =>
      downloadERPFile(company, request, signal),
    )
  }
  const labels = new Map(
    schema.fields.map((f) => [f.fieldname, f.label || f.fieldname]),
  )
  for (const [key, label] of Object.entries({
    name: "Record",
    owner: "Created by",
    creation: "Created on",
    modified: "Last updated",
    modified_by: "Updated by",
    docstatus: "Document status",
  }))
    labels.set(key, label)
  const values = record?.values || {}
  const fields = Object.entries(values).filter(
    ([, value]) => !Array.isArray(value),
  )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="break-all">{name}</DialogTitle>
          <DialogDescription>
            {doctype} · {t("Read only")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a
              href={erpRecordHref(site, doctype, name)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink />
              {t("Open in ERP")}
            </a>
          </Button>
          {record && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  download({
                    kind: "document",
                    doctype,
                    name,
                    format: "pdf",
                    language: locale,
                  })
                }
              >
                <Download />
                {t("Download PDF")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void perform("workflow", async (signal) => {
                    setWorkflow(null)
                    setWorkflow(
                      await explorerRead<NativeWorkflow>(
                        company,
                        { action: "workflow", doctype, name },
                        signal,
                      ),
                    )
                  })
                }
              >
                {t("Inspect workflow")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void perform("attachments", async (signal) => {
                    setAttachments(null)
                    setOffset(0)
                    setAttachments(
                      await explorerRead<Attachments>(
                        company,
                        { action: "attachments", doctype, name, offset: 0 },
                        signal,
                      ),
                    )
                  })
                }
              >
                {t("Load attachments")}
              </Button>
            </>
          )}
        </div>
        {!!busy && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" />
            {t("Loading…")}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {t(error)}
          </p>
        )}
        {record && (
          <>
            <p className="text-xs text-muted-foreground">{t(record.scope)}</p>
            <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              {fields.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    {t(labels.get(key) || key)}
                  </dt>
                  <dd
                    dir="auto"
                    className="mt-1 whitespace-pre-wrap break-words text-sm"
                  >
                    {key === "docstatus" &&
                    typeof value === "number" &&
                    [0, 1, 2].includes(value)
                      ? t(["Draft", "Submitted", "Cancelled"][value])
                      : value === null || value === ""
                        ? "—"
                        : typeof value === "boolean"
                          ? t(value ? "Yes" : "No")
                          : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
            {Object.entries(values)
              .filter(([, value]) => Array.isArray(value))
              .map(([key, value]) => {
                const field = schema.fields.find((f) => f.fieldname === key)
                const child = schema.childTables.find(
                  (c) => c.doctype === field?.options,
                )
                return (
                  <details key={key} className="min-w-0 rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      {t(labels.get(key) || key)} ·{" "}
                      {(value as unknown[]).length}
                    </summary>
                    <div className="mt-4">
                      <NativeReadTable
                        columns={
                          child?.fields || [
                            { fieldname: "name", label: "Record" },
                          ]
                        }
                        rows={value as Record<string, unknown>[]}
                      />
                    </div>
                  </details>
                )
              })}
          </>
        )}
        {workflow && (
          <section
            className="min-w-0 space-y-4 rounded-lg border p-4"
            aria-label={t("Workflow inspection")}
          >
            <h3 className="font-semibold">{t("Workflow inspection")}</h3>
            {"currentState" in workflow ? (
              <>
                <p className="text-sm">
                  {t("Current state")}: <strong>{workflow.currentState}</strong>{" "}
                  · {workflow.workflow}
                </p>
                <h4 className="text-sm font-medium">
                  {t("Candidate next steps")}
                </h4>
                <NativeReadTable
                  columns={[
                    { fieldname: "action", label: "Action" },
                    { fieldname: "nextState", label: "Next state" },
                    { fieldname: "approverRole", label: "Candidate role" },
                    { fieldname: "conditional", label: "Conditional" },
                  ]}
                  rows={workflow.immediateCandidates}
                />
                <h4 className="text-sm font-medium">
                  {t("Currently permitted for your account")}
                </h4>
                <NativeReadTable
                  columns={[
                    { fieldname: "action", label: "Action" },
                    { fieldname: "nextState", label: "Next state" },
                    { fieldname: "approverRole", label: "Candidate role" },
                  ]}
                  rows={workflow.availableToCurrentUser || []}
                />
                <details>
                  <summary className="cursor-pointer text-sm">
                    {t("Possible future branches")}
                  </summary>
                  <div className="mt-3">
                    <NativeReadTable
                      columns={[
                        { fieldname: "state", label: "Stage" },
                        { fieldname: "action", label: "Action" },
                        { fieldname: "nextState", label: "Next state" },
                        { fieldname: "approverRole", label: "Candidate role" },
                        { fieldname: "conditional", label: "Conditional" },
                      ]}
                      rows={workflow.possibleRemainingTransitions || []}
                    />
                  </div>
                </details>
              </>
            ) : (
              <p className="text-sm">
                {t("No active workflow is recorded for this document.")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t(workflow.note)}</p>
          </section>
        )}
        {attachments && (
          <section
            className="space-y-3 rounded-lg border p-4"
            aria-label={t("Attachments")}
          >
            <h3 className="font-semibold">{t("Attachments")}</h3>
            {!attachments.files.length && (
              <p className="text-sm text-muted-foreground">
                {t("No attachments found.")}
              </p>
            )}
            {attachments.files.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 break-all">
                  {file.filename}
                  {file.size !== null
                    ? ` · ${(file.size / 1024).toFixed(1)} KB`
                    : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={() =>
                    download({ kind: "attachment", name: file.name })
                  }
                >
                  <Download />
                  {t("Download")}
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || offset === 0}
                onClick={() =>
                  void perform("attachments", async (signal) => {
                    const next = Math.max(0, offset - 20)
                    const data = await explorerRead<Attachments>(
                      company,
                      { action: "attachments", doctype, name, offset: next },
                      signal,
                    )
                    setAttachments(data)
                    setOffset(next)
                  })
                }
              >
                {t("Previous")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || !attachments.hasMore}
                onClick={() =>
                  void perform("attachments", async (signal) => {
                    const next = offset + 20
                    const data = await explorerRead<Attachments>(
                      company,
                      { action: "attachments", doctype, name, offset: next },
                      signal,
                    )
                    setAttachments(data)
                    setOffset(next)
                  })
                }
              >
                {t("Next")}
              </Button>
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
