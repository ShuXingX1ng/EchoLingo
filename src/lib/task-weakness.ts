import type { PracticeTask, PteTaskType, TaskTypeWeakness } from "@/types"

const ALL_TASK_TYPES: PteTaskType[] = [
  "read_aloud",
  "repeat_sentence",
  "answer_short_question",
  "summarize_written_text",
  "write_essay",
  "personal_intro",
  "write_from_dictation",
  "describe_image",
  "re_tell_lecture",
]

// Heuristic performance score from feedback (0–100)
function scoreFromTask(task: PracticeTask): number | null {
  const feedback = task.feedback
  if (!feedback) return null

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
        scored.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight
      )
    }

    const sorted = [...group].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return {
      taskType,
      score: aggregateScore,
      recentCount: group.length,
      lastPracticed: sorted[0]?.createdAt,
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
