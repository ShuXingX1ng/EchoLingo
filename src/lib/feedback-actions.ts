import type { ChatMessage, SessionFeedback } from "@/types";
import { saveSession } from "./unified-history";
import { updateErrorPatterns } from "./error-patterns";
import { recordProgress } from "./supabase-progress";

// Fetch feedback from API
export async function fetchFeedback(
  messages: ChatMessage[],
  mode: string = "ielts_part_1"
): Promise<SessionFeedback> {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to generate feedback.");
  }

  return response.json();
}

// Fetch pronunciation assessment
export async function fetchPronunciationAssessment(
  audioBlob: Blob,
  referenceText: string
): Promise<import("@/types").PronunciationAssessmentResult | null> {
  try {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("text", referenceText);

    const response = await fetch("/api/pronunciation", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      console.error("Pronunciation assessment failed:", response.status);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("Pronunciation assessment error:", error);
    return null;
  }
}

// Save session and update user learning data
export async function saveSessionAndUpdateLearning(
  messages: ChatMessage[],
  feedbackData: SessionFeedback,
  userId: string | undefined,
  topicId: string | undefined,
  practiceMode: string,
  audioBlob?: Blob | null,
  lastUserMessage?: string
): Promise<SessionFeedback> {
  // Perform pronunciation assessment if audio is available
  if (audioBlob && lastUserMessage) {
    const pronunciationResult = await fetchPronunciationAssessment(
      audioBlob,
      lastUserMessage
    );

    if (pronunciationResult) {
      feedbackData.pronunciationAssessment = pronunciationResult;
      feedbackData.pronunciation = pronunciationResult.summary;
    }
  }

  // Save session (unified: cloud + local backup for authenticated, local-only fallback)
  await saveSession(messages, feedbackData, practiceMode);

  // Update error patterns for personalized learning
  if (userId) {
    const feedbackForPatterns = { ...feedbackData };

    if (feedbackData.pronunciationAssessment) {
      const mispronounced = feedbackData.pronunciationAssessment.words.filter(
        (w) => w.errorType === "Mispronunciation" && w.score < 70
      );

      if (mispronounced.length > 0) {
        feedbackForPatterns.weaknesses = [
          ...feedbackData.weaknesses,
          `Pronunciation: ${mispronounced.map((w) => w.word).join(", ")}`,
        ];
      }
    }

    updateErrorPatterns(userId, feedbackForPatterns);

    // Record learning progress
    if (topicId && feedbackData.estimatedBand) {
      if (practiceMode === "full") {
        // Exam mode: record for all parts
        recordProgress(userId, topicId, "part1", feedbackData.estimatedBand);
        recordProgress(userId, topicId, "part2", feedbackData.estimatedBand);
        recordProgress(userId, topicId, "part3", feedbackData.estimatedBand);
      } else {
        recordProgress(userId, topicId, practiceMode, feedbackData.estimatedBand);
      }
    }
  }

  return feedbackData;
}
