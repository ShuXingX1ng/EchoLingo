import type { VocabularyEntry, WordLookupResult } from "@/types"

// localStorage fallback for the Vocabulary List (see ADR 0006). Used when the
// learner is not logged in, and as a mirror of the cloud copy when they are.

const STORAGE_KEY = "echolingo_vocabulary"
const MAX_ENTRIES = 500

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function getVocabulary(): VocabularyEntry[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? (JSON.parse(data) as VocabularyEntry[]) : []
  } catch {
    return []
  }
}

function writeVocabulary(entries: VocabularyEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      entries.length = Math.floor(entries.length / 2)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    }
  }
}

/** Save a looked-up word. De-duplicates by text (case-insensitive). */
export function saveVocabulary(result: WordLookupResult): VocabularyEntry {
  const entries = getVocabulary()
  const existing = entries.find(
    (e) => e.text.toLowerCase() === result.text.toLowerCase()
  )
  if (existing) return existing

  const entry: VocabularyEntry = {
    id: createId(),
    text: result.text,
    phonetic: result.phonetic,
    source: result.source,
    entries: result.entries,
    tags: result.tags,
    createdAt: new Date().toISOString(),
  }
  const next = [entry, ...entries]
  if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES
  writeVocabulary(next)
  return entry
}

/** Mirror an already-created entry (e.g. the cloud copy) locally, by id. */
export function upsertVocabulary(entry: VocabularyEntry): void {
  const entries = getVocabulary().filter(
    (e) => e.id !== entry.id && e.text.toLowerCase() !== entry.text.toLowerCase()
  )
  const next = [entry, ...entries]
  if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES
  writeVocabulary(next)
}

export function deleteVocabulary(id: string): boolean {
  const entries = getVocabulary()
  const next = entries.filter((e) => e.id !== id)
  if (next.length === entries.length) return false
  writeVocabulary(next)
  return true
}

export function isSaved(text: string): boolean {
  return getVocabulary().some(
    (e) => e.text.toLowerCase() === text.toLowerCase()
  )
}

/** Merge entries (e.g. from a backup import), de-duplicating by text. */
export function restoreVocabulary(incoming: VocabularyEntry[]): number {
  const entries = getVocabulary()
  const seen = new Set(entries.map((e) => e.text.toLowerCase()))
  const merged = [...entries]
  let added = 0
  for (const entry of incoming) {
    if (!seen.has(entry.text.toLowerCase())) {
      seen.add(entry.text.toLowerCase())
      merged.push(entry)
      added++
    }
  }
  merged.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  if (merged.length > MAX_ENTRIES) merged.length = MAX_ENTRIES
  writeVocabulary(merged)
  return added
}
