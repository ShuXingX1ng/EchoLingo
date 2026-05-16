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
