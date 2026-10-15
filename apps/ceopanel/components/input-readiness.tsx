"use client"
import { useEffect, useState } from "react"
import { inputCategories } from "@/lib/platform/input-catalog"
import { useLocale } from "./locale-provider"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card"
import { Badge } from "./ui/badge"
type Readiness = {
  categories: {
    id: string
    mappedCount: number
    modules: { id: string; state: string }[]
  }[]
  external: { id: string; title: string; state: string; type: string }[]
}
export function InputReadiness({ company }: { company?: string }) {
  const { locale } = useLocale(),
    ar = locale === "ar"
  const [readiness, setReadiness] = useState<Readiness | null>(null),
    [error, setError] = useState("")
  useEffect(() => {
    const abort = new AbortController()
    setReadiness(null)
    setError("")
    if (company)
      void fetch(`/api/platform/inputs?${new URLSearchParams({ company })}`, {
        signal: abort.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error)
          if (!abort.signal.aborted) setReadiness(data)
        })
        .catch((e) => {
          if (!abort.signal.aborted)
            setError(
              e instanceof Error
                ? e.message
                : "Unable to load input configuration.",
            )
        })
    return () => abort.abort()
  }, [company])
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar ? "مصادر البيانات" : "Data inputs"}</CardTitle>
        <CardDescription>
          {ar
            ? "ERPNext هو المصدر الأساسي. يتم التحقق من الحقول والصلاحيات قبل تفعيل كل مصدر."
            : "ERPNext is the primary source. Fields and permissions are verified before each source is enabled."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="status" className="text-sm text-muted-foreground">
            {error}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inputCategories.map((c) => {
            const mapped =
              readiness?.categories.find((r) => r.id === c.id)?.mappedCount || 0
            return (
              <div key={c.id} className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">{ar ? c.ar : c.title}</p>
                <Badge variant="outline">
                  {mapped
                    ? ar
                      ? `${mapped} مصادر بإعداد معتمد`
                      : `${mapped} validated mappings`
                    : ar
                      ? "بانتظار الإعداد"
                      : "Awaiting configuration"}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {ar
                    ? "مصدر ERP مهيأ للربط؛ التحقق الفعلي مطلوب."
                    : "ERP source prepared; live verification required."}
                </p>
              </div>
            )
          })}
        </div>
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">
            {ar
              ? "جاهزية الخدمات المصرفية السعودية"
              : "Saudi banking preparation"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {ar
              ? "حسابات البنك والحركات والمدفوعات والتسوية من ERPNext أولاً. موصلات البنوك والمزودين تنتظر تحديد المزود والتحقق. لا توجد تحويلات بنكية مباشرة مفعلة."
              : "Bank accounts, transactions, payments and reconciliation come from ERPNext first. Direct bank/provider adapters await selection and validation. Direct transfers are disabled."}
          </p>
        </div>
        {!!readiness?.external.length && (
          <ul className="space-y-2 text-sm">
            {readiness.external.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2">
                <span>{s.title}</span>
                <span className="text-muted-foreground">
                  {ar
                    ? "يتطلب التحقق قبل التفعيل"
                    : s.state.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
