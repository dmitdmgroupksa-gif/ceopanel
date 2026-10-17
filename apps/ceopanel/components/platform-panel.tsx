"use client"
import { ALL_COMPANIES } from "@/lib/company-scope"
import { sessionFetch as fetch } from "@/lib/session-fetch"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Bot,
  BookOpen,
  Send,
  Upload,
  RefreshCw,
  CircleCheck,
  LoaderCircle,
  Bell,
  FileText,
} from "lucide-react"
import { agents, type Proposal } from "@/lib/platform/catalog"
import { useSession } from "./session-provider"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Badge } from "./ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card"
import { PlatformLinks } from "./platform-links"
import { useLocale } from "./locale-provider"
import { VoiceInput, ReadAnswer } from "./voice-input"
import { FieldUpdates } from "./field-updates"
import { MCPSettings } from "./mcp-settings"
import { InputReadiness } from "./input-readiness"
import { RolloutReadiness } from "./rollout-readiness"
import { ERP_READ_ONLY } from "@/lib/erp-access"

export type PlatformMode =
  | "agents"
  | "knowledge"
  | "approvals"
  | "notifications"
  | "integrations"
  | "field-updates"
type Status = {
  database: boolean
  queue: boolean
  ai: boolean
  embeddings: boolean
  environment: string
  modules: number
  agents: { id: string; configured: boolean }[]
  channels: { email: boolean; whatsapp: boolean; voice: boolean }
}
type Run = {
  id: string
  agent: string
  prompt: string
  response: string
  evidence: unknown[]
  status: string
  created_at: string
}
type Doc = {
  id: string
  title: string
  collection: string
  version: number
  status: string
  created_at: string
}
type Notice = {
  id: string
  title: string
  href: string
  read_at: string | null
  created_at: string
}
type SearchResult = {
  id: string
  title: string
  chunk: number
  content: string
  version: number
}
async function requestApi<T>(
  path: string,
  company?: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(
    `/api/platform/${path}${company ? `?company=${encodeURIComponent(company)}` : ""}`,
    {
      method: body ? "POST" : "GET",
      cache: "no-store",
      signal,
      headers:
        body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : undefined,
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    }
  )
  const result = await response.json()
  if (!response.ok)
    throw new Error(
      result.error || "The ERPNext operation could not be completed."
    )
  return result
}
export function ApprovalInbox({ company }: { company?: string }) {
  const api = requestApi
  const { t } = useLocale()
  const [rows, setRows] = useState<
      (Proposal & {
        canReview: boolean
        attachments?: { id: string; filename: string }[]
      })[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("")
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++sequence.current
    setError("")
    try {
      const result = await api<
        (Proposal & {
          canReview: boolean
          attachments?: { id: string; filename: string }[]
        })[]
      >("proposals", company)
      if (id === sequence.current) setRows(result)
    } catch (e) {
      if (id === sequence.current) setError((e as Error).message)
    }
  }, [company])
  useEffect(() => {
    setRows([])
    void refresh()
    return () => {
      ++sequence.current
    }
  }, [refresh])
  async function decide(
    row: Proposal,
    decision: "approve" | "reject" | "reconcile"
  ) {
    setBusy(row.id)
    setError("")
    try {
      await api(
        decision === "reconcile" ? "proposals/reconcile" : "proposals/review",
        company,
        decision === "reconcile"
          ? { id: row.id }
          : { id: row.id, revision: row.revision, decision }
      )
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "Review the exact change and evidence before approving. Native ERP workflows still apply."
          )}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw />
          {t("Refresh")}
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-amber-500/30 p-3 text-sm"
        >
          {t(error)}
        </p>
      )}
      {!rows.length && !error && <Empty label="No proposals yet." />}
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader>
            <div className="flex flex-wrap justify-between gap-2">
              <CardTitle className="text-base">
                {row.department} · {row.payload.kind} · {row.payload.module}
              </CardTitle>
              <Badge variant="outline">{t(row.status)}</Badge>
            </div>
            <CardDescription>
              {row.payload.name || row.id} · {row.proposer} ·{" "}
              {new Date(row.created_at).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-2 rounded-md border bg-muted/20 p-4 text-sm">
              {Object.entries(row.payload).map(([key, value]) => (
                <div key={key} className="grid gap-1 sm:grid-cols-[120px_1fr]">
                  <dt className="text-muted-foreground">{t(key)}</dt>
                  <dd
                    className="min-w-0 whitespace-pre-wrap break-words"
                    dir="auto"
                  >
                    {typeof value === "object"
                      ? JSON.stringify(value, null, 2)
                      : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
            {row.attachments?.map((file) => (
              <a
                key={file.id}
                className="block text-sm underline"
                href={`/api/platform/attachments/${file.id}?company=${encodeURIComponent(row.company)}`}
              >
                {file.filename}
              </a>
            ))}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t("Sources")}
              </summary>
              <pre
                className="mt-2 max-h-72 overflow-auto rounded border p-3 text-xs"
                dir="ltr"
              >
                {JSON.stringify(row.evidence, null, 2)}
              </pre>
            </details>
            {!ERP_READ_ONLY && row.canReview && row.status === "pending" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!!busy}
                  onClick={() => void decide(row, "approve")}
                >
                  {busy === row.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CircleCheck />
                  )}
                  {t("Approve and execute")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void decide(row, "reject")}
                >
                  {t("Reject")}
                </Button>
              </div>
            )}
            {row.canReview &&
              ["executing", "needs_reconciliation"].includes(row.status) && (
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void decide(row, "reconcile")}
                >
                  {t("Check ERP receipt")}
                </Button>
              )}
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
function Empty({ label }: { label: string }) {
  const { t } = useLocale()
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-10 text-center text-sm text-muted-foreground">
      {t(label)}
    </div>
  )
}
export function PlatformPanel({ mode }: { mode: PlatformMode }) {
  const { locale, t } = useLocale()
  const { context, setContext, preview } = useSession()
  const [status, setStatus] = useState<Status | null>(null)
  const [selected, setSelected] = useState("executive"),
    [available, setAvailable] = useState<string[]>([]),
    [prompt, setPrompt] = useState(""),
    [answer, setAnswer] = useState(""),
    [sources, setSources] = useState<unknown[]>([])
  const [runs, setRuns] = useState<Run[]>([]),
    [docs, setDocs] = useState<Doc[]>([]),
    [collections, setCollections] = useState<
      { id: string; title: string; upload: boolean }[]
    >([]),
    [collection, setCollection] = useState(""),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<SearchResult[]>([]),
    [notices, setNotices] = useState<Notice[]>([]),
    [inbox, setInbox] = useState<
      {
        provider_id: string
        channel: string
        content: string
        created_at: string
      }[]
    >([]),
    [inventory, setInventory] = useState<unknown>(null)
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const [runId, setRunId] = useState("")
  const token = useRef(0)
  const operationVersion = useRef(0)
  async function api<T>(
    path: string,
    company?: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const id = token.current
    const result = await requestApi<T>(path, company, body, signal)
    if (id !== token.current)
      throw new DOMException("Company view changed", "AbortError")
    return result
  }
  const title = {
    agents: "Agents",
    knowledge: "Knowledge",
    approvals: "Approvals",
    notifications: "Notifications",
    integrations: "Integration setup",
    "field-updates": "Field updates",
  }[mode]
  const active = agents.find((a) => a.id === selected)!
  const company = context?.company
  async function connect(company?: string) {
    const response = await fetch(
      `/api/erpnext/context?${new URLSearchParams({ navigation: "0", ...(company ? { company } : {}) })}`,
      { cache: "no-store" }
    )
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    setContext(body)
  }
  useEffect(() => {
    if (preview) return
    void requestApi<Status>("status")
      .then(setStatus)
      .catch(() => {})
  }, [preview])
  const refresh = useCallback(async () => {
    const id = ++token.current
    operationVersion.current++
    setBusy(false)
    setError("")
    setAnswer("")
    setRunId("")
    setSources([])
    setResults([])
    setRuns([])
    setDocs([])
    setNotices([])
    setInbox([])
    setInventory(null)
    setAvailable([])
    setCollections([])
    if (!company) return
    try {
      if (mode === "agents") {
        const allowed = await api<
          ((typeof agents)[number] & { available: boolean })[]
        >("agents", company)
        if (id === token.current)
          setAvailable(allowed.filter((a) => a.available).map((a) => a.id))
        const history = await api<Run[]>("runs", company)
        if (id === token.current) setRuns(history)
      }
      if (mode === "knowledge") {
        const data = await api<{
          documents: Doc[]
          collections: typeof collections
        }>("knowledge", company)
        if (id === token.current) {
          setDocs(data.documents)
          setCollections(data.collections)
          setCollection(data.collections.find((c) => c.upload)?.id || "")
        }
      }
      if (mode === "notifications") {
        const [data, messages] = await Promise.all([
          api<Notice[]>("notifications", company),
          api<typeof inbox>("inbox", company),
        ])
        if (id === token.current) {
          setNotices(data)
          setInbox(messages)
        }
      }
    } catch (e) {
      if (id === token.current) setError((e as Error).message)
    }
  }, [company, mode, context?.user])
  useEffect(() => {
    void refresh()
    return () => {
      ++token.current
    }
  }, [refresh])
  async function perform(operation: () => Promise<void>) {
    const id = token.current
    const version = ++operationVersion.current
    setBusy(true)
    setError("")
    try {
      await operation()
    } catch (e) {
      if (id === token.current) setError((e as Error).message)
    } finally {
      if (id === token.current && version === operationVersion.current)
        setBusy(false)
    }
  }
  const canRun = !!context && !!status?.ai && available.includes(selected)
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur lg:hidden">
        <PlatformLinks />
      </header>
      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t(title)}
            </h1>
          </div>
          {context && context.companies.length > 1 && (
            <select
              aria-label={t("Select company")}
              disabled={busy}
              value={company}
              className="h-9 rounded-md border bg-background px-3 text-sm"
              onChange={(e) => void perform(() => connect(e.target.value))}
            >
              <option value={ALL_COMPANIES}>{t("All Companies")}</option>
              {context.companies.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
          >
            {t(error)}
          </div>
        )}
        {mode === "agents" && (
          <>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8"
              aria-label={t("Choose assistant")}
            >
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelected(agent.id)
                    setAnswer("")
                    setRunId("")
                    setSources([])
                  }}
                  disabled={busy}
                  aria-pressed={selected === agent.id}
                  className={`rounded-md border px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted/40 ${selected === agent.id ? "border-foreground/30 bg-muted" : "border-transparent"}`}
                >
                  <span>{locale === "ar" ? agent.ar : agent.name}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="size-5" />
                    {locale === "ar" ? active.ar : active.name}
                  </CardTitle>
                  <CardDescription>
                    {locale === "ar"
                      ? active.descriptionAr
                      : active.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!canRun && (
                    <p className="text-sm text-muted-foreground">
                      {t("This assistant is not available yet.")}
                    </p>
                  )}
                  {answer && (
                    <div
                      className="whitespace-pre-wrap rounded-lg bg-muted/30 p-4 text-sm leading-7"
                      dir="auto"
                    >
                      {answer}
                    </div>
                  )}
                  {sources.flatMap((source, index) => {
                    const entry = source as {
                      kind?: string
                      type?: string
                      file?: { name?: string; downloadUrl?: string }
                    } | null
                    const file =
                      entry?.kind === "native-erp" && entry.type === "file"
                        ? entry.file
                        : undefined
                    return file?.name &&
                      file.downloadUrl?.startsWith("/api/erp/files?")
                      ? [
                          <a
                            key={index}
                            href={file.downloadUrl}
                            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm underline"
                          >
                            <FileText className="size-4" />
                            {file.name}
                          </a>,
                        ]
                      : []
                  })}
                  {runId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRunId("")
                        setAnswer("")
                        setSources([])
                      }}
                      disabled={busy}
                    >
                      {locale === "ar" ? "سؤال جديد" : "New question"}
                    </Button>
                  )}
                  {runId && (
                    <ReadAnswer
                      id={runId}
                      company={company}
                      disabled={!status?.channels.voice || busy}
                      onError={setError}
                    />
                  )}
                  {sources.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-sm">
                        {t("Sources")}
                      </summary>
                      <pre
                        dir="ltr"
                        className="mt-2 max-h-64 overflow-auto rounded border p-3 text-xs"
                      >
                        {JSON.stringify(sources, null, 2)}
                      </pre>
                    </details>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const id = token.current
                      void perform(async () => {
                        const result = await api<{
                          id: string
                          answer: string
                          evidence: unknown[]
                        }>("agents/run", company, {
                          agent: selected,
                          prompt,
                          language: locale,
                          ...(runId ? { previousRunId: runId } : {}),
                        })
                        if (id === token.current) {
                          setAnswer(result.answer)
                          setRunId(result.id)
                          setSources(result.evidence)
                          setPrompt("")
                          setRuns((rows) =>
                            [
                              {
                                id: result.id,
                                agent: selected,
                                prompt,
                                response: result.answer,
                                evidence: result.evidence,
                                status: "completed",
                                created_at: new Date().toISOString(),
                              },
                              ...rows,
                            ].slice(0, 50)
                          )
                        }
                      })
                    }}
                  >
                    <label className="sr-only" htmlFor="agent-prompt">
                      {t("Ask your department assistant")}
                    </label>
                    <textarea
                      id="agent-prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      maxLength={12000}
                      disabled={!canRun || busy}
                      placeholder={
                        locale === "ar"
                          ? "اسأل عن السجلات أو التقارير أو الاعتمادات…"
                          : "Ask about ERP records, reports or approvals…"
                      }
                      className="min-h-28 w-full resize-y rounded-md border bg-background p-3 text-sm"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      {status?.channels.voice && (
                        <VoiceInput
                          agent={selected}
                          company={company}
                          disabled={!canRun || busy || !status?.channels.voice}
                          onTranscript={(value) =>
                            setPrompt(value.slice(0, 12000))
                          }
                          onError={setError}
                        />
                      )}
                      <Button disabled={!canRun || busy || !prompt.trim()}>
                        {busy ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Send />
                        )}
                        {t(busy ? "Working…" : "Send")}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("Recent conversations")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!runs.some((r) => r.agent === selected) && (
                    <Empty label="No conversations yet." />
                  )}
                  {runs
                    .filter((r) => r.agent === selected)
                    .map((run) => (
                      <button
                        key={run.id}
                        disabled={busy || run.status !== "completed"}
                        className="block w-full rounded-lg border p-3 text-start text-sm hover:bg-muted/30"
                        onClick={() => {
                          setAnswer(run.response || t(run.status))
                          setRunId(run.id)
                          setSources(run.evidence || [])
                        }}
                      >
                        <p className="line-clamp-2">{run.prompt}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {new Date(run.created_at).toLocaleString(locale)}
                        </p>
                      </button>
                    ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
        {mode === "knowledge" && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Upload className="size-5" />
                    {t("Upload")}
                  </CardTitle>
                  <CardDescription>
                    {t("PDF, XLSX, CSV or text · maximum 10 MB")}
                    {ERP_READ_ONLY && (
                      <span className="mt-1 block">
                        {locale === "ar"
                          ? "رفع المستندات معطل في إصدار القراءة فقط."
                          : "Document uploads are disabled in this read-only release."}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const form = e.currentTarget
                      const data = new FormData(form)
                      void perform(async () => {
                        await api("knowledge/upload", company, data)
                        await refresh()
                        form.reset()
                      })
                    }}
                  >
                    <label className="sr-only" htmlFor="collection">
                      {t("Choose collection")}
                    </label>
                    <select
                      id="collection"
                      disabled={ERP_READ_ONLY || busy}
                      name="collection"
                      required
                      value={collection}
                      onChange={(e) => setCollection(e.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="">{t("Choose collection")}</option>
                      {collections
                        .filter((c) => c.upload)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                    </select>
                    <Input
                      aria-label={t("Choose document")}
                      disabled={ERP_READ_ONLY || busy}
                      name="file"
                      type="file"
                      required
                      accept=".pdf,.xlsx,.csv,.txt,.md"
                    />
                    <Button
                      disabled={
                        ERP_READ_ONLY || busy || !collection || !context
                      }
                    >
                      <Upload />
                      {t("Upload")}
                    </Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="size-5" />
                    {t("Approved company knowledge")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void perform(async () =>
                        setResults(
                          await api("knowledge/search", company, { query })
                        )
                      )
                    }}
                  >
                    <Input
                      aria-label={t("Search")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      maxLength={1000}
                      placeholder={t("Search")}
                    />
                    <Button
                      disabled={
                        !context || !query.trim() || busy || !status?.embeddings
                      }
                    >
                      {t("Search")}
                    </Button>
                  </form>
                  {results.map((r) => (
                    <article
                      key={`${r.id}-${r.chunk}`}
                      className="mt-4 rounded-md border p-3 text-sm"
                    >
                      <p className="font-medium">
                        {r.title} · v{r.version}
                      </p>
                      <p
                        className="mt-2 whitespace-pre-wrap text-muted-foreground"
                        dir="auto"
                      >
                        {r.content}
                      </p>
                    </article>
                  ))}
                </CardContent>
              </Card>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
                <RefreshCw />
                {t("Refresh")}
              </Button>
            </div>
            {!docs.length ? (
              <Empty label="No documents yet." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {docs.map((doc) => (
                  <Card key={doc.id}>
                    <CardContent className="space-y-2 pt-5">
                      <FileText className="size-5" />
                      <p className="break-words text-sm font-medium">
                        {doc.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.collection} · v{doc.version}
                      </p>
                      <Badge variant="outline">{t(doc.status)}</Badge>
                      {doc.status === "failed" && (
                        <Button
                          disabled={
                            ERP_READ_ONLY ||
                            busy ||
                            !collections.some(
                              (c) => c.id === doc.collection && c.upload
                            )
                          }
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void perform(async () => {
                              await api("knowledge/retry", company, {
                                id: doc.id,
                              })
                              await refresh()
                            })
                          }
                        >
                          {t("Retry indexing")}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
        {mode === "approvals" && context && (
          <ApprovalInbox key={`${context.user}:${company}`} company={company} />
        )}
        {mode === "approvals" && preview && <Empty label="No proposals yet." />}
        {mode === "field-updates" && (
          <FieldUpdates key={`${context?.user}:${company}`} context={context} />
        )}
        {mode === "notifications" && (
          <>
            {inbox.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("Inbox")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {inbox.map((message) => (
                    <article
                      key={message.provider_id}
                      className="rounded-md border p-3"
                    >
                      <p className="text-xs text-muted-foreground">
                        {message.channel} ·{" "}
                        {new Date(message.created_at).toLocaleString(locale)}
                      </p>
                      <p
                        dir="auto"
                        className="mt-2 whitespace-pre-wrap break-words text-sm"
                      >
                        {message.content}
                      </p>
                    </article>
                  ))}
                </CardContent>
              </Card>
            )}
            {!notices.length && <Empty label="No notifications yet." />}
            {notices.map((n) => (
              <Card key={n.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
                  <Link
                    href={n.href}
                    className="flex items-center gap-3 text-sm"
                  >
                    <Bell className="size-4" />
                    {(() => {
                      const agent = agents.find(
                        (a) => n.title === `${a.name}: approval requested`
                      )
                      return agent
                        ? `${locale === "ar" ? agent.ar : agent.name}: ${t("Approval requested")}`
                        : t(n.title)
                    })()}
                  </Link>
                  {!ERP_READ_ONLY && !n.read_at && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void perform(async () => {
                          await api("notifications/read", company, { id: n.id })
                          await refresh()
                        })
                      }
                    >
                      {t("Mark read")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        )}
        {mode === "integrations" && (
          <>
            <MCPSettings
              key={`${context?.user}:${company}`}
              company={company || ""}
              user={context?.user || ""}
            />
            <InputReadiness key={`inputs:${company}`} company={company} />
            {context?.roles?.includes("System Manager") && (
              <>
                <RolloutReadiness company={company} />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t("ERP discovery")}
                    </CardTitle>
                    <CardDescription>
                      {t(
                        "System Manager access is required to discover ERP metadata."
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      disabled={!context || busy}
                      variant="outline"
                      onClick={() =>
                        void perform(async () =>
                          setInventory(await api("inventory", company))
                        )
                      }
                    >
                      {t("View discovery inventory")}
                    </Button>
                    {inventory != null && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          const url = URL.createObjectURL(
                            new Blob([JSON.stringify(inventory, null, 2)], {
                              type: "application/json",
                            })
                          )
                          const link = document.createElement("a")
                          link.href = url
                          link.download = "ceopanel-discovery.json"
                          link.click()
                          setTimeout(() => URL.revokeObjectURL(url), 1000)
                        }}
                      >
                        {t("Download discovery inventory")}
                      </Button>
                    )}
                    {inventory != null && (
                      <pre
                        dir="ltr"
                        className="max-h-96 overflow-auto rounded border p-4 text-xs"
                      >
                        {JSON.stringify(inventory, null, 2)}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
