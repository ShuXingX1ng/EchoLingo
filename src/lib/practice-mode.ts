export type StimulusMode = "random" | "theme" | "targeted"
export type StimulusSource = "exemplars" | "news"

/**
 * Parse practice mode, topic, and source from a URL search string.
 * Accepts `window.location.search` directly. Unknown mode values fall back to "random".
 * source defaults to "exemplars" unless the "source=news" param is present.
 */
export function parsePracticeModeFromUrl(search: string): {
  mode: StimulusMode
  topic: string | undefined
  source: StimulusSource
} {
  const params = new URLSearchParams(search)
  const raw = params.get("mode")
  const mode: StimulusMode = raw === "theme" || raw === "targeted" ? raw : "random"
  const topic = params.get("topic") ?? undefined
  const source: StimulusSource = params.get("source") === "news" ? "news" : "exemplars"
  return { mode, topic, source }
}

/**
 * Build the extra fields to merge into a /api/pte/stimulus request body.
 * Returns an empty object for mode=random so the backend default is used.
 * When source is "news", includes source:"news" so the backend uses the news grounding path.
 * Omits source for exemplars to keep request bodies clean (backend default).
 */
export function buildStimulusExtras(
  mode: StimulusMode,
  topic: string | undefined,
  source?: StimulusSource
): Record<string, unknown> {
  if (mode === "random") return {}
  const extras: Record<string, unknown> = { mode }
  if (mode === "theme" && topic) extras.topic = topic
  if (source === "news") extras.source = "news"
  return extras
}
