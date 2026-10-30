import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SpeechComparisonPanel from "@/components/SpeechComparisonPanel";
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay";
import { I18nProvider } from "@/lib/i18n";
import { comparisonForRecord, comparisonRows, feedbackForRecord } from "@/lib/speech-comparison";
import type { SpeechEvaluationComparison, SpeechEvaluationResult, TaskFeedback } from "@/types";

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
  recognizedText: "cities grow when people move",
  words: [{ word: "cities", score: 80, status: "correct" }],
  evidenceStatus: { ...AVAILABLE, phoneme: { status: "partial", reason: "out_of_vocabulary" } },
  modelId: "speech-evaluator-v0.1.0",
  summary: "",
};

const COMPARISON: SpeechEvaluationComparison = {
  recordingSha256: "0123456789abcdef",
  createdAt: "2026-10-30T10:00:00+00:00",
  baseline: {
    provider: "azure",
    scale: "0-100",
    taskScoreEstimate: null,
    overallScore: 81,
    pronunciation: 70,
    oralFluency: 75,
    content: 100,
    recognizedText: "cities glow when people move",
    words: [{ word: "cities", score: 95, status: "correct", phonemes: [{ phoneme: "s", score: 90 }] }],
    evidenceStatus: AVAILABLE,
    summary: "Good.",
  },
  baselineError: null,
  latencyMs: { echolingo: 2977.4, azure: 1210 },
  differences: { pronunciation: -13.8, oralFluency: -12.5, content: null },
  wordDisagreements: [{ word: "grow", echolingo: "mispronounced", azure: "correct" }],
};

describe("comparisonRows", () => {
  it("pairs each dimension's scores with FastAPI's difference", () => {
    expect(comparisonRows(ECHOLINGO, COMPARISON)).toEqual([
      { labelKey: "speechEvaluation.pronunciation", echolingo: 55, azure: 70, difference: -13.8 },
      { labelKey: "speechEvaluation.oralFluency", echolingo: 60, azure: 75, difference: -12.5 },
      { labelKey: "speechEvaluation.content", echolingo: 88, azure: 100, difference: null },
    ]);
  });
});

describe("comparisonForRecord", () => {
  it("keeps the scores, evidence and checkpoint but not the baseline's words or text", () => {
    const stored = comparisonForRecord(COMPARISON);

    expect(stored.baseline).toEqual({
      provider: "azure", scale: "0-100", taskScoreEstimate: null, overallScore: 81,
      pronunciation: 70, oralFluency: 75, content: 100, words: [], evidenceStatus: AVAILABLE,
      modelId: null, warnings: [], summary: "",
    });
    const { baseline, ...rest } = stored;
    const { baseline: original, ...originalRest } = COMPARISON;
    expect(rest).toEqual(originalRest);
    expect(original?.words).toHaveLength(1); // the shown comparison is untouched
    expect(baseline).not.toBe(original);
  });

  it("leaves a Feedback without a comparison as it is", () => {
    const feedback: TaskFeedback = { summary: "", strengths: [], weaknesses: [], suggestions: [] };
    expect(feedbackForRecord(feedback)).toBe(feedback);
    expect(comparisonForRecord({ ...COMPARISON, baseline: null }).baseline).toBeNull();
  });
});

function renderIn(element: React.ReactElement) {
  render(<I18nProvider>{element}</I18nProvider>);
}

describe("SpeechComparisonPanel", () => {
  it("shows both providers, their difference, texts, disagreements, alignment and latency", () => {
    renderIn(<SpeechComparisonPanel comparison={COMPARISON} primary={ECHOLINGO} />);

    expect(screen.getByText("-13.8")).toBeTruthy();
    expect(screen.getByText("cities glow when people move")).toBeTruthy();
    expect(screen.getByText("cities grow when people move")).toBeTruthy();
    expect(screen.getByText(/“grow” — EchoLingo: Mispronounced, Azure: Correct/)).toBeTruthy();
    expect(screen.getByText(/phoneme: partial \(out_of_vocabulary\)/)).toBeTruthy();
    expect(screen.getByText(/EchoLingo 2977 ms · Azure 1210 ms/)).toBeTruthy();
  });

  it("says a saved comparison's baseline text was not kept, and shows a provider's failure", () => {
    const stored = { ...comparisonForRecord(COMPARISON), baselineError: { provider: "azure", code: "timeout", message: "slow" } };
    renderIn(<SpeechComparisonPanel comparison={stored} primary={ECHOLINGO} />);

    expect(screen.getByText("Not kept with the record")).toBeTruthy();
    expect(screen.getByText("Azure: timeout — slow")).toBeTruthy();
  });
});

describe("TaskFeedbackDisplay", () => {
  const feedback: TaskFeedback = {
    summary: "", strengths: [], weaknesses: [], suggestions: [],
    speechEvaluation: ECHOLINGO, speechEvaluationComparison: COMPARISON,
  };

  afterEach(() => vi.unstubAllEnvs());

  it("shows the Compare panel only behind the developer switch", () => {
    vi.stubEnv("NEXT_PUBLIC_SPEECH_EVALUATION_COMPARE", "0");
    renderIn(<TaskFeedbackDisplay feedback={feedback} />);
    expect(screen.queryByText("Compare (developer): EchoLingo vs Azure")).toBeNull();
  });

  it("shows it when the switch is on", () => {
    vi.stubEnv("NEXT_PUBLIC_SPEECH_EVALUATION_COMPARE", "1");
    renderIn(<TaskFeedbackDisplay feedback={feedback} />);
    expect(screen.getByText("Compare (developer): EchoLingo vs Azure")).toBeTruthy();
  });
});
