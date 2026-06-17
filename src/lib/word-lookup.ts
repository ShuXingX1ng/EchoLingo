import { apiPost } from "@/lib/api-client"
import type { WordLookupResult } from "@/types"

/**
 * Look up a selected word or short phrase via the FastAPI backend.
 * Routing (ECDICT vs DeepSeek) happens in the Python service; see ADR 0006, ADR 0007.
 */
export async function lookupWord(query: string): Promise<WordLookupResult> {
  const trimmed = query.trim()
  if (!trimmed) throw new Error("Nothing selected to translate.")

  return apiPost<WordLookupResult>("/api/word-lookup", { query: trimmed })
}
