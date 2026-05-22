import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FeedbackPanel from "@/components/FeedbackPanel";
import { I18nProvider } from "@/lib/i18n";
import type { SessionFeedback } from "@/types";

const feedback: SessionFeedback = {
  estimatedBand: 6.5,
  fluencyAndCoherence: "Your answer is clear, but pauses sometimes break the flow.",
  lexicalResource: "You used relevant vocabulary with some repetition.",
  grammarRangeAndAccuracy: "You used several complex sentences with minor errors.",
  pronunciation: "Word stress is understandable, but some endings need attention.",
  strengths: ["Clear structure", "Relevant examples"],
  weaknesses: ["Long pauses", "Repeated simple vocabulary"],
  improvementSuggestions: [
    "Practise linking ideas with one clear example.",
    "Replace repeated words with topic-specific vocabulary.",
    "Record and repeat sentence endings more clearly.",
  ],
  improvedSampleAnswer: "I grew up in a coastal city that is known for its port.",
  errorAnnotations: [
    {
      original: "people is",
      corrected: "people are",
      type: "grammar",
      explanation: "Use a plural verb with people.",
    },
  ],
};

function renderPanel(feedbackOverride: SessionFeedback = feedback) {
  render(
    <I18nProvider>
      <FeedbackPanel
        feedback={feedbackOverride}
        primaryActionHref="/practice/setup"
        primaryActionLabel="Start New Session"
      />
    </I18nProvider>
  );
}

describe("FeedbackPanel", () => {
  it("turns feedback into a learning review with prioritized actions", () => {
    renderPanel();

    expect(screen.getByText("Learning review")).toBeTruthy();
    expect(screen.getByText("Estimated band")).toBeTruthy();
    expect(screen.getByText("6.5")).toBeTruthy();
    expect(screen.getByText("Next study plan")).toBeTruthy();
    expect(screen.getByText("Practise a focused drill")).toBeTruthy();
    expect(screen.getByText("Train pronunciation")).toBeTruthy();
    expect(screen.getByText("IELTS criteria details")).toBeTruthy();
  });

  it("shows a pronunciation queue for low-scoring mispronounced words", () => {
    renderPanel({
      ...feedback,
      pronunciationAssessment: {
        score: 68,
        accuracyScore: 64,
        fluencyScore: 72,
        completenessScore: 90,
        summary: "Focus on consonant endings.",
        words: [
          { word: "coastal", score: 58, accuracyScore: 55, errorType: "Mispronunciation" },
          { word: "port", score: 62, accuracyScore: 60, errorType: "Mispronunciation" },
          { word: "city", score: 88, accuracyScore: 90, errorType: "None" },
          { word: "known", score: 75, accuracyScore: 76, errorType: "Mispronunciation" },
        ],
      },
    });

    expect(screen.getByText("Pronunciation queue")).toBeTruthy();
    expect(screen.getByText("coastal")).toBeTruthy();
    expect(screen.getByText("port")).toBeTruthy();
    expect(screen.queryByText("city")).toBeNull();
    expect(screen.queryByText("known")).toBeNull();
  });

  it("omits the pronunciation queue when there are no priority words", () => {
    renderPanel({
      ...feedback,
      pronunciationAssessment: {
        score: 82,
        accuracyScore: 84,
        fluencyScore: 80,
        completenessScore: 92,
        summary: "Pronunciation is mostly clear.",
        words: [
          { word: "clear", score: 86, accuracyScore: 88, errorType: "None" },
          { word: "examples", score: 74, accuracyScore: 76, errorType: "Mispronunciation" },
        ],
      },
    });

    expect(screen.queryByText("Pronunciation queue")).toBeNull();
  });
});
