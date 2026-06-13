// Supabase storage for the Vocabulary List. Requires the `vocabulary` table
// from supabase-migration-003.sql (table + RLS). Mirrors the
// supabase-task-history.ts pattern. See ADR 0006.

import { createClient } from "./supabase"
import type { VocabularyEntry, WordLookupResult, WordLookupEntry } from "@/types"

type DbVocab = {
  id: string
  user_id: string
  text: string
  phonetic: string
  source: "dictionary" | "ai"
  entries: WordLookupEntry[]
  tags: string[]
  created_at: string
}

function dbToEntry(db: DbVocab): VocabularyEntry {
  return {
    id: db.id,
    text: db.text,
    phonetic: db.phonetic || "",
    source: db.source,
    entries: db.entries || [],
    tags: db.tags || [],
    createdAt: db.created_at,
  }
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user?.id || null
}

export async function isUserLoggedIn(): Promise<boolean> {
  return (await getCurrentUserId()) !== null
}

export async function saveVocabularyToCloud(
  result: WordLookupResult
): Promise<VocabularyEntry | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const supabase = createClient()

  // De-duplicate by word (case-insensitive): return the existing row if present.
  const { data: existing } = await supabase
    .from("vocabulary")
    .select("*")
    .eq("user_id", userId)
    .ilike("text", result.text)
    .limit(1)
    .maybeSingle()

  if (existing) return dbToEntry(existing as DbVocab)

  const { data, error } = await supabase
    .from("vocabulary")
    .insert({
      user_id: userId,
      text: result.text,
      phonetic: result.phonetic,
      source: result.source,
      entries: result.entries,
      tags: result.tags,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to save vocabulary to cloud:", error)
    return null
  }
  return dbToEntry(data as DbVocab)
}

export async function getVocabularyFromCloud(): Promise<VocabularyEntry[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  const supabase = createClient()
  const { data, error } = await supabase
    .from("vocabulary")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to fetch vocabulary from cloud:", error)
    return []
  }
  return (data || []).map((d) => dbToEntry(d as DbVocab))
}

export async function deleteVocabularyFromCloud(id: string): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false

  const supabase = createClient()
  const { error } = await supabase
    .from("vocabulary")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  return !error
}
