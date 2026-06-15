import { apiPost } from "@/lib/api-client"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import { parsePracticeModeFromUrl, buildStimulusExtras } from "@/lib/practice-mode"
import type { PteTaskType } from "@/types"

interface LoadStimulusOptions {
  taskType: PteTaskType
  /**
   * Endpoint to use in random mode when the task has a legacy dedicated route
   * (e.g. "/api/read-aloud/stimulus"). Falls back to /api/pte/stimulus with
   * { taskType } when omitted.
   */
  randomEndpoint?: string
  timeoutMs?: number
}

/**
 * Loads a text Stimulus for the given Task Type, following the standard
 * cache-check → API call → cache-store flow:
 * - Random mode: check localStorage bank first; call API on miss; store result.
 * - Theme/Targeted (seeded) mode: skip cache; always call /api/pte/stimulus.
 *
 * Must be called in a browser context (reads window.location.search).
 */
export async function loadStimulusText({ taskType, randomEndpoint, timeoutMs }: LoadStimulusOptions): Promise<string> {
  const { mode, topic } = parsePracticeModeFromUrl(window.location.search)
  const isSeeded = mode !== "random"
  const extras = buildStimulusExtras(mode, topic)

  if (!isSeeded) {
    const cached = getStimulusFromBank(taskType)
    if (cached) return cached
  }

  let text: string
  const opts = timeoutMs ? { timeoutMs } : undefined

  if (isSeeded) {
    const data = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType, ...extras }, opts)
    text = data.text
  } else if (randomEndpoint) {
    const data = await apiPost<{ text: string }>(randomEndpoint, {}, opts)
    text = data.text
  } else {
    const data = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType }, opts)
    text = data.text
  }

  if (!isSeeded) addStimulusToBank(taskType, text)
  return text
}
