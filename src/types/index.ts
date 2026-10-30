// ── PTE Academic domain types ────────────────────────────────────────────────

export type PteTaskType =
  | "read_aloud"
  | "repeat_sentence"
  | "answer_short_question"
  | "summarize_written_text"
  | "write_essay"
  | "personal_intro"
  | "write_from_dictation"
  | "describe_image"
  | "re_tell_lecture"
  | "fill_in_the_blanks_reading"
  | "re_order_paragraphs"
  | "multiple_choice_reading"
  | "summarize_spoken_text"
  | "fill_in_the_blanks_listening"
  | "highlight_correct_summary"

export type TaskStimulus = {
  kind: "text" | "audio" | "image"
  content: string
}

export type TaskResponse = {
  kind: "audio" | "text"
  content: string
  audioUrl?: string
}

// Per-dimension scores (0–100 internal scale, for reference only — not official PTE scores)
export type SpeakingDimensionScores = {
  section: "speaking"
  fluency: number
  pronunciation: number
  content: number
}

export type WritingDimensionScores = {
  section: "writing"
  grammar: number
  vocabulary: number
  form: number
  content: number
}

export type ReadingDimensionScores = {
  section: "reading"
  vocabulary: number
  comprehension: number
}

export type DimensionScores = SpeakingDimensionScores | WritingDimensionScores | ReadingDimensionScores | ListeningDimensionScores

// LLM-as-Judge disagreement record
export type JudgeLog = {
  taskType: PteTaskType
  divergedDimensions: Array<{ dimension: string; primaryScore: number; judgeScore: number }>
  timestamp: string
}

// Per-dimension weakness entry (used in TaskTypeWeakness breakdown)
export type DimensionWeakness = {
  dimension: string
  score: number  // 0–100, lower is weaker
}

// Task score: how many points earned out of the task maximum
export type TaskScoreCard = {
  earned: number
  max: number
}

// Generic Feedback Envelope — drives shared UI (history, stats, daily plan)
export type TaskFeedback = {
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  details?: TaskFeedbackDetails
  speechEvaluation?: StoredSpeechEvaluationResult
  /** Why the recording has no Speech Evaluation Result, when evaluation failed. */
  speechEvaluationError?: SpeechEvaluationFailure
  speechEvaluationComparison?: SpeechEvaluationComparison
  /**
   * Azure's own shape, on Practice Tasks saved before the provider-neutral
   * result. Read either one through `speechEvaluationOf()`.
   */
  pronunciationAssessment?: PronunciationAssessmentResult
  dimensionScores?: DimensionScores
  scoreCard?: TaskScoreCard
  coachSuggestions?: string[]
  judgeLog?: JudgeLog
}

// Task-specific Feedback Details — narrowed by taskType inside each task component
export type ReadAloudDetails = {
  taskType: "read_aloud"
  oralFluency: string
  pronunciation: string
}

export type RepeatSentenceDetails = {
  taskType: "repeat_sentence"
  oralFluency: string
  pronunciation: string
}

export type AnswerShortQuestionDetails = {
  taskType: "answer_short_question"
  contentAccuracy: string
}

export type WritingDetails = {
  taskType: "summarize_written_text" | "write_essay" | "personal_intro"
  content?: string
  grammar?: string
  vocabulary?: string
  structure?: string
}

export type DictationDetails = {
  taskType: "write_from_dictation"
  wordAccuracy?: string
}

export type DescribeImageDetails = {
  taskType: "describe_image"
  contentCoverage: string
  fluency: string
}

export type ReTellLectureDetails = {
  taskType: "re_tell_lecture"
  contentAccuracy: string
  fluency: string
}

export type FillInTheBlanksReadingDetails = {
  taskType: "fill_in_the_blanks_reading"
  accuracy: string
  vocabulary: string
}

export type ReOrderParagraphsDetails = {
  taskType: "re_order_paragraphs"
  orderAccuracy: string
  logicFeedback: string
}

