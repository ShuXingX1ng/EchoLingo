// Generic factory that encapsulates the local-read / cloud-write / local-fallback
// pattern shared by unified-task-history.ts and unified-vocabulary.ts.
//
// Only the three operations both modules actually share are modelled here.
// Module-specific queries (getTaskById, getTasksByType, …) stay in their own file.

export interface LocalAdapter<T, TInput> {
  save(item: TInput): T
  listAll(): T[]
  delete(id: string): boolean
  /** Called after a successful cloud save; use cloudResult or input as needed. */
  mirror(cloudResult: T, input: TInput): void
}

export interface CloudAdapter<T, TInput> {
  isLoggedIn(): Promise<boolean>
  save(item: TInput): Promise<T | null>
  listAll(): Promise<T[]>
  delete(id: string): Promise<boolean>
}

export interface SyncedStore<T, TInput> {
  save(item: TInput): Promise<T>
  listAll(): Promise<T[]>
  delete(id: string): Promise<boolean>
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("cloud_timeout")), ms)),
  ])
}

const LIST_CACHE_TTL_MS = 30_000

export function createSyncedStore<T, TInput>(
  local: LocalAdapter<T, TInput>,
  cloud: CloudAdapter<T, TInput>
): SyncedStore<T, TInput> {
  let listCache: { data: T[]; expiry: number } | null = null

  // Cached login check so every listAll/save/delete doesn't re-hit the network.
  let loginCache: { value: boolean; expiry: number } | null = null
  async function isLoggedIn(): Promise<boolean> {
    const now = Date.now()
    if (loginCache && now < loginCache.expiry) return loginCache.value
    const value = await withTimeout(cloud.isLoggedIn(), 5000)
    loginCache = { value, expiry: now + LIST_CACHE_TTL_MS }
    return value
  }

  return {
    async save(item) {
      try {
        if (await isLoggedIn()) {
          const result = await withTimeout(cloud.save(item), 8000)
          if (result) {
            local.mirror(result, item)
            listCache = null // invalidate so next listAll re-fetches
            return result
          }
        }
      } catch (error) {
        console.warn("Cloud save failed, falling back to local:", error)
      }
      listCache = null
      return local.save(item)
    },

    async listAll() {
      const now = Date.now()
      if (listCache && now < listCache.expiry) return listCache.data
      try {
        if (await isLoggedIn()) {
          const results = await withTimeout(cloud.listAll(), 8000)
          if (results.length > 0) {
            listCache = { data: results, expiry: now + LIST_CACHE_TTL_MS }
            return results
          }
        }
      } catch {
        // cloud unreachable or timed out — fall through to local
      }
      const local_data = local.listAll()
      listCache = { data: local_data, expiry: now + LIST_CACHE_TTL_MS }
      return local_data
    },

    async delete(id) {
      listCache = null
      try {
        if (await isLoggedIn()) {
          const ok = await withTimeout(cloud.delete(id), 8000)
          local.delete(id)
          return ok
        }
      } catch {
        // fall through to local-only delete
      }
      return local.delete(id)
    },
  }
}
