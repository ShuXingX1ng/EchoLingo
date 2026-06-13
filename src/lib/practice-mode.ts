export type StimulusMode = "random" | "theme" | "targeted"

/**
 * Parse practice mode and topic from a URL search string.
 * Accepts `window.location.search` directly. Unknown mode values fall back to "random".
 */
export function parsePracticeModeFromUrl(search: string): { mode: StimulusMode; topic: string | undefined } {
  const params = new URLSearchParams(search)
  const raw = params.get("mode")
  const mode: StimulusMode = raw === "theme" || raw === "targeted" ? raw : "random"
  const topic = params.get("topic") ?? undefined
  return { mode, topic }
}

/**
 * Build the extra fields to merge into a /api/pte/stimulus request body.
 * Returns an empty object for mode=random so the backend default is used.
 */
export function buildStimulusExtras(mode: StimulusMode, topic: string | undefined): Record<string, unknown> {
  if (mode === "random") return {}
  const extras: Record<string, unknown> = { mode }
  if (mode === "theme" && topic) extras.topic = topic
  return extras
}
