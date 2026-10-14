import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"
import { cookies } from "next/headers"
import { LocaleProvider } from "@/components/locale-provider"

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
  const locale =
    (await cookies()).get("ceopanel_locale")?.value === "ar" ? "ar" : "en"
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <LocaleProvider initial={locale}>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
