"use client"
import { useEffect, useState, useCallback } from "react"
import { Upload, Wifi, WifiOff, Trash2 } from "lucide-react"
import { Button } from "./ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"
import { Input } from "./ui/input"
import { WorkspaceFields } from "./workspace-fields"
import { useLocale } from "./locale-provider"
import type { DashboardContext } from "@/lib/dashboard-server"
import { editableValues } from "@/lib/workspace"
import type { ModuleSchema, RecordValues } from "@/lib/workspace"
import {
  offlineInputs,
  saveOfflineInput,
  removeOfflineInput,
  type OfflineInput,
} from "@/lib/offline-inputs"
export function FieldUpdates({
  context,
}: {
  context: DashboardContext | null
}) {
  const { t } = useLocale(),
    [modules, setModules] = useState<
      { agent: string; id: string; title: string }[]
    >([]),
    [selected, setSelected] = useState(""),
    [schema, setSchema] = useState<ModuleSchema | null>(null),
    [values, setValues] = useState<RecordValues>({}),
    [photos, setPhotos] = useState<File[]>([]),
    [drafts, setDrafts] = useState<OfflineInput[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true)
  const scope = context ? `?company=${encodeURIComponent(context.company)}` : ""
  const active = modules.find((m) => `${m.agent}:${m.id}` === selected)
  const loadDrafts = useCallback(async () => {
    if (context) setDrafts(await offlineInputs(context.user, context.company))
  }, [context])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])
  useEffect(() => {
    let current = true
    setModules([])
    setSchema(null)
    setDrafts([])
    setError("")
    if (!context) return
    void loadDrafts()
    void fetch(`/api/platform/field-modules${scope}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (current) {
          setModules(data)
          if (data.length) setSelected(`${data[0].agent}:${data[0].id}`)
        }
      })
      .catch((e) => {
        if (current) setError(e.message)
      })
    return () => {
      current = false
    }
  }, [context, scope, loadDrafts])
  useEffect(() => {
    let current = true
    setSchema(null)
    setValues({})
    if (!active || !context) return
    void fetch(`/api/workspace/modules/${active.id}${scope}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (current) {
          setSchema(data)
          setValues(
            data.companyField ? { [data.companyField]: context.company } : {},
          )
        }
      })
      .catch((e) => {
        if (current) setError(e.message)
      })
    return () => {
      current = false
    }
  }, [selected, context, scope, active])
  async function save() {
    if (!context || !active) return
    setBusy(true)
    setError("")
    try {
      if (
        photos.length > 5 ||
        photos.reduce((size, f) => size + f.size, 0) > 10 * 1024 * 1024
      )
        throw new Error("Upload at most five photos totaling 10 MB.")
      await saveOfflineInput({
        id: crypto.randomUUID(),
        owner: context.user,
        company: context.company,
        agent: active.agent,
        module: active.id,
        values: editableValues(
          schema?.fields.map((f) => ({
            ...f,
            readOnly: f.readOnly || f.name === schema.companyField,
          })) || [],
          values,
        ),
        photos,
        createdAt: new Date().toISOString(),
      })
      setValues(
        schema?.companyField ? { [schema.companyField]: context.company } : {},
      )
      setPhotos([])
      await loadDrafts()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function submit(draft: OfflineInput) {
    setBusy(true)
    setError("")
    try {
      const form = new FormData()
      form.set("requestId", draft.id)
      form.set("agent", draft.agent)
      form.set(
        "payload",
        JSON.stringify({
          kind: "create",
          module: draft.module,
          values: draft.values,
        }),
      )
      for (const photo of draft.photos) form.append("photos", photo)
      const response = await fetch(`/api/platform/field-updates${scope}`, {
        method: "POST",
        body: form,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      await removeOfflineInput(draft.id)
      await loadDrafts()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
        {t(online ? "Online" : "Offline")} ·{" "}
        {t("Saved drafts stay on this device until submitted or removed.")}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded border border-amber-500/30 p-3 text-sm"
        >
          {t(error)}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Field updates")}</CardTitle>
          <CardDescription>
            {t(
              "Photos and record drafts require manager approval before ERP changes.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!modules.length ? (
            <p className="text-sm text-muted-foreground">
              {t("Awaiting configuration")}
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
              className="space-y-4"
            >
              <select
                aria-label={t("Choose record type")}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {modules.map((m) => (
                  <option
                    key={`${m.agent}:${m.id}`}
                    value={`${m.agent}:${m.id}`}
                  >
                    {t(m.title)}
                  </option>
                ))}
              </select>
              {schema && (
                <WorkspaceFields
                  moduleId={active?.id}
                  company={context?.company}
                  fields={schema.fields.map((f) => ({
                    ...f,
                    readOnly: f.readOnly || f.name === schema.companyField,
                  }))}
                  values={values}
                  onChange={setValues}
                  disabled={busy || !schema.permissions.create}
                />
              )}
              <Input
                aria-label={t("Field photos")}
                type="file"
                accept="image/png,image/jpeg"
                capture="environment"
                multiple
                onChange={(e) => setPhotos(Array.from(e.target.files || []))}
              />
              <Button
                disabled={
                  !context ||
                  !schema?.ready ||
                  !schema.permissions.create ||
                  busy
                }
              >
                {t("Save device draft")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {drafts.map((draft) => (
          <Card key={draft.id}>
            <CardHeader>
              <CardTitle className="text-sm">{draft.module}</CardTitle>
              <CardDescription>
                {new Date(draft.createdAt).toLocaleString()} ·{" "}
                {draft.photos.length} {t("Field photos")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre
                dir="auto"
                className="max-h-40 overflow-auto rounded border p-3 text-xs"
              >
                {JSON.stringify(draft.values, null, 2)}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !online}
                  onClick={() => void submit(draft)}
                >
                  <Upload />
                  {t("Submit for approval")}
                </Button>
                <Button
                  size="icon"
                  aria-label={t("Remove")}
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void removeOfflineInput(draft.id).then(loadDrafts)
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
