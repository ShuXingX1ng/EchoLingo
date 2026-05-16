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
  type: "grammar" | "vocabulary" | "fluency";
  explanation: string;
};

export type SessionFeedback = {
  estimatedBand: number;
  fluencyAndCoherence: string;
  lexicalResource: string;
  grammarRangeAndAccuracy: string;
  pronunciation: string;
  strengths: string[];
  weaknesses: string[];
  improvementSuggestions: string[];
  improvedSampleAnswer: string;
  errorAnnotations?: ErrorAnnotation[];
};
