import { describe, it, expect } from "vitest"
import type { SpeechEvaluationResult, StoredSpeechEvaluationResult, TaskFeedback } from "@/types"
import {
  compareSwitchOn,
  evidenceNoticeKey,
  hidesFeedbackScores,
  pronunciationAverages,
  speechErrorKey,
  speechEvaluationErrorOf,
  speechEvaluationModeFor,
  speechEvaluationOf,
  speechProviderName,
  speechScores,
} from "./speech-evaluation"

const ENVELOPE = { summary: "", strengths: [], weaknesses: [], suggestions: [] }

const AVAILABLE = {
  sentence: { status: "available" },
  word: { status: "available" },
  phoneme: { status: "available" },
} as const

const AZURE: SpeechEvaluationResult = {
  provider: "azure",
  scale: "0-100",
  taskScoreEstimate: null,
  overallScore: 85,
  pronunciation: 82,
  oralFluency: 88,
  content: 91,
  recognizedText: "Cities grow.",
  words: [],
  evidenceStatus: { ...AVAILABLE, word: { status: "unavailable", reason: "not_returned" }, phoneme: { status: "unavailable", reason: "not_returned" } },
  summary: "Good.",
}

const ECHOLINGO: SpeechEvaluationResult = {
  provider: "echolingo",
  scale: "10-90",
  taskScoreEstimate: 74,
  overallScore: null,
  pronunciation: 72,
  oralFluency: 68,
  content: 90,
  recognizedText: "cities grow",
  words: [{ word: "cities", score: 80, status: "correct" }],
  evidenceStatus: AVAILABLE,
  modelId: "speech-evaluator-v0.1.0",
  warnings: [],
  summary: "",
}

describe("speechEvaluationOf", () => {
  it("returns a current result as stored", () => {
    expect(speechEvaluationOf({ ...ENVELOPE, speechEvaluation: ECHOLINGO })).toBe(ECHOLINGO)
  })

  it("has nothing for Feedback without a spoken evaluation", () => {
    expect(speechEvaluationOf(ENVELOPE)).toBeUndefined()
    expect(speechEvaluationOf(null)).toBeUndefined()
  })

  it("upgrades a neutral result saved before scales and evidence status", () => {
    const stored: StoredSpeechEvaluationResult = {
      ...AZURE,
      scale: undefined,
      evidenceStatus: undefined,
      words: [{ word: "cities", score: 90, status: "correct", phonemes: [{ phoneme: "s", score: 95 }] }],
      evidence: { taskScoreEstimate: false, words: true, phonemes: true },
    }

    const evaluation = speechEvaluationOf({ ...ENVELOPE, speechEvaluation: stored })!

    expect(evaluation.scale).toBe("0-100")
    expect(evaluation.evidenceStatus).toEqual(AVAILABLE)
    expect(evaluation).not.toHaveProperty("evidence")
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
      provider: "azure", scale: "0-100", taskScoreEstimate: null, overallScore: 85,
      pronunciation: 82, oralFluency: 88, content: 91, recognizedText: "Cities grow.",
    })
    expect(evaluation.words.map((word) => word.status)).toEqual(["correct", "mispronounced", "omitted", "correct"])
    expect(evaluation.words[0].phonemes).toEqual([{ phoneme: "s", score: 95 }])
    expect(evaluation.evidenceStatus).toEqual(AVAILABLE)
  })

  it("prefers the neutral result when a Feedback carries both", () => {
    const both = { ...ENVELOPE, speechEvaluation: AZURE, pronunciationAssessment: { score: 1, accuracyScore: 1, fluencyScore: 1, completenessScore: 1, words: [], summary: "" } }
    expect(speechEvaluationOf(both)).toBe(AZURE)
  })
})

describe("speechEvaluationErrorOf", () => {
  const error = { provider: "echolingo", code: "worker_unavailable", message: "down" }

  it("reports why a recording has no result", () => {
    expect(speechEvaluationErrorOf({ ...ENVELOPE, speechEvaluationError: error })).toEqual(error)
  })

  it("has nothing when there is a result", () => {
    expect(speechEvaluationErrorOf({ ...ENVELOPE, speechEvaluation: ECHOLINGO, speechEvaluationError: error })).toBeUndefined()
    expect(speechEvaluationErrorOf(ENVELOPE)).toBeUndefined()
  })
})

