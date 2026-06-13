import type { WordLookupResult } from "@/types"

/**
 * Look up a selected word or short phrase via the Word Lookup proxy route.
 * Routing (ECDICT vs DeepSeek) happens server-side; see ADR 0006.
 */
export async function lookupWord(query: string): Promise<WordLookupResult> {
  const trimmed = query.trim()
  if (!trimmed) throw new Error("Nothing selected to translate.")

  const res = await fetch("/api/word-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: trimmed }),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data && data.error) || "Lookup failed")
  }
  return data as WordLookupResult
}
