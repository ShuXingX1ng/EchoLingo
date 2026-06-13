import type { VocabularyEntry, WordLookupResult } from "@/types"
import * as local from "./vocabulary"
import * as cloud from "./supabase-vocabulary"

// Cloud-synced Vocabulary List with localStorage fallback, mirroring the
// unified-task-history.ts pattern. See ADR 0006 for why this feature syncs to
// the cloud from v1 instead of the project's usual localStorage-first default.

async function isAuthenticated(): Promise<boolean> {
  return cloud.isUserLoggedIn()
}

export async function saveVocabulary(
  result: WordLookupResult
): Promise<VocabularyEntry> {
  if (await isAuthenticated()) {
    try {
      const saved = await cloud.saveVocabularyToCloud(result)
      if (saved) {
        local.upsertVocabulary(saved) // mirror with the cloud id
        return saved
      }
    } catch (error) {
      console.warn("Cloud vocabulary save failed, falling back to local:", error)
    }
  }
  return local.saveVocabulary(result)
}

export async function getVocabulary(): Promise<VocabularyEntry[]> {
  if (await isAuthenticated()) {
    const cloudEntries = await cloud.getVocabularyFromCloud()
    if (cloudEntries.length > 0) return cloudEntries
  }
  return local.getVocabulary()
}

export async function deleteVocabulary(id: string): Promise<boolean> {
  if (await isAuthenticated()) {
    const ok = await cloud.deleteVocabularyFromCloud(id)
    local.deleteVocabulary(id)
    return ok
  }
  return local.deleteVocabulary(id)
}
