"use client"
import { sessionFetch as fetch } from "@/lib/session-fetch"
import { useEffect, useState } from "react"
import { Input } from "./ui/input"
export function ERPLinkField({
  id,
  module,
  field,
  company,
  value,
  required,
  disabled,
  onChange,
}: {
  id: string
  module: string
  field: string
  company?: string
  value: string
  required?: boolean
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    setNames([])
    if (disabled) return
    const controller = new AbortController(),
      timer = setTimeout(() => {
        const params = new URLSearchParams({ module, field, search: value })
        if (company) params.set("company", company)
        void fetch(`/api/platform/links?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        })
          .then(async (response) => {
            if (response.ok) {
              const names = await response.json()
              if (!controller.signal.aborted) setNames(names)
            }
          })
          .catch(() => {})
      }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [module, field, company, value, disabled])
  return (
    <>
      <Input
        id={id}
        list={`${id}-options`}
        value={value}
        required={required}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={`${id}-options`}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  )
}
