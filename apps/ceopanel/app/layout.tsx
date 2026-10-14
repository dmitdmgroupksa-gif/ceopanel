import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

export const metadata: Metadata = {
  title: "Durar Masagh | CEO Panel",
  description:
    "Company performance, finance, operations, and people connected to ERPNext.",
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
