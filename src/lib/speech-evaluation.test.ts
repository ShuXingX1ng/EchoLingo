import { describe, it, expect } from "vitest"
import type { SpeechEvaluationResult, TaskFeedback } from "@/types"
import { speechEvaluationOf, speechProviderName, speechScores } from "./speech-evaluation"

const ENVELOPE = { summary: "", strengths: [], weaknesses: [], suggestions: [] }

const NEUTRAL: SpeechEvaluationResult = {
  provider: "azure",
  taskScoreEstimate: null,
  overallScore: 85,
  pronunciation: 82,
  oralFluency: 88,
  content: 91,
  recognizedText: "Cities grow.",
  words: [],
  evidence: { taskScoreEstimate: false, words: false, phonemes: false },
  summary: "Good.",
}

describe("speechEvaluationOf", () => {
  it("returns the provider-neutral result as stored", () => {
    expect(speechEvaluationOf({ ...ENVELOPE, speechEvaluation: NEUTRAL })).toBe(NEUTRAL)
  })

  it("has nothing for Feedback without a spoken evaluation", () => {
    expect(speechEvaluationOf(ENVELOPE)).toBeUndefined()
    expect(speechEvaluationOf(null)).toBeUndefined()
  })

  it("reads a Practice Task saved with Azure's own shape", () => {
    const stored: TaskFeedback = {
      ...ENVELOPE,
      pronunciationAssessment: {
        score: 85,
        accuracyScore: 82,
        fluencyScore: 88,
        completenessScore: 91,
        summary: "Good.",
        recognizedText: "Cities grow.",
        words: [
          { word: "cities", score: 90, accuracyScore: 90, errorType: "None", phonemes: [{ phoneme: "s", score: 95, accuracyScore: 95 }] },
          { word: "grow", score: 40, accuracyScore: 40, errorType: "Mispronunciation" },
          { word: "when", score: 0, accuracyScore: 0, errorType: "Omission" },
          { word: "um", score: 0, accuracyScore: 0 },
        ],
      },
    }

    const evaluation = speechEvaluationOf(stored)!

    expect(evaluation).toMatchObject({
      provider: "azure", taskScoreEstimate: null, overallScore: 85,
      pronunciation: 82, oralFluency: 88, content: 91, recognizedText: "Cities grow.",
    })
    expect(evaluation.words.map((word) => word.status)).toEqual(["correct", "mispronounced", "omitted", "correct"])
    expect(evaluation.words[0].phonemes).toEqual([{ phoneme: "s", score: 95 }])
    expect(evaluation.evidence).toEqual({ taskScoreEstimate: false, words: true, phonemes: true })
  })

  it("prefers the neutral result when a Feedback carries both", () => {
    const both = { ...ENVELOPE, speechEvaluation: NEUTRAL, pronunciationAssessment: { score: 1, accuracyScore: 1, fluencyScore: 1, completenessScore: 1, words: [], summary: "" } }
    expect(speechEvaluationOf(both)).toBe(NEUTRAL)
  })
})

describe("speechScores", () => {
  it("lists the overall score and the three dimension estimates", () => {
    expect(speechScores(NEUTRAL).map(({ score }) => score)).toEqual([85, 82, 88, 91])
  })

  it("leaves out an overall score the provider did not give", () => {
    expect(speechScores({ ...NEUTRAL, overallScore: null }).map(({ labelKey }) => labelKey)).toEqual([
      "speechEvaluation.pronunciation", "speechEvaluation.oralFluency", "speechEvaluation.content",
    ])
  })
})

describe("speechProviderName", () => {
  it("names known providers and passes unknown ones through", () => {
    expect(speechProviderName(NEUTRAL)).toBe("Azure")
    expect(speechProviderName({ ...NEUTRAL, provider: "other" })).toBe("other")
  })
})
