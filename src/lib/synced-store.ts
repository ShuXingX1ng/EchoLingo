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

export function createSyncedStore<T, TInput>(
  local: LocalAdapter<T, TInput>,
  cloud: CloudAdapter<T, TInput>
): SyncedStore<T, TInput> {
  return {
    async save(item) {
      if (await cloud.isLoggedIn()) {
        try {
          const result = await cloud.save(item)
          if (result) {
            local.mirror(result, item)
            return result
          }
        } catch (error) {
          console.warn("Cloud save failed, falling back to local:", error)
        }
      }
      return local.save(item)
    },

    async listAll() {
      if (await cloud.isLoggedIn()) {
        const results = await cloud.listAll()
        if (results.length > 0) return results
      }
      return local.listAll()
    },

    async delete(id) {
      if (await cloud.isLoggedIn()) {
        const ok = await cloud.delete(id)
        local.delete(id)
        return ok
      }
      return local.delete(id)
    },
  }
}
