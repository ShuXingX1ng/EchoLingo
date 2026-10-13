import catalogue from "@/data/task-types.json"
import type { DimensionScores, PteTaskType } from "@/types"

// The Task Type catalogue (`src/data/task-types.json`) is the single source of
// per-Task-Type facts for both the frontend (through this module) and the
// FastAPI backend (through `backend/services/task_types.py`).

/** The skill a Task Type is grouped under in practice, history and stats. */
export type TaskCategory = "speaking" | "writing" | "reading" | "listening"

/** The PTE Academic Section a Task Type belongs to (CONTEXT.md). */
export type ExamSection = "speaking_writing" | "reading" | "listening"

/** Shape of the Stimulus payload; whether it is played as audio is `spokenStimulus`. */
export type StimulusFormat = "text" | "json" | "image" | "none"

export interface TimerConfig {
  prepSeconds?: number
  taskSeconds?: number
  /** Time limit that applies only in a Mock Exam (the task is untimed in Task Practice). */
  mockTaskSeconds?: number
  recordSeconds?: number
  minRecSeconds?: number
}

export interface TaskTypeMetadata {
  id: PteTaskType
  displayName: string
  shortName: string
  /** Locale key for the translated Task Type name. */
  labelKey: string
  /** URL segment under `/practice/`. */
  route: string
  category: TaskCategory
  section: ExamSection
  stimulusFormat: StimulusFormat
  spokenStimulus: boolean
  /** TTS pace for a spoken Stimulus; the default applies when absent. */
  speechRate?: number
  /** Which dimension set the backend scores this Task Type with; null = unscored. */
  scoredAs: TaskCategory | null
  maxScore: number | null
  timer: TimerConfig
  pronunciationAssessment: boolean
  /** Whether the Study Assistant can generate topic practice for it. */
  assistantPractice: boolean
}

const ENTRIES = catalogue.taskTypes as TaskTypeMetadata[]

export const TASK_TYPE_REGISTRY = Object.fromEntries(
  ENTRIES.map(entry => [entry.id, entry])
) as Record<PteTaskType, TaskTypeMetadata>

export const ALL_TASK_TYPES: PteTaskType[] = ENTRIES.map(entry => entry.id)

/** Official task order of a Mock Exam. */
export const MOCK_EXAM_SEQUENCE = catalogue.mockExamSequence as PteTaskType[]

export const SCORING_DIMENSIONS = catalogue.scoringDimensions as Record<TaskCategory, string[]>

export function getTaskTypeMetadata(taskType: PteTaskType): TaskTypeMetadata {
  return TASK_TYPE_REGISTRY[taskType]
}

export function getTaskTypesByCategory(category: TaskCategory): PteTaskType[] {
  return ALL_TASK_TYPES.filter(t => TASK_TYPE_REGISTRY[t].category === category)
}

/** Task Types whose Feedback carries `category`'s dimension scores. */
export function getTaskTypesScoredAs(category: TaskCategory): PteTaskType[] {
  return ALL_TASK_TYPES.filter(t => TASK_TYPE_REGISTRY[t].scoredAs === category)
}

function formatSeconds(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`
}

/**
 * The timed phases of a Task Type as one line of display copy, e.g.
 * "35s prep · 40s" or "10 min". Empty when nothing is timed in that mode
 * (Write from Dictation in Task Practice).
 */
export function timingSummary(taskType: PteTaskType, mode: "practice" | "mock" = "practice"): string {
  const { prepSeconds, recordSeconds, taskSeconds, mockTaskSeconds } = TASK_TYPE_REGISTRY[taskType].timer
  const limit = taskSeconds ?? (mode === "mock" ? mockTaskSeconds : undefined)
  return [
    prepSeconds ? `${formatSeconds(prepSeconds)} prep` : null,
    recordSeconds ? formatSeconds(recordSeconds) : null,
    limit ? formatSeconds(limit) : null,
  ].filter(Boolean).join(" · ")
}

/** Task Practice path for a Task Type, or undefined for an unknown slug. */
export function practicePath(taskType: string): string | undefined {
  const meta = TASK_TYPE_REGISTRY[taskType as PteTaskType]
  return meta ? `/practice/${meta.route}` : undefined
}

export function taskTypeLabel(t: (key: string) => string, taskType: PteTaskType): string {
  return t(TASK_TYPE_REGISTRY[taskType].labelKey)
}

export function taskTypeLabels(t: (key: string) => string): Record<PteTaskType, string> {
  return Object.fromEntries(
    ALL_TASK_TYPES.map(taskType => [taskType, taskTypeLabel(t, taskType)])
  ) as Record<PteTaskType, string>
}

/**
 * `[dimension, score]` pairs of a Feedback's dimension scores, in catalogue
 * order. Stored Feedback is not guaranteed to be well-formed: an unknown
 * `section` yields no pairs and non-numeric scores are left out.
 */
export function dimensionEntries(scores: DimensionScores): Array<[string, number]> {
  const values = scores as unknown as Record<string, unknown>
  const dimensions: readonly string[] | undefined = SCORING_DIMENSIONS[scores.section]
  if (!dimensions) return []
  return dimensions.flatMap((dimension): Array<[string, number]> => {
    const score = values[dimension]
    return typeof score === "number" && Number.isFinite(score) ? [[dimension, score]] : []
  })
}

/** Mean of a Feedback's dimension scores (0–100), rounded; null when it has none that can be read. */
export function averageDimensionScore(scores: DimensionScores): number | null {
  const entries = dimensionEntries(scores)
  if (entries.length === 0) return null
  return Math.round(entries.reduce((sum, [, score]) => sum + score, 0) / entries.length)
}
