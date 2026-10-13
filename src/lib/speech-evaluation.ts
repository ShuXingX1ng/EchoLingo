import type {
  PronunciationAssessmentResult,
  SpeechEvaluationResult,
  TaskFeedback,
  WordEvidence,
} from "@/types"

const AZURE_WORD_STATUS: Record<string, WordEvidence["status"]> = {
  Mispronunciation: "mispronounced",
  Omission: "omitted",
  Insertion: "inserted",
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
    taskScoreEstimate: null,
    overallScore: assessment.score,
    pronunciation: assessment.accuracyScore,
    oralFluency: assessment.fluencyScore,
    content: assessment.completenessScore,
    recognizedText: assessment.recognizedText ?? null,
    words,
    evidence: {
      taskScoreEstimate: false,
      words: words.length > 0,
      phonemes: words.some((word) => (word.phonemes?.length ?? 0) > 0),
    },
    summary: assessment.summary ?? "",
  }
}

/** The Speech Evaluation Result of a Feedback, whichever shape it was saved in. */
export function speechEvaluationOf(feedback?: TaskFeedback | null): SpeechEvaluationResult | undefined {
  if (!feedback) return undefined
  if (feedback.speechEvaluation) return feedback.speechEvaluation
  if (feedback.pronunciationAssessment) return fromStoredAzure(feedback.pronunciationAssessment)
  return undefined
}

export type SpeechScore = { labelKey: string; score: number }

/** The scores of a result in display order; a missing overall score is left out. */
export function speechScores(evaluation: SpeechEvaluationResult): SpeechScore[] {
  return [
    ...(evaluation.overallScore === null ? [] : [{ labelKey: "speechEvaluation.overall", score: evaluation.overallScore }]),
    { labelKey: "speechEvaluation.pronunciation", score: evaluation.pronunciation },
    { labelKey: "speechEvaluation.oralFluency", score: evaluation.oralFluency },
    { labelKey: "speechEvaluation.content", score: evaluation.content },
  ]
}

const PROVIDER_NAMES: Record<string, string> = { azure: "Azure", echolingo: "EchoLingo" }

export function speechProviderName(evaluation: SpeechEvaluationResult): string {
  return PROVIDER_NAMES[evaluation.provider] ?? evaluation.provider
}
