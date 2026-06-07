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

export type TaskStimulus = {
  kind: "text" | "audio" | "image"
  content: string
}

export type TaskResponse = {
  kind: "audio" | "text"
  content: string
  audioUrl?: string
}

// Generic Feedback Envelope — drives shared UI (history, stats, daily plan)
export type TaskFeedback = {
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  details?: TaskFeedbackDetails
  pronunciationAssessment?: PronunciationAssessmentResult
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

export type TaskFeedbackDetails =
  | ReadAloudDetails
  | RepeatSentenceDetails
  | AnswerShortQuestionDetails
  | WritingDetails
  | DictationDetails
  | DescribeImageDetails
  | ReTellLectureDetails

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
