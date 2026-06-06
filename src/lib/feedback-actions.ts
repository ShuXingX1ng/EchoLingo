import type { ChatMessage, SessionFeedback } from "@/types";
import { saveSession } from "./unified-history";
import { updateErrorPatterns } from "./error-patterns";
import { recordProgress } from "./supabase-progress";
import { apiPost, apiPostForm } from "./api-client";

// Fetch feedback from API
export async function fetchFeedback(
  messages: ChatMessage[],
  mode: string = "ielts_part_1"
): Promise<SessionFeedback> {
  return apiPost<SessionFeedback>("/api/feedback", {
    mode,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });
}

// Fetch pronunciation assessment
export async function fetchPronunciationAssessment(
  audioBlob: Blob,
  referenceText: string
): Promise<import("@/types").PronunciationAssessmentResult | null> {
  try {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("referenceText", referenceText);

    return await apiPostForm<import("@/types").PronunciationAssessmentResult>(
      "/api/pronunciation",
      formData
    );
  } catch (error) {
    console.error("Pronunciation assessment error:", error);
    return null;
  }
}

export interface CompletionInput {
  messages: ChatMessage[];
  feedback: SessionFeedback;
  userId?: string;
  topicId?: string;
  mode: string;
  audioBlob?: Blob | null;
  lastUserMessage?: string;
}

// Save session and update user learning data
export async function saveSessionAndUpdateLearning(
  input: CompletionInput
): Promise<SessionFeedback> {
  const { messages, feedback, userId, topicId, mode, audioBlob, lastUserMessage } = input;

  // Enrich feedback with pronunciation assessment if audio is available
  let finalFeedback = feedback;
  if (audioBlob && lastUserMessage) {
    const pronunciationResult = await fetchPronunciationAssessment(
      audioBlob,
      lastUserMessage
    );

    if (pronunciationResult) {
      finalFeedback = {
        ...feedback,
        pronunciationAssessment: pronunciationResult,
        pronunciation: pronunciationResult.summary,
      };
    }
  }

  // Save session (unified: cloud + local backup for authenticated, local-only fallback)
  await saveSession(messages, finalFeedback, mode);

  // Update error patterns for personalized learning
  if (userId) {
    let feedbackForPatterns = finalFeedback;

    if (finalFeedback.pronunciationAssessment) {
      const mispronounced = finalFeedback.pronunciationAssessment.words.filter(
        (w) => w.errorType === "Mispronunciation" && w.score < 70
      );

      if (mispronounced.length > 0) {
        feedbackForPatterns = {
          ...finalFeedback,
          weaknesses: [
            ...finalFeedback.weaknesses,
            `Pronunciation: ${mispronounced.map((w) => w.word).join(", ")}`,
          ],
        };
      }
    }

    await updateErrorPatterns(userId, feedbackForPatterns);

    // Record learning progress
    if (topicId && finalFeedback.estimatedBand) {
      if (mode === "full") {
        // Exam mode: record for all parts
        recordProgress(userId, topicId, "part1", finalFeedback.estimatedBand);
        recordProgress(userId, topicId, "part2", finalFeedback.estimatedBand);
        recordProgress(userId, topicId, "part3", finalFeedback.estimatedBand);
      } else {
        recordProgress(userId, topicId, mode, finalFeedback.estimatedBand);
      }
    }
  }

  return finalFeedback;
}
