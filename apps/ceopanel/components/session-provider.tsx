"use client"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { LoaderCircle, ShieldCheck } from "lucide-react"
import type { DashboardContext } from "@/lib/dashboard-server"
import { isPortalPath, loginPath } from "@/lib/auth-navigation"
import { AppSidebar } from "./platform-links"
import { Button } from "./ui/button"
import { useLocale } from "./locale-provider"

type Session = {
  preview: boolean
  previewCompany?: string
  context: DashboardContext | null
  setContext: React.Dispatch<React.SetStateAction<DashboardContext | null>>
  expire: () => void
  signOut: () => Promise<void>
}
const SessionContext = createContext<Session | null>(null)
export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error("Company pages require a session provider.")
  return session
}

export function SessionProvider({
  children,
  previewCompany,
}: {
  children: React.ReactNode
  previewCompany?: string
}) {
  const path = usePathname()
  return isPortalPath(path) ? (
    previewCompany ? (
      <PreviewSession company={previewCompany}>{children}</PreviewSession>
    ) : (
      <ProtectedSession>{children}</ProtectedSession>
    )
  ) : (
    children
  )
}

function PreviewSession({
  children,
  company,
}: {
  children: React.ReactNode
  company: string
}) {
  const router = useRouter()
  return (
    <SessionContext.Provider
      value={{
        preview: true,
        previewCompany: company,
        context: null,
        setContext: () => {},
        expire: () => {},
        signOut: async () => {
          router.push("/login")
        },
      }}
    >
      <AppSidebar>{children}</AppSidebar>
    </SessionContext.Provider>
  )
}

function ProtectedSession({ children }: { children: React.ReactNode }) {
  const { t } = useLocale()
  const router = useRouter()
  const [context, setContext] = useState<DashboardContext | null>(null)
  const [error, setError] = useState("")
  const [checking, setChecking] = useState(true)
  const controller = useRef<AbortController | null>(null)
  const company = useRef<string | undefined>(undefined)
  company.current = context?.company
  const updateContext = useCallback<Session["setContext"]>((value) => {
    controller.current?.abort()
    setContext(value)
  }, [])
  const expire = useCallback(() => {
    controller.current?.abort()
    setContext(null)
    setChecking(true)
    router.replace(
      loginPath(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
        true,
      ),
    )
  }, [router])
  const check = useCallback(async () => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setError("")
    setChecking(true)
    try {
      const params = company.current
        ? `?company=${encodeURIComponent(company.current)}`
        : ""
      const response = await fetch(`/api/erpnext/context${params}`, {
        cache: "no-store",
        signal: abort.signal,
      })
      if (abort.signal.aborted) return
      if (response.status === 401) {
        expire()
        return
      }
      const body = await response.json()
      if (!response.ok)
        throw new Error(
          body.error || "Your company session could not be verified.",
        )
      if (!abort.signal.aborted) setContext(body)
    } catch (cause) {
      if (!abort.signal.aborted) {
        setContext(null)
        setError(
          cause instanceof Error
            ? cause.message
            : "Your company session could not be verified.",
        )
      }
    } finally {
      if (!abort.signal.aborted) setChecking(false)
    }
  }, [expire])
  useEffect(() => {
    void check()
    const focus = () => {
      if (document.visibilityState === "visible") void check()
    }
    window.addEventListener("focus", focus)
    window.addEventListener("ceopanel:session-expired", expire)
    const timer = setInterval(focus, 60000)
    return () => {
      controller.current?.abort()
      window.removeEventListener("focus", focus)
      window.removeEventListener("ceopanel:session-expired", expire)
      clearInterval(timer)
    }
  }, [check, expire])
  const signOut = useCallback(async () => {
    const response = await fetch("/api/erpnext/session", { method: "DELETE" })
    if (!response.ok) throw new Error("Sign-out failed. Please try again.")
    const result = await response.json()
    controller.current?.abort()
    setContext(null)
    router.replace(
      result.remoteSessionRevoked === false
        ? "/login?logout=incomplete"
        : "/login",
    )
    router.refresh()
  }, [router])

  // A cookie only passes the optimistic proxy. Never mount company views until
  // the server has checked the native session and permitted company list.
  if (!context)
    return (
      <main className="grid min-h-svh place-items-center px-6">
        <div className="max-w-md space-y-4 text-center">
          <ShieldCheck className="mx-auto size-10 text-primary" />
          {checking ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <LoaderCircle className="size-4 animate-spin" />
              {t("Verifying your company session…")}
            </p>
          ) : (
            <>
              <p role="alert" className="text-sm text-destructive">
                {t(error)}
              </p>
              <Button onClick={() => void check()}>{t("Try again")}</Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void signOut().catch((cause) => setError(cause.message))
                }
              >
                {t("Sign out")}
              </Button>
            </>
          )}
        </div>
      </main>
    )
  return (
    <SessionContext.Provider
      value={{
        preview: false,
        context,
        setContext: updateContext,
        expire,
        signOut,
      }}
    >
      <AppSidebar>{children}</AppSidebar>
    </SessionContext.Provider>
  )
}
