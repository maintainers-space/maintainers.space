// Minimal IndexedDB key-value store backing the persisted client cache
// (~/lib/cache.ts). One object store, string keys, structured-clone values.
// Every operation is best-effort: IndexedDB can be unavailable (private
// browsing, storage pressure) or throw for reasons outside our control, and
// losing the persisted cache should never break the app — it just falls back
// to a normal network fetch.

const DB_NAME = 'maintainers.space'
const DB_VERSION = 1
const STORE_NAME = 'cache'

let dbPromise: Promise<IDBDatabase | null> | null = null

function available(): boolean {
  return import.meta.client && typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase | null> {
  if (!available()) return Promise.resolve(null)
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.addEventListener('upgradeneeded', () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME)
        }
      })
      req.addEventListener('success', () => resolve(req.result))
      req.addEventListener('error', () => resolve(null))
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
      req.addEventListener('success', () => resolve(req.result as T | undefined))
      req.addEventListener('error', () => resolve(undefined))
    } catch {
      resolve(undefined)
    }
  })
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.addEventListener('complete', () => resolve())
      tx.addEventListener('error', () => resolve())
    } catch {
      resolve()
    }
  })
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.addEventListener('complete', () => resolve())
      tx.addEventListener('error', () => resolve())
    } catch {
      resolve()
    }
  })
}

/** Delete every key starting with `prefix`. */
export async function idbDeletePrefix(prefix: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.openCursor()
      req.addEventListener('success', () => {
        const cursor = req.result
        if (!cursor) return
        if (String(cursor.key).startsWith(prefix)) cursor.delete()
        cursor.continue()
      })
      tx.addEventListener('complete', () => resolve())
      tx.addEventListener('error', () => resolve())
    } catch {
      resolve()
    }
  })
}

export async function idbClear(): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.addEventListener('complete', () => resolve())
      tx.addEventListener('error', () => resolve())
    } catch {
      resolve()
    }
  })
}

/** List every key in the store, optionally restricted to `prefix`. */
export async function idbKeys(prefix = ''): Promise<string[]> {
  const db = await openDb()
  if (!db) return []
  return new Promise((resolve) => {
    const keys: string[] = []
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).openCursor()
      req.addEventListener('success', () => {
        const cursor = req.result
        if (!cursor) return
        const key = String(cursor.key)
        if (!prefix || key.startsWith(prefix)) keys.push(key)
        cursor.continue()
      })
      tx.addEventListener('complete', () => resolve(keys))
      tx.addEventListener('error', () => resolve(keys))
    } catch {
      resolve(keys)
    }
  })
}
