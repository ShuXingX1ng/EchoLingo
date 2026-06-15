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
 * Loads a text Stimulus for the given Task Type:
 * - Random mode: always calls the API first to get a fresh Stimulus; on success
 *   also writes it to the Task Bank (fallback pool). Falls back to the Task Bank
 *   only when the API call fails; throws if the bank is also empty.
 * - Theme/Targeted (seeded) mode: skip cache; always call /api/pte/stimulus.
 *
 * Must be called in a browser context (reads window.location.search).
 */
export async function loadStimulusText({ taskType, randomEndpoint, timeoutMs = 45000 }: LoadStimulusOptions): Promise<string> {
  const { mode, topic } = parsePracticeModeFromUrl(window.location.search)
  const isSeeded = mode !== "random"
  const extras = buildStimulusExtras(mode, topic)

  const opts = { timeoutMs }

  if (isSeeded) {
    const data = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType, ...extras }, opts)
    return data.text
  }

  // Random mode: always generate a fresh Stimulus via the API.
  try {
    let text: string
    if (randomEndpoint) {
      const data = await apiPost<{ text: string }>(randomEndpoint, {}, opts)
      text = data.text
    } else {
      const data = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType }, opts)
      text = data.text
    }
    addStimulusToBank(taskType, text)
    return text
  } catch {
    // API failed — fall back to the Task Bank pool.
    const cached = getStimulusFromBank(taskType)
    if (cached) return cached
    throw new Error(`Failed to load stimulus for ${taskType} and Task Bank is empty`)
  }
}
