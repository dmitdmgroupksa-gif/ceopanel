"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { Button } from "./ui/button"
import { arabic } from "@/lib/i18n"
type Locale = "en" | "ar"
const context = createContext({
  locale: "en" as Locale,
  setLocale: (_locale: Locale) => {},
  t: (value: string) => value,
})
export function LocaleProvider({
  children,
  initial = "en",
}: {
  children: React.ReactNode
  initial?: Locale
}) {
  const [locale, setLocale] = useState(initial)
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"
    document.cookie = `ceopanel_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`
  }, [locale])
  const t = (value: string) =>
    locale === "ar" ? arabic[value] || value : value
  return (
    <context.Provider value={{ locale, setLocale, t }}>
      {children}
    </context.Provider>
  )
}
export function useLocale() {
  return useContext(context)
}
export function LanguageSwitch() {
  const { locale, setLocale } = useLocale()
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Change language"
      onClick={() => setLocale(locale === "en" ? "ar" : "en")}
    >
      {locale === "en" ? "العربية" : "English"}
    </Button>
  )
}
