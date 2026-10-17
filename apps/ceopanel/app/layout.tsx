import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"
import { cookies, headers } from "next/headers"
import { LocaleProvider } from "@/components/locale-provider"
import { SessionProvider } from "@/components/session-provider"
import { localAuthDisabled } from "@/lib/auth-mode"
import { companyName, SESSION_COOKIE } from "@/lib/erpnext-server"

export const metadata: Metadata = {
  title: "Durar Masagh | CEO Panel",
  description:
    "Company performance, finance, operations, and people connected to ERPNext.",
  robots: { index: false, follow: false },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const locale =
    cookieStore.get("ceopanel_locale")?.value === "ar" ? "ar" : "en"
  const previewCompany =
    localAuthDisabled((await headers()).get("host") || "") &&
    !cookieStore.get(SESSION_COOKIE)?.value
      ? process.env.ERPNEXT_COMPANY || companyName
      : undefined
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <LocaleProvider initial={locale}>
            <SessionProvider previewCompany={previewCompany}>
              {children}
            </SessionProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
