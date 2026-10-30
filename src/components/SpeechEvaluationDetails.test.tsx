import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SpeechEvaluationDetails from "@/components/SpeechEvaluationDetails";
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay";
import { I18nProvider } from "@/lib/i18n";
import type { SpeechEvaluationResult, TaskFeedback } from "@/types";

const AVAILABLE = {
  sentence: { status: "available" },
  word: { status: "available" },
  phoneme: { status: "available" },
} as const;

const ECHOLINGO: SpeechEvaluationResult = {
  provider: "echolingo",
  scale: "10-90",
  taskScoreEstimate: 62,
  overallScore: null,
  pronunciation: 55,
  oralFluency: 60,
  content: 88,
  words: [
    { word: "cities", score: 80, status: "correct" },
    { word: "grow", score: 31, status: "mispronounced" },
    { word: "when", score: 77, status: "correct" },
  ],
  fluencyEvents: [
    { kind: "pause", wordIndex: 1, startSec: 0.9, endSec: 1.7, atSentenceBoundary: false },
  ],
  readingErrors: [{ kind: "inserted", wordIndex: 0, startSec: 0.5, endSec: 0.8, heard: "big" }],
  practiceSummary: [
    { kind: "inserted", count: 1, wordIndices: [0], words: ["big"] },
    { kind: "mispronounced", count: 1, wordIndices: [1], words: ["grow"] },
  ],
  evidenceStatus: AVAILABLE,
  summary: "",
};

function renderIn(element: React.ReactElement) {
  render(<I18nProvider>{element}</I18nProvider>);
}

describe("SpeechEvaluationDetails", () => {
  it("shows the practice summary and marks the passage where something was found", () => {
    renderIn(<SpeechEvaluationDetails evaluation={ECHOLINGO} />);

    expect(screen.getByText("Practise first")).toBeTruthy();
    expect(screen.getByText("Words added: “big”")).toBeTruthy();
    expect(screen.getByText("Mispronounced words: “grow”")).toBeTruthy();
    expect(screen.getByText("+big")).toBeTruthy();
    expect(screen.getByText("‖ 0.8s")).toBeTruthy();
  });

  it("shows a selected word's score and what was found at it", () => {
    renderIn(<SpeechEvaluationDetails evaluation={ECHOLINGO} />);
    fireEvent.click(screen.getByRole("button", { name: "grow" }));

    expect(screen.getByText("Word score 31")).toBeTruthy();
    expect(screen.getAllByText("Mispronounced")).toHaveLength(2); // the detail and the legend
    expect(screen.getByText("Pause of 0.8 s after this word")).toBeTruthy();
  });

  it("shows no summary for a record saved before there was one", () => {
    renderIn(<SpeechEvaluationDetails evaluation={{ ...ECHOLINGO, practiceSummary: undefined }} />);
    expect(screen.queryByText("Practise first")).toBeNull();
  });
});

describe("TaskFeedbackDisplay", () => {
  const feedback: TaskFeedback = {
    summary: "Good.",
    strengths: [],
    weaknesses: [],
    suggestions: [],
    dimensionScores: { section: "speaking", fluency: 80, pronunciation: 85, content: 90 },
    scoreCard: { earned: 13, max: 15 },
  };

  it("leaves out the Feedback's own scores beside an EchoLingo evaluation", () => {
    renderIn(<TaskFeedbackDisplay feedback={{ ...feedback, speechEvaluation: ECHOLINGO }} />);
    expect(screen.queryByText("Dimension Scores")).toBeNull();
    expect(screen.queryByText("13")).toBeNull();
  });

  it("keeps them beside an Azure evaluation", () => {
    const azure = { ...ECHOLINGO, provider: "azure", scale: "0-100" as const, taskScoreEstimate: null };
    renderIn(<TaskFeedbackDisplay feedback={{ ...feedback, speechEvaluation: azure }} />);
    expect(screen.getByText("Dimension Scores")).toBeTruthy();
    expect(screen.getByText("13")).toBeTruthy();
  });
});
