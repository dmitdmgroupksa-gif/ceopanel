import type { RecordValues } from "./workspace"
export type OfflineInput = {
  id: string
  owner: string
  company: string
  agent: string
  module: string
  values: RecordValues
  photos: File[]
  photoNames?: string[]
  createdAt: string
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ceopanel-field-inputs", 2)
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains("drafts")
        ? request.transaction!.objectStore("drafts")
        : request.result.createObjectStore("drafts", { keyPath: "id" })
      if (!store.indexNames.contains("ownerCompany"))
        store.createIndex("ownerCompany", ["owner", "company"])
      if (!store.indexNames.contains("owner"))
        store.createIndex("owner", "owner")
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}
async function operation<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", mode)
    let result: T
    transaction.oncomplete = () => {
      db.close()
      resolve(result)
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
    transaction.onabort = transaction.onerror
    try {
      const request = fn(transaction.objectStore("drafts"))
      request.onsuccess = () => {
        result = request.result
      }
    } catch (error) {
      transaction.abort()
      db.close()
      reject(error)
    }
  })
}
export async function offlineInputs(owner: string, company: string) {
  return await operation<OfflineInput[]>("readonly", (store) =>
    store.index("ownerCompany").getAll(IDBKeyRange.only([owner, company])),
  )
}
export async function saveOfflineInput(input: OfflineInput) {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    // Capacity check and insert share a transaction, including across browser tabs.
    const transaction = db.transaction("drafts", "readwrite"),
      store = transaction.objectStore("drafts")
    let capacityError: Error | undefined
    const keys = store.getAllKeys()
    keys.onsuccess = () => {
      if (keys.result.length >= 20 && !keys.result.includes(input.id)) {
        capacityError = new Error(
          "The device queue is full. Submit or remove a saved draft.",
        )
        transaction.abort()
      } else
        store.put({
          ...input,
          photoNames: input.photos.map((photo) => photo.name),
        })
    }
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onabort = transaction.onerror = () => {
      db.close()
      reject(
        capacityError ||
          transaction.error ||
          new Error("Device draft could not be saved."),
      )
    }
  })
}
export async function removeOfflineInput(id: string) {
  await operation("readwrite", (store) => store.delete(id))
}
export async function clearOfflineInputs(owner: string) {
  await operation("readwrite", (store) => {
    const keys = store.index("owner").getAllKeys(IDBKeyRange.only(owner))
    keys.addEventListener("success", () => {
      for (const key of keys.result) store.delete(key)
    })
    return keys
  })
}
