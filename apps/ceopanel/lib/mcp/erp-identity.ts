import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
const delegated = new AsyncLocalStorage<{ sid: string }>()
export const delegatedSid = () => delegated.getStore()?.sid
export function withDelegatedERP<T>(sid: string, fn: () => T): T {
  if (!/^[A-Za-z0-9_-]+$/.test(sid))
    throw new Error("Invalid delegated ERP session")
  return delegated.run({ sid }, fn)
}
