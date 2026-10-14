import type { RecordValues } from "./workspace"
export type OfflineInput = {
  id: string
  owner: string
  company: string
  agent: string
  module: string
  values: RecordValues
  photos: File[]
  createdAt: string
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ceopanel-field-inputs", 1)
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "id" })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function operation<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", mode),
      request = fn(transaction.objectStore("drafts"))
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    transaction.oncomplete = () => {
      db.close()
      resolve(result)
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}
export async function offlineInputs(owner: string, company: string) {
  const all = await operation("readonly", (store) => store.getAll())
  return (all as OfflineInput[]).filter(
    (row) => row.owner === owner && row.company === company,
  )
}
export async function saveOfflineInput(input: OfflineInput) {
  const all = await operation("readonly", (store) => store.getAll())
  if (all.length >= 20)
    throw new Error("The device queue is full. Submit or remove a saved draft.")
  await operation("readwrite", (store) => store.put(input))
}
export async function removeOfflineInput(id: string) {
  await operation("readwrite", (store) => store.delete(id))
}
export async function clearOfflineInputs(owner: string) {
  const all = await operation("readonly", (store) => store.getAll())
  for (const input of all as OfflineInput[])
    if (input.owner === owner) await removeOfflineInput(input.id)
}
