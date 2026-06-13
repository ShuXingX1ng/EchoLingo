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

// Generic Feedback Envelope — drives shared UI (history, stats, daily plan)
export type TaskFeedback = {
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  details?: TaskFeedbackDetails
  pronunciationAssessment?: PronunciationAssessmentResult
  dimensionScores?: DimensionScores
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

// ── Legacy IELTS types (retained for backup compatibility) ────────────────────

export type ChatMessage = {
  id: string;
  role: "examiner" | "user";
  content: string;
  createdAt: string;
};

export type SpeakingSession = {
  id: string;
  mode: "ielts_part_1" | "ielts_part_2" | "ielts_part_3";
  messages: ChatMessage[];
  feedback?: SessionFeedback;
  createdAt: string;
  endedAt?: string;
};

export type ErrorAnnotation = {
  original: string;
  corrected: string;
  type: "grammar" | "vocabulary" | "fluency" | "pronunciation";
  explanation: string;
};

// 发音评估相关类型
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

export type SessionFeedback = {
  estimatedBand: number;
  fluencyAndCoherence: string;
  lexicalResource: string;
  grammarRangeAndAccuracy: string;
  pronunciation: string;
  pronunciationAssessment?: PronunciationAssessmentResult; // 详细发音评估
  strengths: string[];
  weaknesses: string[];
  improvementSuggestions: string[];
  improvedSampleAnswer: string;
  errorAnnotations?: ErrorAnnotation[];
};
