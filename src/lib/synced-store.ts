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

export function createSyncedStore<T, TInput>(
  local: LocalAdapter<T, TInput>,
  cloud: CloudAdapter<T, TInput>
): SyncedStore<T, TInput> {
  return {
    async save(item) {
      try {
        if (await withTimeout(cloud.isLoggedIn(), 5000)) {
          const result = await withTimeout(cloud.save(item), 8000)
          if (result) {
            local.mirror(result, item)
            return result
          }
        }
      } catch (error) {
        console.warn("Cloud save failed, falling back to local:", error)
      }
      return local.save(item)
    },

    async listAll() {
      try {
        if (await withTimeout(cloud.isLoggedIn(), 5000)) {
          const results = await withTimeout(cloud.listAll(), 8000)
          if (results.length > 0) return results
        }
      } catch {
        // cloud unreachable or timed out — fall through to local
      }
      return local.listAll()
    },

    async delete(id) {
      try {
        if (await withTimeout(cloud.isLoggedIn(), 5000)) {
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