export type MultipleChoiceReadingDetails = {
  taskType: "multiple_choice_reading"
  answerAccuracy: string
  readingComprehension: string
}

export type SummarizeSpokenTextDetails = {
  taskType: "summarize_spoken_text"
  contentAccuracy: string
  writingQuality: string
}

export type FillInTheBlanksListeningDetails = {
  taskType: "fill_in_the_blanks_listening"
  accuracy: string
  listeningComprehension: string
}

export type HighlightCorrectSummaryDetails = {
  taskType: "highlight_correct_summary"
  answerAccuracy: string
  listeningComprehension: string
}

export type ListeningDimensionScores = {
  section: "listening"
  comprehension: number
  accuracy: number
}

export type TaskFeedbackDetails =
  | ReadAloudDetails
  | RepeatSentenceDetails
  | AnswerShortQuestionDetails
  | WritingDetails
  | DictationDetails
  | DescribeImageDetails
  | ReTellLectureDetails
  | FillInTheBlanksReadingDetails
  | ReOrderParagraphsDetails
  | MultipleChoiceReadingDetails
  | SummarizeSpokenTextDetails
  | FillInTheBlanksListeningDetails
  | HighlightCorrectSummaryDetails

export type PracticeTask = {
  id: string
  taskType: PteTaskType
  stimulus: TaskStimulus
  response: TaskResponse
  feedback?: TaskFeedback
  durationSeconds: number
  createdAt: string
  endedAt?: string
}

// Task-Type Weakness — rolling signal derived from PracticeTask feedback history
export type TaskTypeWeakness = {
  taskType: PteTaskType
  score: number        // 0–100, lower is weaker
  recentCount: number
  lastPracticed?: string
  dimensions?: DimensionWeakness[]
}

// Speech Evaluation Result — provider-neutral (CONTEXT.md, ADR-0012).
export type WordStatus = "correct" | "mispronounced" | "omitted" | "inserted" | "not_scored"

export type WordEvidence = {
  word: string
  /** Null for a word the provider could not judge (`not_scored`). */
  score: number | null
  status: WordStatus
  phonemes?: Array<{ phoneme: string; score: number }> | null
  /** Seconds from the start of the recording; absent when the provider gives no timing. */
  startSec?: number | null
  endSec?: number | null
}

/** A `pause` follows word `wordIndex`; a `slow_word` is that word, held too long. */
export type FluencyEvent = {
  kind: "pause" | "slow_word"
  startSec: number
  endSec: number
  wordIndex: number
  atSentenceBoundary: boolean
}

/**
 * A word left out, added or said again. `omitted` and `repeated` name word
 * `wordIndex`; an `inserted` word follows it. `heard` is what speech
 * recognition heard, for the last two.
 */
export type ReadingError = {
  kind: "omitted" | "inserted" | "repeated"
  wordIndex: number
  startSec: number
  endSec: number
  heard?: string | null
}

/**
 * One of the few things to practise first, chosen by FastAPI's fixed rules,
 * not the LLM. `wordIndices` are into the result's `words`: the words
 * mispronounced, left out, said again or drawn out, or the word a pause or
 * an inserted word follows. `words` names them, an inserted word as heard;
 * `count` is how many there are in all (at most five are named).
 */
export type PracticeItem = {
  kind: "omitted" | "inserted" | "repeated" | "mispronounced" | "pause" | "slow_word"
  count: number
  wordIndices: number[]
  words: string[]
}

export type EvidenceLevel = {
  status: "available" | "partial" | "degraded" | "unavailable"
  reason?: string | null
}

export type EvidenceStatus = {
  sentence: EvidenceLevel
  word: EvidenceLevel
  phoneme: EvidenceLevel
}

/** `10-90`: the EchoLingo display scale (Provisional Score Normalization); `0-100`: Azure's own. */
export type SpeechScoreScale = "10-90" | "0-100"

