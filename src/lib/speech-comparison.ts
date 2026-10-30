import type { SpeechEvaluationComparison, SpeechEvaluationResult, TaskFeedback } from "@/types"

/** One compared dimension: each provider's score on its own scale, and EchoLingo minus Azure. */
export type ComparisonRow = {
  labelKey: string
  echolingo: number | null
  azure: number | null
  /** In points of each provider's scale range (0–100), as FastAPI computed it. */
  difference: number | null
}

// FastAPI's COMPARED_DIMENSIONS, in display order.
const DIMENSIONS = [
  ["pronunciation", "speechEvaluation.pronunciation"],
  ["oralFluency", "speechEvaluation.oralFluency"],
  ["content", "speechEvaluation.content"],
] as const

export function comparisonRows(
  primary: SpeechEvaluationResult | undefined,
  comparison: SpeechEvaluationComparison,
): ComparisonRow[] {
  return DIMENSIONS.map(([dimension, labelKey]) => ({
    labelKey,
    echolingo: primary?.[dimension] ?? null,
    azure: comparison.baseline?.[dimension] ?? null,
    difference: comparison.differences[dimension] ?? null,
  }))
}

/**
 * A comparison as it is saved with a Practice Task (roadmap §13): the
 * structured comparison, differences, latency, errors, the baseline's
 * scores, evidence status and checkpoint, the time and the recording's
 * hash. The baseline's word results and recognised text, which repeat the
 * passage, are not kept.
 */
export function comparisonForRecord(comparison: SpeechEvaluationComparison): SpeechEvaluationComparison {
  const baseline = comparison.baseline
  return {
    ...comparison,
    baseline: baseline && {
      provider: baseline.provider,
      scale: baseline.scale,
      taskScoreEstimate: baseline.taskScoreEstimate,
      overallScore: baseline.overallScore,
      pronunciation: baseline.pronunciation,
      oralFluency: baseline.oralFluency,
      content: baseline.content,
      words: [],
      evidenceStatus: baseline.evidenceStatus,
      modelId: baseline.modelId ?? null,
      warnings: baseline.warnings ?? [],
      summary: "",
    },
  }
}

/** A Feedback as it is saved: its comparison, if any, cut to `comparisonForRecord`. */
export function feedbackForRecord(feedback: TaskFeedback): TaskFeedback {
  const comparison = feedback.speechEvaluationComparison
  return comparison ? { ...feedback, speechEvaluationComparison: comparisonForRecord(comparison) } : feedback
}
