import type { VocabularyEntry, WordLookupResult } from "@/types"
import * as local from "./vocabulary"
import * as cloud from "./supabase-vocabulary"
import { createSyncedStore } from "./synced-store"

// Cloud-synced Vocabulary List with localStorage fallback, mirroring the
// unified-task-history.ts pattern. See ADR 0006 for why this feature syncs to
// the cloud from v1 instead of the project's usual localStorage-first default.

const store = createSyncedStore<VocabularyEntry, WordLookupResult>(
  {
    save: (item) => local.saveVocabulary(item),
    listAll: () => local.getVocabulary(),
    delete: (id) => local.deleteVocabulary(id),
    // Mirror the cloud copy (with its cloud id) so local and cloud stay in sync.
    mirror: (cloudResult) => { local.upsertVocabulary(cloudResult) },
  },
  {
    isLoggedIn: () => cloud.isUserLoggedIn(),
    save: (item) => cloud.saveVocabularyToCloud(item),
    listAll: () => cloud.getVocabularyFromCloud(),
    delete: (id) => cloud.deleteVocabularyFromCloud(id),
  }
)

export async function saveVocabulary(result: WordLookupResult): Promise<VocabularyEntry> {
  return store.save(result)
}

export async function getVocabulary(): Promise<VocabularyEntry[]> {
  return store.listAll()
}

export async function deleteVocabulary(id: string): Promise<boolean> {
  return store.delete(id)
}
