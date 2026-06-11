import { describe, expect, it } from "vitest"
import { deriveTaskTypeWeakness, rankWeaknesses, ALL_TASK_TYPES } from "./task-weakness"
import type { PracticeTask } from "@/types"

function makeTask(overrides: Partial<PracticeTask> = {}): PracticeTask {
  return {
    id: crypto.randomUUID(),
    taskType: "read_aloud",
    stimulus: { kind: "text", content: "Test passage." },
    response: { kind: "audio", content: "" },
    feedback: {
      summary: "Good attempt.",
      strengths: ["Clear speech"],
      weaknesses: ["Some hesitation"],
      suggestions: ["Practice more"],
    },
    durationSeconds: 30,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("deriveTaskTypeWeakness", () => {
  it("returns an entry for every task type with score 50 when no tasks supplied", () => {
    const result = deriveTaskTypeWeakness([])
    expect(result).toHaveLength(ALL_TASK_TYPES.length)
    for (const w of result) {
      expect(w.score).toBe(50)
      expect(w.recentCount).toBe(0)
      expect(w.lastPracticed).toBeUndefined()
      expect(w.dimensions).toBeUndefined()
    }
  })

  it("scores a speaking task from dimension scores: fluency + pronunciation + content average", () => {
    const task = makeTask({
      taskType: "read_aloud",
      feedback: {
        summary: "Good.",
        strengths: [],
        weaknesses: [],
        suggestions: [],
        dimensionScores: { section: "speaking", fluency: 70, pronunciation: 80, content: 90 },
      },
    })
    const result = deriveTaskTypeWeakness([task])
    const ra = result.find((w) => w.taskType === "read_aloud")!
    expect(ra.score).toBe(80) // (70+80+90)/3
    expect(ra.recentCount).toBe(1)
    expect(ra.lastPracticed).toBe(task.createdAt)
  })

  it("scores a writing task from dimension scores: grammar + vocabulary + form + content average", () => {
    const task = makeTask({
      taskType: "write_essay",
      feedback: {
        summary: "Good.",
        strengths: [],
        weaknesses: [],
        suggestions: [],
        dimensionScores: { section: "writing", grammar: 60, vocabulary: 70, form: 80, content: 90 },
      },
    })
    const result = deriveTaskTypeWeakness([task])
    const we = result.find((w) => w.taskType === "write_essay")!
    expect(we.score).toBe(75) // (60+70+80+90)/4
  })

  it("scores a reading task from dimension scores: vocabulary + comprehension average", () => {
    const task = makeTask({
      taskType: "fill_in_the_blanks_reading",
      feedback: {
        summary: "Good.",
        strengths: [],
        weaknesses: [],
        suggestions: [],
        dimensionScores: { section: "reading", vocabulary: 60, comprehension: 80 },
      },
    })
    const result = deriveTaskTypeWeakness([task])
    const fib = result.find((w) => w.taskType === "fill_in_the_blanks_reading")!
    expect(fib.score).toBe(70) // (60+80)/2
  })

  it("scores a listening task from dimension scores: comprehension + accuracy average", () => {
    const task = makeTask({
      taskType: "summarize_spoken_text",
      feedback: {
        summary: "Good.",
        strengths: [],
        weaknesses: [],
        suggestions: [],
        dimensionScores: { section: "listening", comprehension: 50, accuracy: 90 },
      },
    })
    const result = deriveTaskTypeWeakness([task])
    const sst = result.find((w) => w.taskType === "summarize_spoken_text")!
    expect(sst.score).toBe(70) // (50+90)/2
  })

  it("falls back to strengths/weaknesses heuristic when no dimensionScores", () => {
    const task = makeTask({
      taskType: "answer_short_question",
      feedback: {
        summary: "Decent.",
        strengths: ["A", "B", "C"],
        weaknesses: ["X"],
        suggestions: [],
      },
    })
    const result = deriveTaskTypeWeakness([task])
    const asq = result.find((w) => w.taskType === "answer_short_question")!
    // 3 strengths / (3+1) total = 75
    expect(asq.score).toBe(75)
  })

  it("returns score 50 when feedback has no strengths or weaknesses", () => {
    const task = makeTask({
      taskType: "personal_intro",
      feedback: { summary: "OK.", strengths: [], weaknesses: [], suggestions: [] },
    })
    const result = deriveTaskTypeWeakness([task])
    const pi = result.find((w) => w.taskType === "personal_intro")!
    expect(pi.score).toBe(50)
  })

  it("populates dimensions when tasks have dimension scores", () => {
    const task = makeTask({
      taskType: "read_aloud",
      feedback: {
        summary: "Good.",
        strengths: [],
        weaknesses: [],
        suggestions: [],
        dimensionScores: { section: "speaking", fluency: 60, pronunciation: 70, content: 80 },
      },
    })
    const result = deriveTaskTypeWeakness([task])
    const ra = result.find((w) => w.taskType === "read_aloud")!
    expect(ra.dimensions).toBeDefined()
    expect(ra.dimensions).toHaveLength(3)
    const fluencyDim = ra.dimensions!.find((d) => d.dimension === "fluency")!
    expect(fluencyDim.score).toBe(60)
  })

  it("leaves dimensions undefined when no tasks have dimension scores", () => {
    const task = makeTask({ taskType: "read_aloud" })
    const result = deriveTaskTypeWeakness([task])
    const ra = result.find((w) => w.taskType === "read_aloud")!
    expect(ra.dimensions).toBeUndefined()
  })

  it("applies recency weighting — recent tasks dominate older ones", () => {
    const recent = makeTask({
      taskType: "write_essay",
      createdAt: new Date().toISOString(), // today → weight 1.0
      feedback: {
        summary: "Good.",
        strengths: [],
        weaknesses: [],
        suggestions: [],
        dimensionScores: { section: "writing", grammar: 90, vocabulary: 90, form: 90, content: 90 },
      },
    })
    const old = makeTask({
      taskType: "write_essay",
      createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(), // 40 days ago → weight 0.25
      feedback: {
        summary: "Poor.",
        strengths: [],
        weaknesses: [],
        suggestions: [],
        dimensionScores: { section: "writing", grammar: 10, vocabulary: 10, form: 10, content: 10 },
      },
    })
    const result = deriveTaskTypeWeakness([recent, old])
    const we = result.find((w) => w.taskType === "write_essay")!
    // weighted: (90*1.0 + 10*0.25) / (1.0+0.25) = 92.5/1.25 = 74 (approx)
    expect(we.score).toBeGreaterThan(60)
    expect(we.score).toBeLessThan(90)
  })
})

describe("rankWeaknesses", () => {
  it("puts practiced-but-weak entries before never-practiced ones", () => {
    const weaknesses = deriveTaskTypeWeakness([
      makeTask({
        taskType: "read_aloud",
        feedback: { summary: "", strengths: [], weaknesses: ["X", "Y", "Z"], suggestions: [] },
      }),
    ])
    const ranked = rankWeaknesses(weaknesses)
    const firstPracticed = ranked.findIndex((w) => w.recentCount > 0)
    const firstUnpracticed = ranked.findIndex((w) => w.recentCount === 0)
    expect(firstPracticed).toBeLessThan(firstUnpracticed)
  })

  it("sorts practiced entries from lowest to highest score", () => {
    const tasks: PracticeTask[] = [
      makeTask({
        taskType: "read_aloud",
        feedback: {
          summary: "",
          strengths: ["A", "B", "C", "D"],
          weaknesses: [],
          suggestions: [],
        },
      }),
      makeTask({
        taskType: "write_essay",
        feedback: {
          summary: "",
          strengths: [],
          weaknesses: ["A", "B", "C", "D"],
          suggestions: [],
        },
      }),
    ]
    const weaknesses = deriveTaskTypeWeakness(tasks)
    const ranked = rankWeaknesses(weaknesses)
    const practiced = ranked.filter((w) => w.recentCount > 0)
    expect(practiced[0].score).toBeLessThanOrEqual(practiced[1].score)
  })
})
