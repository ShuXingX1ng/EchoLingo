import { describe, it, expect } from "vitest"
import type { SpeechEvaluationResult } from "@/types"
import en from "@/locales/en.json"
import zh from "@/locales/zh.json"
import { annotatedWords, isSelectable, practiceItemText, wordIssues } from "./speech-annotation"

const AVAILABLE = {
  sentence: { status: "available" },
  word: { status: "available" },
  phoneme: { status: "available" },
} as const

function evaluation(fields: Partial<SpeechEvaluationResult> = {}): SpeechEvaluationResult {
  return {
    provider: "echolingo",
    scale: "10-90",
    taskScoreEstimate: 70,
    overallScore: null,
    pronunciation: 70,
    oralFluency: 70,
    content: 85,
    words: [
      { word: "the", score: 80, status: "correct" },
      { word: "heart", score: 35, status: "mispronounced" },
      { word: "pumps", score: null, status: "omitted" },
      { word: "blood", score: null, status: "not_scored" },
    ],
    evidenceStatus: AVAILABLE,
    summary: "",
    ...fields,
  }
}

describe("annotatedWords", () => {
  it("puts each reading error and fluency event at its word", () => {
    const words = annotatedWords(evaluation({
      readingErrors: [
        { kind: "inserted", wordIndex: 0, startSec: 0.4, endSec: 0.7, heard: "big" },
        { kind: "repeated", wordIndex: 1, startSec: 0.9, endSec: 1.1, heard: "hear" },
        { kind: "omitted", wordIndex: 2, startSec: 1.2, endSec: 1.23 },
      ],
      fluencyEvents: [
        { kind: "pause", wordIndex: 0, startSec: 0.7, endSec: 1.46, atSentenceBoundary: false },
        { kind: "slow_word", wordIndex: 3, startSec: 1.5, endSec: 2.42, atSentenceBoundary: false },
        { kind: "pause", wordIndex: 9, startSec: 3, endSec: 4, atSentenceBoundary: false },
      ],
    }))

    expect(words[0].after).toEqual([
      { kind: "inserted", heard: "big" },
      { kind: "pause", seconds: 0.8, atSentenceBoundary: false },
    ])
    expect(words[1].repeatedAs).toBe("hear")
    expect(words[2].status).toBe("omitted")
    expect(words[3].slowSec).toBe(0.9)
  })

  it("leaves a result from before fluency events and reading errors as its words", () => {
    const words = annotatedWords(evaluation())
    expect(words.every((word) => word.after.length === 0 && word.slowSec === null)).toBe(true)
  })
})

describe("wordIssues", () => {
  it("lists the status and every finding at a word", () => {
    const [the, heart] = annotatedWords(evaluation({
      readingErrors: [{ kind: "repeated", wordIndex: 1, startSec: 0.9, endSec: 1.1, heard: "hear" }],
      fluencyEvents: [{ kind: "pause", wordIndex: 1, startSec: 1, endSec: 2.5, atSentenceBoundary: true }],
    }))

    expect(wordIssues(the)).toEqual([])
    expect(wordIssues(heart)).toEqual([
      { key: "speechEvaluation.wordStatus.mispronounced" },
      { key: "speechEvaluation.issue.repeated", params: { heard: "hear" } },
      { key: "speechEvaluation.issue.pauseBetweenSentences", params: { seconds: 1.5 } },
    ])
  })

  it("makes a word selectable when it has a score or an issue", () => {
    const [the, , pumps] = annotatedWords(evaluation())
    expect(isSelectable(the)).toBe(true)
    expect(isSelectable(pumps)).toBe(true)
    expect(isSelectable({ ...the, score: null })).toBe(false)
  })
})

describe("practiceItemText", () => {
  it("says how many there are only when not all are named", () => {
    expect(practiceItemText({ kind: "pause", count: 2, wordIndices: [0, 3], words: ["the", "blood"] }))
      .toEqual({ key: "speechEvaluation.practice.pause", params: { words: "“the”, “blood”", count: 2 } })
    expect(practiceItemText({ kind: "mispronounced", count: 7, wordIndices: [1], words: ["heart"] }).key)
      .toBe("speechEvaluation.practice.mispronouncedMore")
  })

  it("has text in both languages for every kind", () => {
    const kinds = ["omitted", "inserted", "repeated", "mispronounced", "pause", "slow_word"]
    for (const locale of [en, zh] as Record<string, string>[]) {
      for (const kind of kinds) {
        expect(locale[`speechEvaluation.practice.${kind}`]).toBeTruthy()
        expect(locale[`speechEvaluation.practice.${kind}More`]).toContain("{count}")
      }
    }
  })
})
