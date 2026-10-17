"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Building2,
  ArrowUpRight,
  ShieldCheck,
  LayoutDashboard,
  Users,
  Workflow,
  LockKeyhole,
} from "lucide-react"
import { LoginForm } from "./login-form"
import { Button } from "./ui/button"
import { LanguageSwitch, useLocale } from "./locale-provider"
import { safeReturnPath } from "@/lib/auth-navigation"

export function LoginPage({
  companyName,
  siteUrl,
  previewEnabled = false,
  frappeLogin = false,
}: {
  companyName: string
  siteUrl: string
  previewEnabled?: boolean
  frappeLogin?: boolean
}) {
  const { t } = useLocale()
  const [expired, setExpired] = useState(false)
  const [incomplete, setIncomplete] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setExpired(params.get("expired") === "1")
    setIncomplete(params.get("logout") === "incomplete")
  }, [])
  async function connected() {
    const params = new URLSearchParams(window.location.search)
    // A redirect from a protected URL may carry its fragment to the login URL.
    const target = safeReturnPath(params.get("next"))
    window.location.replace(
      target.includes("#") ? target : `${target}${window.location.hash}`,
    )
  }
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <section className="login-story relative hidden overflow-hidden bg-[#101c2c] px-12 py-10 text-white lg:flex lg:flex-col xl:px-20">
        <div
          aria-hidden="true"
          className="login-orbit absolute -end-36 top-20 size-[620px] rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="absolute -end-16 top-40 size-[460px] rounded-full border border-white/10"
        />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl border border-white/15 bg-white/5">
            <Building2 className="size-6" />
          </span>
          <div>
            <p className="font-semibold">{companyName}</p>
            <p className="mt-0.5 text-xs text-white/50">
              {t("CEO management platform")}
            </p>
          </div>
        </div>
        <div className="relative my-auto max-w-lg py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            {t("Your company. Connected.")}
          </span>
          <h2 className="mt-7 text-5xl font-semibold leading-[1.12] tracking-tight xl:text-6xl">
            {t("A clearer view of your business.")}
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-white/55">
            {t(
              "Insights, people, and operations. One workspace for the decisions that move your company forward.",
            )}
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              { Icon: LayoutDashboard, label: "Dashboards" },
              { Icon: Users, label: "Teams" },
              { Icon: Workflow, label: "Operations" },
            ].map(({ Icon, label }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <Icon className="mb-4 size-5 text-white/65" />
                <p className="text-xs text-white/65">{t(label)}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/40">
          <ShieldCheck className="size-4" />
          {t("Connected to your existing ERPNext permissions")}
        </p>
      </section>
      <section className="relative flex flex-col px-6 py-6 sm:px-12">
        <div className="flex justify-end">
          <LanguageSwitch />
        </div>
        <div className="mx-auto my-auto w-full max-w-sm py-12">
          <div className="mb-8 flex size-12 items-center justify-center rounded-2xl border bg-muted/40">
            <LockKeyhole className="size-5" />
          </div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {companyName}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("Welcome back")}
          </h1>
          <p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("Sign in with your company ERPNext account to continue.")}
          </p>
          {expired && (
            <p
              role="status"
              className="mb-5 rounded-lg border bg-muted/40 p-3 text-sm"
            >
              {t(
                "Your session expired. Sign in again to continue where you left off.",
              )}
            </p>
          )}
          {incomplete && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-amber-500/30 p-3 text-sm"
            >
              {t(
                "Signed out of this browser. ERPNext was unreachable; sign out of your ERPNext site to revoke the remote session.",
              )}
            </p>
          )}
          {frappeLogin ? (
            <Button
              className="w-full"
              onClick={() => {
                const next = safeReturnPath(
                  new URLSearchParams(window.location.search).get("next"),
                )
                window.location.assign(
                  `/api/erpnext/oauth/start?${new URLSearchParams({ next })}`,
                )
              }}
            >
              {t("Sign in on Frappe")}
            </Button>
          ) : (
            <LoginForm siteUrl={siteUrl} onConnected={connected} />
          )}
          {previewEnabled && (
            <Button asChild variant="outline" className="mt-3 h-11 w-full">
              <Link href="/">{t("Open local preview")}</Link>
            </Button>
          )}
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            {t(
              "Use the account provided by your administrator. Your existing ERPNext permissions apply.",
            )}
          </p>
          <a
            href={`${siteUrl}/login`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {new URL(siteUrl).host}
            <ArrowUpRight className="size-3" />
          </a>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          {t(
            "Your password is sent to your company’s ERPNext site and is not saved by this platform.",
          )}
        </p>
      </section>
    </main>
  )
}
