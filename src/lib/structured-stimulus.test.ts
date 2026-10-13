import { describe, it, expect } from "vitest"
import {
  fillInTheBlanksFeedbackResponse,
  fillInTheBlanksFeedbackStimulus,
  fillInTheBlanksSpokenText,
  highlightCorrectSummaryFeedbackResponse,
  highlightCorrectSummaryFeedbackStimulus,
  multipleChoiceFeedbackResponse,
  multipleChoiceFeedbackStimulus,
  parseFillInTheBlanks,
  parseHighlightCorrectSummary,
  parseMultipleChoice,
  parseReOrderParagraphs,
  reOrderParagraphsFeedbackResponse,
  reOrderParagraphsFeedbackStimulus,
  shuffleArray,
  splitPassage,
  spokenStimulusText,
} from "./structured-stimulus"

const FIB = {
  passage: "Scientists [BLANK_0] data, which helps them [BLANK_1] theories.",
  blanks: [
    { options: ["collect", "ignore", "forget"], correct: 0 },
    { options: ["abandon", "refine", "discard"], correct: 1 },
  ],
}

const PARAGRAPHS = [
  { label: "A", text: "First." },
  { label: "B", text: "Second." },
  { label: "C", text: "Third." },
]

const MCQ = {
  passage: "A passage.",
  question: "What is it about?",
  options: ["One", "Two", "Three", "Four", "Five"],
  correct: 2,
}

const HCS = {
  passage: "Renewable energy matters.",
  summaries: ["Right.", "Wrong 1.", "Wrong 2.", "Wrong 3.", "Wrong 4."],
  correct: 0,
}

describe("Fill in the Blanks", () => {
  it("parses a well-formed stimulus and rejects anything else", () => {
    expect(parseFillInTheBlanks(JSON.stringify(FIB))).toEqual(FIB)
    expect(parseFillInTheBlanks("not json")).toBeNull()
    expect(parseFillInTheBlanks("null")).toBeNull()
    expect(parseFillInTheBlanks(JSON.stringify({ passage: "x" }))).toBeNull()
    expect(parseFillInTheBlanks(JSON.stringify({ blanks: [] }))).toBeNull()
  })

  it("splits the passage into text and indexed blanks", () => {
    expect(splitPassage("a [BLANK_0] b [BLANK_1]")).toEqual([
      { type: "text", value: "a " },
      { type: "blank", value: "0" },
      { type: "text", value: " b " },
      { type: "blank", value: "1" },
      { type: "text", value: "" },
    ])
  })

  it("speaks the passage with the correct words in place", () => {
    expect(fillInTheBlanksSpokenText(FIB)).toBe(
      "Scientists collect data, which helps them refine theories."
    )
  })

  it("shows the correct answers in the feedback stimulus", () => {
    expect(fillInTheBlanksFeedbackStimulus(FIB)).toBe(
      "Passage (with correct answers):\n" +
        "Scientists [collect] data, which helps them [refine] theories.\n\n" +
        'Correct answers: Blank 1: "collect", Blank 2: "refine"'
    )
  })

  it("marks each blank the way the backend's reading scorer counts them", () => {
    const response = fillInTheBlanksFeedbackResponse(FIB, ["collect", "abandon"])
    const lines = response.split("\n")
    expect(lines).toEqual([
      'Blank 1: selected "collect" (correct: "collect") ✓',
      'Blank 2: selected "abandon" (correct: "refine") ✗',
    ])
    // backend: correct = lines containing "✓"; wrong blanks = "Blank N" on "✗" lines
    expect(lines.filter((line) => line.includes("✓"))).toHaveLength(1)
    expect(lines.filter((line) => line.includes("✗"))).toHaveLength(1)
  })

  it("counts an unanswered blank as wrong", () => {
    expect(fillInTheBlanksFeedbackResponse(FIB, [null, "refine"]).split("\n")[0]).toBe(
      'Blank 1: selected "(no answer)" (correct: "collect") ✗'
    )
  })
})

