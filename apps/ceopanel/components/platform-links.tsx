"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { Dialog, Tooltip } from "radix-ui"
import {
  Bot,
  BookOpen,
  CircleCheck,
  Bell,
  Settings2,
  LayoutDashboard,
  Building2,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  LogOut,
  LoaderCircle,
  Moon,
  Sun,
} from "lucide-react"
import { useTheme } from "next-themes"
import { LanguageSwitch, useLocale } from "./locale-provider"
import { useSession } from "./session-provider"
import { Button } from "./ui/button"

const links = [
  { href: "/", label: "Dashboards", Icon: LayoutDashboard },
  { href: "/workspace", label: "ERP workspace", Icon: Building2 },
  { href: "/agents", label: "Agents", Icon: Bot },
  { href: "/knowledge", label: "Knowledge", Icon: BookOpen },
  { href: "/field-updates", label: "Field updates", Icon: ClipboardList },
  { href: "/approvals", label: "Approvals", Icon: CircleCheck },
  { href: "/notifications", label: "Notifications", Icon: Bell },
  { href: "/integrations", label: "Integration setup", Icon: Settings2 },
]
const NavigationContext = createContext<(() => void) | null>(null)

export function IconHint({
  label,
  children,
  side = "bottom",
  disabled = false,
}: {
  label: string
  children: React.ReactNode
  side?: "bottom" | "left" | "right"
  disabled?: boolean
}) {
  return (
    <Tooltip.Root open={disabled ? false : undefined}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={10}
          collisionPadding={12}
          className="nav-hint z-[80] max-w-64 rounded-lg border border-border/70 bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-xl"
        >
          {label}
          <Tooltip.Arrow className="fill-popover" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function AppSidebar({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useLocale()
  const path = usePathname()
  const { context, signOut, preview, previewCompany } = useSession()
  const accountLabel = preview ? t("Local preview") : context?.user
  const companyLabel = context?.company || previewCompany
  const exitLabel = t(preview ? "Back to sign in" : "Sign out")
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const mobileTrigger = useRef<HTMLElement | null>(null)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    try {
      setCollapsed(
        localStorage.getItem("ceopanel_sidebar_collapsed") === "true",
      )
    } catch {}
  }, [])
  useEffect(() => {
    setMobile(false)
  }, [path])
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const close = () => {
      if (media.matches) setMobile(false)
    }
    media.addEventListener("change", close)
    return () => media.removeEventListener("change", close)
  }, [])
  function toggle() {
    setCollapsed((value) => {
      try {
        localStorage.setItem("ceopanel_sidebar_collapsed", String(!value))
      } catch {}
      return !value
    })
  }
  async function logout() {
    setBusy(true)
    setError("")
    try {
      await signOut()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed.")
    } finally {
      setBusy(false)
    }
  }
  function contents(compact: boolean) {
    return (
      <>
        <div
          className={`flex h-16 shrink-0 items-center border-b px-4 ${compact ? "justify-center" : "gap-3"}`}
        >
          <Link
            href="/"
            aria-label={t("CEO management platform")}
            onClick={() => setMobile(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Building2 className="size-5" />
          </Link>
          {!compact && (
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">
                Durar Masagh
              </p>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-5">
          <nav aria-label={t("Main navigation")} className="space-y-1.5">
            {links.map(({ href, label, Icon }) => (
              <IconHint
                key={href}
                label={t(label)}
                side={locale === "ar" ? "left" : "right"}
                disabled={!compact}
              >
                <Link
                  href={href}
                  aria-label={t(label)}
                  aria-current={path === href ? "page" : undefined}
                  onClick={() => setMobile(false)}
                  className={`sidebar-link group relative flex h-10 items-center rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${compact ? "justify-center" : "gap-3 px-3"} ${path === href ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                  {!compact && <span className="truncate">{t(label)}</span>}
                </Link>
              </IconHint>
            ))}
          </nav>
        </div>
        <div className="shrink-0 space-y-3 border-t p-3">
          {!compact && (
            <div className="px-1">
              <p className="truncate text-xs" title={accountLabel}>
                {accountLabel}
              </p>
              <p
                className="mt-1 truncate text-[10px] text-muted-foreground"
                title={companyLabel}
              >
                {companyLabel}
              </p>
            </div>
          )}
          <div
            className={`flex items-center ${compact ? "flex-col gap-3" : "justify-between"}`}
          >
            {compact ? (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Change language"
                onClick={() => setLocale(locale === "en" ? "ar" : "en")}
              >
                {locale === "en" ? "ع" : "EN"}
              </Button>
            ) : (
              <LanguageSwitch />
            )}
            <IconHint
              label={t("Toggle color theme")}
              side={locale === "ar" ? "left" : "right"}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle color theme"
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
              >
                {mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
              </Button>
            </IconHint>
            <IconHint
              label={exitLabel}
              side={locale === "ar" ? "left" : "right"}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={exitLabel}
                disabled={busy}
                onClick={() => void logout()}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <LogOut />}
              </Button>
            </IconHint>
          </div>
          {error && (
            <p role="alert" className="break-words text-xs text-destructive">
              {t(error)}
            </p>
          )}
        </div>
      </>
    )
  }
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={100}>
      <NavigationContext.Provider
        value={() => {
          mobileTrigger.current = document.activeElement as HTMLElement
          setMobile(true)
        }}
      >
        <div className={`portal-shell ${collapsed ? "sidebar-compact" : ""}`}>
          <aside
            data-slot="sidebar"
            aria-label={t("Workspace sidebar")}
            className="portal-sidebar fixed inset-y-0 start-0 z-40 hidden flex-col border-e bg-card lg:flex"
          >
            {contents(collapsed)}
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute -end-4 top-[88px] size-8 rounded-full bg-background shadow-sm"
              aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
              aria-expanded={!collapsed}
              onClick={toggle}
            >
              {collapsed ? (
                <PanelLeftOpen className="rtl:rotate-180" />
              ) : (
                <PanelLeftClose className="rtl:rotate-180" />
              )}
            </Button>
          </aside>
          <Dialog.Root open={mobile} onOpenChange={setMobile}>
            <Dialog.Portal>
              <Dialog.Overlay className="sidebar-overlay fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
              <Dialog.Content
                onCloseAutoFocus={(event) => {
                  event.preventDefault()
                  if (mobileTrigger.current?.isConnected)
                    mobileTrigger.current.focus()
                }}
                aria-describedby={undefined}
                className="sidebar-drawer fixed inset-y-0 start-0 z-50 flex w-[min(19rem,calc(100vw-3rem))] flex-col border-e bg-card shadow-2xl outline-none"
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <Dialog.Title className="sr-only">
                  {t("Main navigation")}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button
                    aria-label={t("Close navigation")}
                    variant="ghost"
                    size="icon-sm"
                    className="absolute end-2 top-2"
                  >
                    <X />
                  </Button>
                </Dialog.Close>
                {contents(false)}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <div className="portal-content min-w-0">{children}</div>
        </div>
      </NavigationContext.Provider>
    </Tooltip.Provider>
  )
}

export function PlatformLinks({ compact = false }: { compact?: boolean }) {
  const open = useContext(NavigationContext)
  const { t } = useLocale()
  const { context, previewCompany } = useSession()
  const trigger = (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => open?.()}
      aria-label={t("Open navigation")}
      className="shrink-0 lg:hidden"
    >
      <Menu className="size-4" />
    </Button>
  )
  if (compact) return trigger
  return (
    <div className="flex h-12 items-center gap-3 px-4 lg:hidden">
      {trigger}
      <span className="truncate text-sm font-medium">
        {context?.company || previewCompany}
      </span>
    </div>
  )
}
