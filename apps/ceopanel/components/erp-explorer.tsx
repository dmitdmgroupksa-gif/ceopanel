"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { Search, Star, LoaderCircle, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useSession } from "./session-provider"
import { useLocale } from "./locale-provider"
import { NativeRecordsView } from "./native-records-view"
import { NativeReportView } from "./native-report-view"
import { explorerRead } from "@/lib/explorer-client"
import type {
  NativeSchema,
  NativeReport,
  Source,
  SourceResults,
} from "@/lib/erp-native/explorer-types"

type Kind = "all" | "doctype" | "report"
export function ERPExplorer({
  pickerKind,
}: { pickerKind?: "doctype" | "report" } = {}) {
  const { context } = useSession()
  if (!context) return null
  return (
    <Explorer
      key={`${context.user}:${context.company}:${pickerKind || "all"}`}
      pickerKind={pickerKind}
      owner={context.user}
      company={context.company}
      site={context.siteUrl}
    />
  )
}
function Explorer({
  owner,
  company,
  site,
  pickerKind,
}: {
  owner: string
  company: string
  site: string
  pickerKind?: "doctype" | "report"
}) {
  const { t } = useLocale()
  const [query, setQuery] = useState("")
  const [catalog, setCatalog] = useState<Source[]>([])
  const [catalogVersion, setCatalogVersion] = useState(0)
  const [kind, setKind] = useState<Kind>("all")
  const [sources, setSources] = useState<SourceResults | null>(null)
  const [selected, setSelected] = useState<Source | null>(null)
  const [schema, setSchema] = useState<NativeSchema | null>(null)
  const [report, setReport] = useState<NativeReport | null>(null)
  const [error, setError] = useState("")
  const [detailError, setDetailError] = useState("")
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [favorites, setFavorites] = useState<Source[]>([])
  const [recent, setRecent] = useState<Source[]>([])
  const [storageError, setStorageError] = useState("")
  const [applied, setApplied] = useState({ query: "", kind: "all" as Kind })
  const sourceAbort = useRef<AbortController | null>(null)
  const detailAbort = useRef<AbortController | null>(null)
  const preferenceKey = `ceopanel-explorer:${JSON.stringify([site, owner, company])}`
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(preferenceKey) || "{}")
      const checked = (items: unknown): Source[] =>
        Array.isArray(items)
          ? items
              .filter(
                (s): s is Source =>
                  s &&
                  ["doctype", "report"].includes(s.kind) &&
                  typeof s.name === "string" &&
                  s.name.length <= 180
              )
              .slice(0, 20)
              .map((s) => ({ kind: s.kind, name: s.name }))
          : []
      setFavorites(checked(data.favorites))
      setRecent(checked(data.recent))
    } catch {
      setStorageError("Your browser could not load saved sources.")
    }
  }, [preferenceKey])
  function persist(nextFavorites: Source[], nextRecent: Source[]) {
    setFavorites(nextFavorites)
    setRecent(nextRecent)
    try {
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          favorites: nextFavorites.map((s) => ({ kind: s.kind, name: s.name })),
          recent: nextRecent.map((s) => ({ kind: s.kind, name: s.name })),
        })
      )
      setStorageError("")
    } catch {
      setStorageError("Your browser could not save sources.")
    }
  }
  const load = useCallback(
    async (text: string, type: Kind, offset = 0) => {
      sourceAbort.current?.abort()
      const abort = new AbortController()
      sourceAbort.current = abort
      setBusy(true)
      setError("")
      setSources(null)
      setApplied({ query: text, kind: type })
      try {
        const data = await explorerRead<SourceResults>(
          company,
          { action: "sources", query: text, kind: type, offset },
          abort.signal
        )
        if (!abort.signal.aborted) setSources(data)
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message)
      } finally {
        if (!abort.signal.aborted) setBusy(false)
      }
    },
    [company]
  )
  useEffect(() => {
    if (pickerKind) {
      const abort = new AbortController()
      setBusy(true)
      setError("")
      setCatalog([])
      setSelected(null)
      setSchema(null)
      setReport(null)
      void explorerRead<{ results: Source[] }>(
        company,
        { action: "catalog", kind: pickerKind },
        abort.signal
      )
        .then((data) => {
          if (!abort.signal.aborted) setCatalog(data.results)
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message)
        })
        .finally(() => {
          if (!abort.signal.aborted) setBusy(false)
        })
      return () => {
        abort.abort()
        detailAbort.current?.abort()
      }
    }
    void load("", "all")
    return () => {
      sourceAbort.current?.abort()
      detailAbort.current?.abort()
    }
  }, [load, company, pickerKind, catalogVersion])
  async function open(source: Source) {
    detailAbort.current?.abort()
    const abort = new AbortController()
    detailAbort.current = abort
    setSelected(source)
    setSchema(null)
    setReport(null)
    setDetailError("")
    setOpening(true)
    try {
      if (source.kind === "doctype") {
        const data = await explorerRead<NativeSchema>(
          company,
          { action: "schema", doctype: source.name },
          abort.signal
        )
        if (!abort.signal.aborted) setSchema(data)
      } else {
        const data = await explorerRead<NativeReport>(
          company,
          { action: "report", report: source.name },
          abort.signal
        )
        if (!abort.signal.aborted) setReport(data)
      }
      if (!abort.signal.aborted)
        persist(
          favorites,
          [
            source,
            ...recent.filter(
              (s) => s.kind !== source.kind || s.name !== source.name
            ),
          ].slice(0, 10)
        )
    } catch (e) {
      if (!abort.signal.aborted) setDetailError((e as Error).message)
    } finally {
      if (!abort.signal.aborted) setOpening(false)
    }
  }
  function sourceButton(source: Source) {
    return (
      <button
        type="button"
        key={`${source.kind}:${source.name}`}
        className={`block w-full rounded-md border p-3 text-start text-sm hover:bg-muted/40 ${selected?.kind === source.kind && selected?.name === source.name ? "border-primary bg-muted/40" : ""}`}
        disabled={source.canRead === false}
        onClick={() => void open(source)}
      >
        <span className="block break-words font-medium">{source.name}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {t(source.kind === "report" ? "Report" : "Record type")}
          {source.module ? ` · ${source.module}` : ""}
          {source.canRead === false ? ` · ${t("Read access denied")}` : ""}
        </span>
      </button>
    )
  }
  const saved =
    !!selected &&
    favorites.some((s) => s.kind === selected.kind && s.name === selected.name)
  return (
    <section className="space-y-5" aria-label={t("Report and record explorer")}>
      <div>
        <h2 className="text-lg font-semibold">
          {t(
            pickerKind === "doctype"
              ? "Custom DocTypes"
              : pickerKind === "report"
                ? "Custom reports"
                : "Report and record explorer"
          )}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Search reports and business record types using your ERP permissions."
          )}
        </p>
      </div>
      {pickerKind ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              aria-label={t("Search ERP sources")}
              placeholder={t("Search by name…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setCatalogVersion((v) => v + 1)}
            >
              <RefreshCw />
              {t("Refresh")}
            </Button>
          </div>
          <label className="block space-y-2 text-sm">
            <span>
              {t(
                pickerKind === "doctype"
                  ? "Choose record type"
                  : "Choose report"
              )}
            </span>
            <select
              className="h-10 w-full min-w-0 rounded-md border bg-background px-3"
              disabled={busy}
              value={selected?.name || ""}
              onChange={(e) => {
                const source = catalog.find((s) => s.name === e.target.value)
                if (source) void open(source)
              }}
            >
              <option value="">{t(busy ? "Loading…" : "Choose")}</option>
              {catalog
                .filter((s) =>
                  s.name
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase().trim())
                )
                .map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              {selected &&
                !selected.name
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase().trim()) && (
                  <option value={selected.name}>{selected.name}</option>
                )}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            {catalog.length} {t("ERP sources")}.{" "}
            {t("Access is checked again when you open or run a source.")}
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void load(query.trim(), kind)
          }}
          className="flex flex-wrap gap-2"
        >
          <Input
            aria-label={t("Search ERP sources")}
            maxLength={200}
            className="min-w-0 flex-1 basis-52"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label={t("Source type")}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="all">{t("All sources")}</option>
            <option value="doctype">{t("Record types")}</option>
            <option value="report">{t("Reports")}</option>
          </select>
          <Button disabled={busy} type="submit">
            <Search />
            {t("Search")}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      {storageError && (
        <p role="status" className="text-xs text-muted-foreground">
          {t(storageError)}
        </p>
      )}
      <div
        className={
          pickerKind
            ? "min-w-0"
            : "grid min-w-0 gap-5 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]"
        }
      >
        {!pickerKind && (
          <aside className="min-w-0 space-y-4">
            {!!favorites.length && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  {t("Saved sources")}
                </summary>
                <div className="mt-3 space-y-2">
                  {favorites.map(sourceButton)}
                </div>
              </details>
            )}
            {!!recent.length && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  {t("Recent sources")}
                </summary>
                <div className="mt-3 space-y-2">{recent.map(sourceButton)}</div>
              </details>
            )}
            {busy && (
              <p role="status" className="flex items-center gap-2 text-sm">
                <LoaderCircle className="size-4 animate-spin" />
                {t("Loading…")}
              </p>
            )}
            {sources && (
              <>
                <p className="text-xs text-muted-foreground">
                  {sources.totalMatches} {t("Matching sources")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("Access is checked again when you open or run a source.")}
                </p>
                <div className="max-h-[65svh] space-y-2 overflow-y-auto p-1">
                  {sources.results.map(sourceButton)}
                </div>
                {!sources.results.length && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {t("No sources match your search.")}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || sources.offset === 0}
                    onClick={() =>
                      void load(
                        applied.query,
                        applied.kind,
                        Math.max(0, sources.offset - 20)
                      )
                    }
                  >
                    {t("Previous")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !sources.hasMore}
                    onClick={() =>
                      void load(
                        applied.query,
                        applied.kind,
                        sources.offset + 20
                      )
                    }
                  >
                    {t("Next")}
                  </Button>
                </div>
              </>
            )}
          </aside>
        )}
        <div className="min-w-0 space-y-4">
          {selected && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  opening || !!detailError || (!saved && favorites.length >= 20)
                }
                onClick={() =>
                  persist(
                    saved
                      ? favorites.filter(
                          (s) =>
                            s.kind !== selected.kind || s.name !== selected.name
                        )
                      : [selected, ...favorites],
                    recent
                  )
                }
              >
                <Star className={saved ? "fill-current" : ""} />
                {t(saved ? "Remove saved source" : "Save source")}
              </Button>
            </div>
          )}
          {opening && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              {t("Checking source access…")}
            </p>
          )}
          {detailError && (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                {t(detailError)}
              </p>
              {selected && (
                <Button variant="outline" onClick={() => void open(selected)}>
                  {t("Try again")}
                </Button>
              )}
            </div>
          )}
          {!selected && (
            <p className="rounded-lg border p-5 text-sm text-muted-foreground">
              {t("Choose a record type or report to get started.")}
            </p>
          )}
          {schema && (
            <NativeRecordsView
              key={schema.doctype}
              schema={schema}
              company={company}
              site={site}
            />
          )}
          {report && (
            <NativeReportView
              key={report.name}
              description={report}
              company={company}
            />
          )}
        </div>
      </div>
    </section>
  )
}
