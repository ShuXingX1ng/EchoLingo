import type { PracticeTask, PteTaskType, TaskTypeWeakness, DimensionWeakness } from "@/types"
import { ALL_TASK_TYPES } from "@/lib/task-type-registry"

// Overall performance score from a single task (0–100).
// Uses actual dimension scores when available (Phase 6); falls back to strengths/weaknesses heuristic.
function scoreFromTask(task: PracticeTask): number | null {
  const feedback = task.feedback
  if (!feedback) return null

  const ds = feedback.dimensionScores
  if (ds) {
    if (ds.section === "speaking") {
      return Math.round((ds.fluency + ds.pronunciation + ds.content) / 3)
    }
    if (ds.section === "writing") {
      return Math.round((ds.grammar + ds.vocabulary + ds.form + ds.content) / 4)
    }
    if (ds.section === "reading") {
      return Math.round((ds.vocabulary + ds.comprehension) / 2)
    }
    if (ds.section === "listening") {
      return Math.round((ds.comprehension + ds.accuracy) / 2)
    }
  }

  // Fallback heuristic: proportion of strengths vs weaknesses
  const strengths = feedback.strengths.length
  const weaknesses = feedback.weaknesses.length
  const total = strengths + weaknesses
  if (total === 0) return 50
  return Math.round((strengths / total) * 100)
}

// Recency decay — tasks older than 30 days contribute proportionally less
function recencyWeight(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  if (ageDays <= 7) return 1.0
  if (ageDays <= 14) return 0.75
  if (ageDays <= 30) return 0.5
  return 0.25
}

// Aggregate per-dimension weakness from a group of tasks using recency weighting.
// Returns undefined if no task in the group has dimension scores.
function aggregateDimensions(tasks: PracticeTask[]): DimensionWeakness[] | undefined {
  const dimMap = new Map<string, { weightedSum: number; totalWeight: number }>()

  for (const task of tasks) {
    const ds = task.feedback?.dimensionScores
    if (!ds) continue

    const weight = recencyWeight(task.createdAt)
    let entries: Array<[string, number]> = []
    if (ds.section === "speaking") {
      entries = [
        ["fluency", ds.fluency],
        ["pronunciation", ds.pronunciation],
        ["content", ds.content],
      ]
    } else if (ds.section === "writing") {
      entries = [
        ["grammar", ds.grammar],
        ["vocabulary", ds.vocabulary],
        ["form", ds.form],
        ["content", ds.content],
      ]
    } else if (ds.section === "reading") {
      entries = [
        ["vocabulary", ds.vocabulary],
        ["comprehension", ds.comprehension],
      ]
    } else if (ds.section === "listening") {
      entries = [
        ["comprehension", ds.comprehension],
        ["accuracy", ds.accuracy],
      ]
    }

    for (const [dim, score] of entries) {
      const entry = dimMap.get(dim) ?? { weightedSum: 0, totalWeight: 0 }
      entry.weightedSum += score * weight
      entry.totalWeight += weight
      dimMap.set(dim, entry)
    }
  }

  if (dimMap.size === 0) return undefined

  return Array.from(dimMap.entries()).map(([dimension, { weightedSum, totalWeight }]) => ({
    dimension,
    score: Math.round(weightedSum / totalWeight),
  }))
}

export function deriveTaskTypeWeakness(tasks: PracticeTask[]): TaskTypeWeakness[] {
  const byType = new Map<PteTaskType, PracticeTask[]>()
  for (const taskType of ALL_TASK_TYPES) byType.set(taskType, [])
  for (const task of tasks) byType.get(task.taskType)?.push(task)

  return ALL_TASK_TYPES.map((taskType) => {
    const group = byType.get(taskType)!
    const scored = group
      .map((t) => ({ score: scoreFromTask(t), weight: recencyWeight(t.createdAt) }))
      .filter((s): s is { score: number; weight: number } => s.score !== null)

    let aggregateScore = 50
    if (scored.length > 0) {
      const totalWeight = scored.reduce((sum, s) => sum + s.weight, 0)
      aggregateScore = Math.round(
        scored.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight,
      )
    }

    const sorted = [...group].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    return {
      taskType,
      score: aggregateScore,
      recentCount: group.length,
      lastPracticed: sorted[0]?.createdAt,
      dimensions: aggregateDimensions(group),
    }
  })
}

// Sort weaknesses: practiced-but-weak first, then never-practiced, then strong
export function rankWeaknesses(weaknesses: TaskTypeWeakness[]): TaskTypeWeakness[] {
  return [...weaknesses].sort((a, b) => {
    const aPracticed = a.recentCount > 0
    const bPracticed = b.recentCount > 0
    if (aPracticed && !bPracticed) return -1
    if (!aPracticed && bPracticed) return 1
    return a.score - b.score
  })
}

export { ALL_TASK_TYPES }
