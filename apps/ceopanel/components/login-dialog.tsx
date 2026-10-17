"use client"
import { useLocale } from "./locale-provider"
import { LockKeyhole } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import { LoginForm } from "./login-form"

// OAuth consent uses the same credential and two-factor flow as the login page.
export function LoginDialog({
  open,
  onOpenChange,
  siteUrl,
  onConnected,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  siteUrl: string
  onConnected: () => Promise<void>
}) {
  const { t } = useLocale()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl border bg-muted">
            <LockKeyhole className="size-5" />
          </div>
          <DialogTitle>{t("Connect to your company")}</DialogTitle>
          <DialogDescription>
            {t("Sign in with your ERPNext account at")} {new URL(siteUrl).host}.{" "}
            {t(
              "Your existing permissions determine which company records you can view.",
            )}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <LoginForm
            siteUrl={siteUrl}
            onConnected={async () => {
              await onConnected()
              onOpenChange(false)
            }}
          />
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t(
            "Your password is sent to your company’s ERPNext site and is not saved by this platform.",
          )}
        </p>
      </DialogContent>
    </Dialog>
  )
}
