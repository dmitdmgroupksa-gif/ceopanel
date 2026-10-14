"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bot,
  BookOpen,
  CircleCheck,
  Bell,
  Settings2,
  LayoutDashboard,
  Building2,
} from "lucide-react"
import { LanguageSwitch, useLocale } from "./locale-provider"
export function PlatformLinks() {
  const { t } = useLocale(),
    path = usePathname()
  const links = [
    { href: "/", label: "Dashboards", Icon: LayoutDashboard },
    { href: "/workspace", label: "ERP workspace", Icon: Building2 },
    { href: "/agents", label: "Agents", Icon: Bot },
    { href: "/knowledge", label: "Knowledge", Icon: BookOpen },
    { href: "/field-updates", label: "Field updates", Icon: Building2 },
    { href: "/approvals", label: "Approvals", Icon: CircleCheck },
    { href: "/notifications", label: "Notifications", Icon: Bell },
    { href: "/integrations", label: "Integration setup", Icon: Settings2 },
  ]
  return (
    <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
      <nav
        aria-label={t("CEO management platform")}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        {links.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${path === href ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Icon className="size-4" />
            {t(label)}
          </Link>
        ))}
      </nav>
      <LanguageSwitch />
    </div>
  )
}