export type SpeechEvaluationResult = {
  provider: string
  scale: SpeechScoreScale
  /** 10–90 Spoken Task Score Estimate; only the EchoLingo Speech Evaluator produces one. */
  taskScoreEstimate: number | null
  /** The provider's own aggregate, not a Spoken Task Score Estimate. */
  overallScore: number | null
  /** A dimension is null when its evidence could not support a score. */
  pronunciation: number | null
  oralFluency: number | null
  content: number | null
  recognizedText?: string | null
  words: WordEvidence[]
  /** Where the reading stalled (EchoLingo only); absent on older records. */
  fluencyEvents?: FluencyEvent[]
  readingErrors?: ReadingError[]
  /** At most three, most important first; absent on older records. */
  practiceSummary?: PracticeItem[]
  evidenceStatus: EvidenceStatus
  /** The Evaluator Checkpoint Bundle behind the result, if any. */
  modelId?: string | null
  warnings?: string[]
  summary: string
}

/** A Speech Evaluation Result as saved on Practice Tasks before evidence status and scales. */
export type StoredSpeechEvaluationResult = Omit<SpeechEvaluationResult, "scale" | "evidenceStatus"> & {
  scale?: SpeechScoreScale
  evidenceStatus?: EvidenceStatus
  evidence?: { taskScoreEstimate: boolean; words: boolean; phonemes: boolean }
}

/** Why a provider produced no Speech Evaluation Result. */
export type SpeechEvaluationFailure = {
  provider: string
  code: string
  message: string
}

/**
 * An explicit EchoLingo-versus-Azure comparison (developer use; the primary result stays EchoLingo's).
 * Saved through `comparisonForRecord`, so a stored `baseline` has no words or recognised text.
 */
export type SpeechEvaluationComparison = {
  recordingSha256: string
  createdAt: string
  baseline: SpeechEvaluationResult | null
  baselineError: SpeechEvaluationFailure | null
  latencyMs: Record<string, number>
  differences: Record<string, number | null>
  wordDisagreements: Array<{ word: string; echolingo: WordStatus; azure: WordStatus }>
}

/** Response of POST /api/pte/spoken-feedback. */
export type SpokenFeedbackResponse = {
  transcript: string
  feedback: TaskFeedback | null
  speechEvaluation: SpeechEvaluationResult | null
  speechEvaluationError: SpeechEvaluationFailure | null
  speechEvaluationComparison: SpeechEvaluationComparison | null
}

// Azure Pronunciation Assessment as stored on older Practice Tasks.
export type PhonemeAssessment = {
  phoneme: string;
  score: number;
  accuracyScore: number;
};

export type WordAssessment = {
  word: string;
  score: number;
  accuracyScore: number;
  errorType?: string; // None, Omission, Insertion, Mispronunciation
  phonemes?: PhonemeAssessment[];
};

export type PronunciationAssessmentResult = {
  score: number; // 整体发音分数 0-100
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  words: WordAssessment[];
  summary: string; // 简要反馈
  recognizedText?: string; // Azure STT 识别出的原文，比浏览器 Web Speech 更准确
};

// ── Study Aids: Word Lookup & Vocabulary List ───────────────────────────────

/** One part-of-speech-grouped sense on a Word Lookup card. */
export type WordLookupEntry = {
  pos: string; // e.g. "n.", "v.", "phrase", or "" when unknown
  meaning: string; // Simplified Chinese gloss
};

/** Unified Word Lookup response from either ECDICT or the DeepSeek fallback. */
export type WordLookupResult = {
  source: "dictionary" | "ai";
  text: string; // the cleaned word or phrase
  phonetic: string; // IPA without slashes; empty for phrases/misses
  entries: WordLookupEntry[];
  tags: string[]; // exam labels e.g. ["雅思", "托福"]
};

/** A word the learner explicitly saved to their Vocabulary List. */
export type VocabularyEntry = {
  id: string;
  text: string;
  phonetic: string;
  source: WordLookupResult["source"];
  entries: WordLookupEntry[];
  tags: string[];
  createdAt: string; // ISO timestamp
};