describe("Re-order Paragraphs", () => {
  it("parses a stimulus with at least two paragraphs", () => {
    expect(parseReOrderParagraphs(JSON.stringify({ paragraphs: PARAGRAPHS }))).toEqual({
      paragraphs: PARAGRAPHS,
    })
    expect(parseReOrderParagraphs(JSON.stringify({ paragraphs: [PARAGRAPHS[0]] }))).toBeNull()
    expect(parseReOrderParagraphs("{}")).toBeNull()
  })

  it("shuffles without losing or duplicating items, leaving the input alone", () => {
    const input = [1, 2, 3, 4, 5]
    const shuffled = shuffleArray(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect([...shuffled].sort()).toEqual(input)
  })

  it("reports position matches in the sentence the backend parses", () => {
    const userOrder = [PARAGRAPHS[0], PARAGRAPHS[2], PARAGRAPHS[1]]
    const response = reOrderParagraphsFeedbackResponse(userOrder, PARAGRAPHS)
    expect(response).toBe(
      "Submitted order: A → C → B\n" +
        "Correct order:   A → B → C\n" +
        "1 of 3 paragraphs in the correct position."
    )
    expect(response).toMatch(/(\d+) of (\d+) paragraphs in the correct position/)
  })

  it("lists the paragraphs in the correct order for the stimulus", () => {
    expect(reOrderParagraphsFeedbackStimulus(PARAGRAPHS)).toBe(
      "Paragraphs in correct order:\n[A] First.\n\n[B] Second.\n\n[C] Third."
    )
  })
})

describe("Multiple Choice (Reading)", () => {
  it("requires a passage, a question, five options and a correct index", () => {
    expect(parseMultipleChoice(JSON.stringify(MCQ))).toEqual(MCQ)
    expect(parseMultipleChoice(JSON.stringify({ ...MCQ, options: ["a", "b"] }))).toBeNull()
    expect(parseMultipleChoice(JSON.stringify({ ...MCQ, correct: "2" }))).toBeNull()
  })

  it("ticks only the correct option in the stimulus", () => {
    expect(multipleChoiceFeedbackStimulus(MCQ)).toBe(
      "Passage:\nA passage.\n\nQuestion: What is it about?\n\nOptions:\nOne\nTwo\nThree ✓\nFour\nFive"
    )
  })

  it("puts a tick in the response only when the selection is correct", () => {
    expect(multipleChoiceFeedbackResponse(MCQ, 2)).toBe("Selected: Three ✓ (correct)")
    const wrong = multipleChoiceFeedbackResponse(MCQ, 0)
    expect(wrong).toBe("Selected: One ✗ (incorrect — correct answer: Three)")
    expect(wrong).not.toContain("✓")
  })
})

describe("Highlight Correct Summary", () => {
  it("requires a passage, five summaries and a correct index", () => {
    expect(parseHighlightCorrectSummary(JSON.stringify(HCS))).toEqual(HCS)
    expect(parseHighlightCorrectSummary(JSON.stringify({ ...HCS, summaries: ["a"] }))).toBeNull()
  })

  it("letters the options and ticks the correct one", () => {
    expect(highlightCorrectSummaryFeedbackStimulus(HCS)).toBe(
      "Passage:\nRenewable energy matters.\n\nSummary options:\n" +
        "A. Right. ✓\nB. Wrong 1.\nC. Wrong 2.\nD. Wrong 3.\nE. Wrong 4."
    )
  })

  it("words a correct, a wrong and a missing selection", () => {
    expect(highlightCorrectSummaryFeedbackResponse(HCS, 0)).toBe("Selected: A. Right. ✓ (correct)")
    expect(highlightCorrectSummaryFeedbackResponse(HCS, 1)).toBe(
      "Selected: B. Wrong 1. ✗ (incorrect — correct answer: A. Right.)"
    )
    expect(highlightCorrectSummaryFeedbackResponse(HCS, null)).toBe(
      "Selected: (no answer) ✗ (incorrect — correct answer: A. Right.)"
    )
  })
})

describe("spokenStimulusText", () => {
  it("speaks plain-text Stimuli unchanged", () => {
    expect(spokenStimulusText("write_from_dictation", "Hello there.")).toBe("Hello there.")
  })

  it("speaks the passage of a structured Stimulus", () => {
    expect(spokenStimulusText("fill_in_the_blanks_listening", JSON.stringify(FIB))).toBe(
      "Scientists collect data, which helps them refine theories."
    )
    expect(spokenStimulusText("highlight_correct_summary", JSON.stringify(HCS))).toBe(
      "Renewable energy matters."
    )
  })

  it("rejects a structured Stimulus with the wrong shape", () => {
    expect(() => spokenStimulusText("highlight_correct_summary", "plain text")).toThrow(
      "Invalid stimulus format"
    )
  })
})

describe("review regressions", () => {
  it("never marks an unanswered Multiple Choice as correct", () => {
    const firstIsCorrect = { ...MCQ, correct: 0 }
    const response = multipleChoiceFeedbackResponse(firstIsCorrect, null)
    expect(response).toContain("(no answer) ✗")
    expect(response).not.toContain("✓")
  })
})
