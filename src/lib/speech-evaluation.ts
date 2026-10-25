import type {
  EvidenceLevel,
  EvidenceStatus,
  PronunciationAssessmentResult,
  PteTaskType,
  SpeechEvaluationFailure,
  SpeechEvaluationResult,
  SpeechScoreScale,
  StoredSpeechEvaluationResult,
  TaskFeedback,
  WordEvidence,
} from "@/types"

const AZURE_WORD_STATUS: Record<string, WordEvidence["status"]> = {
  Mispronunciation: "mispronounced",
  Omission: "omitted",
  Insertion: "inserted",
}

function availability(present: boolean): EvidenceLevel {
  return present ? { status: "available" } : { status: "unavailable", reason: "not_returned" }
}

function azureEvidence(words: WordEvidence[]): EvidenceStatus {
  return {
    sentence: { status: "available" },
    word: availability(words.length > 0),
    phoneme: availability(words.some((word) => (word.phonemes?.length ?? 0) > 0)),
  }
}

// Mirrors `from_azure` in backend/services/speech_evaluation.py, for Practice
// Tasks that were saved with Azure's own shape.
function fromStoredAzure(assessment: PronunciationAssessmentResult): SpeechEvaluationResult {
  const words: WordEvidence[] = (assessment.words ?? []).map((word) => ({
    word: word.word,
    score: word.score,
    status: AZURE_WORD_STATUS[word.errorType ?? ""] ?? "correct",
    phonemes: word.phonemes?.map(({ phoneme, score }) => ({ phoneme, score })) ?? null,
  }))
  return {
    provider: "azure",
    scale: "0-100",
    taskScoreEstimate: null,
    overallScore: assessment.score,
    pronunciation: assessment.accuracyScore,
    oralFluency: assessment.fluencyScore,
    content: assessment.completenessScore,
    recognizedText: assessment.recognizedText ?? null,
    words,
    evidenceStatus: azureEvidence(words),
    summary: assessment.summary ?? "",
  }
}

// Results saved before scales and evidence status existed were all Azure's.
function fromStoredResult(stored: StoredSpeechEvaluationResult): SpeechEvaluationResult {
  if (stored.scale && stored.evidenceStatus) return stored as SpeechEvaluationResult
  const upgraded: SpeechEvaluationResult & { evidence?: unknown } = {
    ...stored,
    scale: stored.scale ?? "0-100",
    evidenceStatus: stored.evidenceStatus ?? azureEvidence(stored.words ?? []),
  }
  delete upgraded.evidence
  return upgraded
}

/** The Speech Evaluation Result of a Feedback, whichever shape it was saved in. */
export function speechEvaluationOf(feedback?: TaskFeedback | null): SpeechEvaluationResult | undefined {
  if (!feedback) return undefined
  if (feedback.speechEvaluation) return fromStoredResult(feedback.speechEvaluation)
  if (feedback.pronunciationAssessment) return fromStoredAzure(feedback.pronunciationAssessment)
  return undefined
}

/** Why a Feedback's recording has no Speech Evaluation Result, if evaluation failed. */
export function speechEvaluationErrorOf(feedback?: TaskFeedback | null): SpeechEvaluationFailure | undefined {
  return feedback && !feedback.speechEvaluation ? feedback.speechEvaluationError : undefined
}

export type SpeechScore = { labelKey: string; score: number | null }

/**
 * The scores of a result in display order: the Spoken Task Score Estimate
 * or the provider's own overall score when present, then the three
 * dimensions (null when the evidence could not support one).
 */
export function speechScores(evaluation: SpeechEvaluationResult): SpeechScore[] {
  const headline: SpeechScore[] = evaluation.taskScoreEstimate !== null
    ? [{ labelKey: "speechEvaluation.taskScore", score: evaluation.taskScoreEstimate }]
    : evaluation.overallScore !== null
    ? [{ labelKey: "speechEvaluation.overall", score: evaluation.overallScore }]
    : []
  return [
    ...headline,
    { labelKey: "speechEvaluation.pronunciation", score: evaluation.pronunciation },
    { labelKey: "speechEvaluation.oralFluency", score: evaluation.oralFluency },
    { labelKey: "speechEvaluation.content", score: evaluation.content },
  ]
}

