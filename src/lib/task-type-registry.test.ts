import { describe, it, expect } from "vitest"
import en from "@/locales/en.json"
import zh from "@/locales/zh.json"
import type { DimensionScores, PteTaskType } from "@/types"
import {
  ALL_TASK_TYPES,
  MOCK_EXAM_SEQUENCE,
  SCORING_DIMENSIONS,
  TASK_TYPE_REGISTRY,
  averageDimensionScore,
  dimensionEntries,
  getTaskTypesScoredAs,
  practicePath,
  taskTypeLabel,
  timingSummary,
} from "./task-type-registry"

// Exhaustive over the PteTaskType union: adding or removing a member of the
// union without touching this record is a type error, and the test below then
// checks the record against the catalogue.
const UNION_MEMBERS: Record<PteTaskType, true> = {
  read_aloud: true,
  repeat_sentence: true,
  answer_short_question: true,
  summarize_written_text: true,
  write_essay: true,
  personal_intro: true,
  write_from_dictation: true,
  describe_image: true,
  re_tell_lecture: true,
  fill_in_the_blanks_reading: true,
  re_order_paragraphs: true,
  multiple_choice_reading: true,
  summarize_spoken_text: true,
  fill_in_the_blanks_listening: true,
  highlight_correct_summary: true,
}

describe("Task Type catalogue", () => {
  it("lists exactly the Task Types in the PteTaskType union, once each", () => {
    expect([...ALL_TASK_TYPES].sort()).toEqual(Object.keys(UNION_MEMBERS).sort())
  })

  it("orders every Task Type exactly once in the Mock Exam sequence", () => {
    expect([...MOCK_EXAM_SEQUENCE].sort()).toEqual([...ALL_TASK_TYPES].sort())
  })

  it("gives every Task Type a unique practice route and short name", () => {
    const routes = ALL_TASK_TYPES.map(t => TASK_TYPE_REGISTRY[t].route)
    const shortNames = ALL_TASK_TYPES.map(t => TASK_TYPE_REGISTRY[t].shortName)
    expect(new Set(routes).size).toBe(ALL_TASK_TYPES.length)
    expect(new Set(shortNames).size).toBe(ALL_TASK_TYPES.length)
  })

  it("has a translated label for every Task Type in both locales", () => {
    const identity = (key: string) => key
    for (const taskType of ALL_TASK_TYPES) {
      const key = taskTypeLabel(identity, taskType)
      expect(en, `en is missing ${key}`).toHaveProperty([key])
      expect(zh, `zh is missing ${key}`).toHaveProperty([key])
    }
  })

  it("only gives a maximum score to Task Types that are scored", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const meta = TASK_TYPE_REGISTRY[taskType]
      if (meta.maxScore !== null) expect(meta.scoredAs, taskType).not.toBeNull()
    }
  })

  it("places Write from Dictation in Listening while leaving it unscored", () => {
    const meta = TASK_TYPE_REGISTRY.write_from_dictation
    expect(meta.category).toBe("listening")
    expect(meta.scoredAs).toBeNull()
    expect(getTaskTypesScoredAs("listening")).not.toContain("write_from_dictation")
  })
})

describe("practicePath", () => {
  it("uses the catalogue route, which is not always the kebab-cased id", () => {
    expect(practicePath("read_aloud")).toBe("/practice/read-aloud")
    expect(practicePath("fill_in_the_blanks_reading")).toBe("/practice/fill-in-the-blanks")
    expect(practicePath("multiple_choice_reading")).toBe("/practice/multiple-choice")
  })

  it("returns undefined for an unknown Task Type", () => {
    expect(practicePath("not_a_task")).toBeUndefined()
  })
})

describe("dimension scores", () => {
  const samples: DimensionScores[] = [
    { section: "speaking", fluency: 60, pronunciation: 70, content: 80 },
    { section: "writing", grammar: 50, vocabulary: 60, form: 70, content: 80 },
    { section: "reading", vocabulary: 40, comprehension: 60 },
    { section: "listening", comprehension: 30, accuracy: 50 },
  ]

  it("lists each section's dimensions in catalogue order", () => {
    for (const sample of samples) {
      expect(dimensionEntries(sample).map(([dimension]) => dimension)).toEqual(
        SCORING_DIMENSIONS[sample.section]
      )
    }
    expect(dimensionEntries(samples[0])).toEqual([
      ["fluency", 60],
      ["pronunciation", 70],
      ["content", 80],
    ])
  })

  it("averages every section, listening included", () => {
    expect(samples.map(averageDimensionScore)).toEqual([70, 65, 50, 40])
  })
})

describe("malformed stored dimension scores", () => {
  it("yields nothing for an unknown section instead of throwing", () => {
    const scores = { section: "grammar", content: 80 } as unknown as DimensionScores
    expect(dimensionEntries(scores)).toEqual([])
    expect(averageDimensionScore(scores)).toBeNull()
  })

  it("leaves out dimensions without a numeric score", () => {
    const scores = { section: "reading", accuracy: 70 } as unknown as DimensionScores
    const entries = dimensionEntries(scores)
    expect(entries.every(([, score]) => typeof score === "number")).toBe(true)
  })
})

describe("timingSummary", () => {
  it("words the timed phases from the catalogue", () => {
    expect(timingSummary("read_aloud")).toBe("35s prep · 40s")
    expect(timingSummary("repeat_sentence")).toBe("15s")
    expect(timingSummary("write_essay")).toBe("20 min")
  })

  it("applies a Mock Exam-only limit in a Mock Exam alone", () => {
    expect(timingSummary("write_from_dictation")).toBe("")
    expect(timingSummary("write_from_dictation", "mock")).toBe("3 min")
  })
})