describe("speechScores", () => {
  it("leads with the Spoken Task Score Estimate when there is one", () => {
    expect(speechScores(ECHOLINGO)).toEqual([
      { labelKey: "speechEvaluation.taskScore", score: 74 },
      { labelKey: "speechEvaluation.pronunciation", score: 72 },
      { labelKey: "speechEvaluation.oralFluency", score: 68 },
      { labelKey: "speechEvaluation.content", score: 90 },
    ])
  })

  it("falls back to the provider's own overall score", () => {
    expect(speechScores(AZURE).map(({ score }) => score)).toEqual([85, 82, 88, 91])
  })

  it("keeps unavailable dimensions as null and drops a missing headline", () => {
    const degraded = { ...ECHOLINGO, taskScoreEstimate: null, pronunciation: null, oralFluency: null }
    expect(speechScores(degraded).map(({ score }) => score)).toEqual([null, null, 90])
  })
})

describe("evidenceNoticeKey", () => {
  it("explains a passage that was not read before anything else", () => {
    const notRead = { ...ECHOLINGO, evidenceStatus: {
      sentence: { status: "degraded", reason: "reference_not_read" },
      word: { status: "unavailable", reason: "reference_not_read" },
      phoneme: { status: "unavailable", reason: "reference_not_read" },
    } } as SpeechEvaluationResult
    expect(evidenceNoticeKey(notRead)).toBe("speechEvaluation.notice.referenceNotRead")
  })

  it("explains degraded sentences and partially judged words", () => {
    const degraded = { ...ECHOLINGO, evidenceStatus: { ...AVAILABLE, sentence: { status: "degraded", reason: "alignment_failed" } } } as SpeechEvaluationResult
    const partial = { ...ECHOLINGO, evidenceStatus: { ...AVAILABLE, word: { status: "partial", reason: "out_of_vocabulary" } } } as SpeechEvaluationResult
    expect(evidenceNoticeKey(degraded)).toBe("speechEvaluation.notice.sentenceDegraded")
    expect(evidenceNoticeKey(partial)).toBe("speechEvaluation.notice.wordsPartial")
    expect(evidenceNoticeKey(ECHOLINGO)).toBeUndefined()
  })
})

describe("speechErrorKey", () => {
  it("explains known failures and groups the rest", () => {
    expect(speechErrorKey("worker_unavailable")).toBe("speechEvaluation.error.worker_unavailable")
    expect(speechErrorKey("something_new")).toBe("speechEvaluation.error.other")
  })
})

describe("compareSwitchOn", () => {
  it("is on only when the switch is 1", () => {
    expect(compareSwitchOn("1")).toBe(true)
    expect(compareSwitchOn("0")).toBe(false)
    expect(compareSwitchOn(undefined)).toBe(false)
  })
})

describe("speechEvaluationModeFor", () => {
  it("asks for comparison only for Read Aloud behind the developer switch", () => {
    expect(speechEvaluationModeFor("read_aloud", "1")).toBe("compare")
    expect(speechEvaluationModeFor("read_aloud", undefined)).toBeUndefined()
    expect(speechEvaluationModeFor("read_aloud", "0")).toBeUndefined()
    expect(speechEvaluationModeFor("repeat_sentence", "1")).toBeUndefined()
  })
})

describe("speechProviderName", () => {
  it("names known providers and passes unknown ones through", () => {
    expect(speechProviderName(AZURE)).toBe("Azure")
    expect(speechProviderName(ECHOLINGO)).toBe("EchoLingo")
    expect(speechProviderName({ ...AZURE, provider: "other" })).toBe("other")
  })
})

describe("pronunciationAverages", () => {
  it("averages each scale on its own and skips unscored results", () => {
    const degraded = { ...ECHOLINGO, pronunciation: null }
    expect(pronunciationAverages([ECHOLINGO, { ...ECHOLINGO, pronunciation: 61 }, AZURE, degraded, undefined])).toEqual([
      { scale: "10-90", average: 67 },
      { scale: "0-100", average: 82 },
    ])
    expect(pronunciationAverages([])).toEqual([])
  })
})

describe("hidesFeedbackScores", () => {
  it("leaves out the Feedback's own scores only beside an EchoLingo result", () => {
    expect(hidesFeedbackScores(ECHOLINGO)).toBe(true)
    expect(hidesFeedbackScores(AZURE)).toBe(false)
    expect(hidesFeedbackScores(undefined)).toBe(false)
  })
})