/** Where a score sits in its scale's range, 0–1. */
export function scoreShare(score: number, scale: SpeechScoreScale): number {
  return scale === "10-90" ? (score - 10) / 80 : score / 100
}

export type ScoreBand = "excellent" | "good" | "fair" | "needsWork"

/** Bands at 90/80/70% of the scale's range: 90/80/70 on 0–100, 82/74/66 on 10–90. */
export function scoreBand(score: number, scale: SpeechScoreScale): ScoreBand {
  const share = scoreShare(score, scale)
  if (share >= 0.9) return "excellent"
  if (share >= 0.8) return "good"
  if (share >= 0.7) return "fair"
  return "needsWork"
}

/** The lowest score of each band on a scale, for legends. */
export function bandFloors(scale: SpeechScoreScale): Record<Exclude<ScoreBand, "needsWork">, number> {
  const at = (share: number) => (scale === "10-90" ? Math.round(10 + 80 * share) : share * 100)
  return { excellent: at(0.9), good: at(0.8), fair: at(0.7) }
}

/**
 * The i18n key explaining missing or partial evidence, if any: a passage
 * that was not read, sentence scores that could not be supported, or words
 * that could not be judged.
 */
export function evidenceNoticeKey(evaluation: SpeechEvaluationResult): string | undefined {
  const { sentence, word } = evaluation.evidenceStatus
  if (sentence.reason === "reference_not_read") return "speechEvaluation.notice.referenceNotRead"
  if (sentence.status !== "available") return "speechEvaluation.notice.sentenceDegraded"
  if (word.status === "partial") return "speechEvaluation.notice.wordsPartial"
  return undefined
}

const PROVIDER_NAMES: Record<string, string> = { azure: "Azure", echolingo: "EchoLingo" }

export function speechProviderName(evaluation: { provider: string }): string {
  return PROVIDER_NAMES[evaluation.provider] ?? evaluation.provider
}

/**
 * The Speech Evaluation Mode to request: Read Aloud runs an explicit
 * EchoLingo-versus-Azure comparison only when the developer switch
 * `NEXT_PUBLIC_SPEECH_EVALUATION_COMPARE=1` is set; otherwise the backend
 * default (EchoLingo only) applies.
 */
export function speechEvaluationModeFor(
  taskType: PteTaskType,
  compareSwitch: string | undefined = process.env.NEXT_PUBLIC_SPEECH_EVALUATION_COMPARE,
): "compare" | undefined {
  return taskType === "read_aloud" && compareSwitch === "1" ? "compare" : undefined
}

// Failure codes with their own explanation; any other is "other".
const EXPLAINED_ERRORS = new Set([
  "worker_unavailable", "timeout", "worker_busy", "no_speech", "audio_too_short",
  "audio_too_long", "invalid_audio", "calibration_missing", "not_configured",
])

/** The i18n key explaining a failed evaluation. */
export function speechErrorKey(code: string): string {
  return `speechEvaluation.error.${EXPLAINED_ERRORS.has(code) ? code : "other"}`
}

/**
 * The mean Pronunciation of each scale present, in a stable order (10–90
 * first). Scores on different scales are never averaged together.
 */
export function pronunciationAverages(
  evaluations: Array<SpeechEvaluationResult | undefined>,
): Array<{ scale: SpeechScoreScale; average: number }> {
  const byScale = new Map<SpeechScoreScale, number[]>()
  for (const evaluation of evaluations) {
    if (evaluation?.pronunciation == null) continue
    byScale.set(evaluation.scale, [...(byScale.get(evaluation.scale) ?? []), evaluation.pronunciation])
  }
  return (["10-90", "0-100"] as const)
    .filter((scale) => byScale.has(scale))
    .map((scale) => {
      const scores = byScale.get(scale)!
      return { scale, average: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) }
    })
}
