import type { PteTaskType } from "@/types"

// Structured (JSON) Stimuli: parsing what the backend generates, and wording
// the Stimulus and the learner's selections for the feedback request.
//
// The backend scores the three reading Task Types deterministically by reading
// these exact strings (`_compute_reading_feedback` in
// backend/services/feedback_graph.py): it counts "✓" / "✗" per line for Fill
// in the Blanks, looks for "✓" for Multiple Choice, and matches
// "N of M paragraphs in the correct position" for Re-order Paragraphs. Change
// the wording here and there together.

const CORRECT = "✓"
const INCORRECT = "✗"

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ── Fill in the Blanks (Reading and Listening) ───────────────────────────────

export type BlankDef = { options: string[]; correct: number }
export type FillInTheBlanksStimulus = { passage: string; blanks: BlankDef[] }
export type PassageSegment = { type: "text" | "blank"; value: string }

export function parseFillInTheBlanks(raw: string): FillInTheBlanksStimulus | null {
  const parsed = parseJson(raw)
  if (!parsed || typeof parsed.passage !== "string" || !Array.isArray(parsed.blanks)) return null
  return parsed as FillInTheBlanksStimulus
}

/** Alternating text and blank segments; a blank's `value` is its index. */
export function splitPassage(passage: string): PassageSegment[] {
  return passage.split(/(\[BLANK_\d+\])/).map((part) => {
    const match = part.match(/^\[BLANK_(\d+)\]$/)
    return match ? { type: "blank", value: match[1] } : { type: "text", value: part }
  })
}

function fillBlanks(stimulus: FillInTheBlanksStimulus, wrap: (answer: string) => string): string {
  let passage = stimulus.passage
  stimulus.blanks.forEach((blank, i) => {
    passage = passage.replace(`[BLANK_${i}]`, wrap(blank.options[blank.correct]))
  })
  return passage
}

/** The passage as it is read out: every blank replaced by its correct word. */
export function fillInTheBlanksSpokenText(stimulus: FillInTheBlanksStimulus): string {
  return fillBlanks(stimulus, (answer) => answer)
}

export function fillInTheBlanksFeedbackStimulus(stimulus: FillInTheBlanksStimulus): string {
  const passage = fillBlanks(stimulus, (answer) => `[${answer}]`)
  const answers = stimulus.blanks
    .map((blank, i) => `Blank ${i + 1}: "${blank.options[blank.correct]}"`)
    .join(", ")
  return `Passage (with correct answers):\n${passage}\n\nCorrect answers: ${answers}`
}

export function fillInTheBlanksFeedbackResponse(
  stimulus: FillInTheBlanksStimulus,
  selections: (string | null)[],
): string {
  return stimulus.blanks
    .map((blank, i) => {
      const selected = selections[i] ?? "(no answer)"
      const correct = blank.options[blank.correct]
      const mark = selected === correct ? CORRECT : INCORRECT
      return `Blank ${i + 1}: selected "${selected}" (correct: "${correct}") ${mark}`
    })
    .join("\n")
}

// ── Re-order Paragraphs ──────────────────────────────────────────────────────

export type Paragraph = { label: string; text: string }
export type ReOrderParagraphsStimulus = { paragraphs: Paragraph[] }

/** `paragraphs` arrive in the correct order; the page shuffles them. */
export function parseReOrderParagraphs(raw: string): ReOrderParagraphsStimulus | null {
  const parsed = parseJson(raw)
  if (!parsed || !Array.isArray(parsed.paragraphs) || parsed.paragraphs.length < 2) return null
  return parsed as ReOrderParagraphsStimulus
}

export function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function reOrderParagraphsFeedbackStimulus(correctOrder: Paragraph[]): string {
  return (
    "Paragraphs in correct order:\n" +
    correctOrder.map((p) => `[${p.label}] ${p.text}`).join("\n\n")
  )
}

export function reOrderParagraphsFeedbackResponse(
  userOrder: Paragraph[],
  correctOrder: Paragraph[],
): string {
  const userLabels = userOrder.map((p) => p.label).join(" → ")
  const correctLabels = correctOrder.map((p) => p.label).join(" → ")
  const correctCount = userOrder.filter((p, i) => p.label === correctOrder[i].label).length
  return (
    `Submitted order: ${userLabels}\n` +
    `Correct order:   ${correctLabels}\n` +
    `${correctCount} of ${correctOrder.length} paragraphs in the correct position.`
  )
}

// ── Multiple Choice (Reading) ────────────────────────────────────────────────

export type MultipleChoiceStimulus = {
  passage: string
  question: string
  options: string[]
  correct: number
}

export function parseMultipleChoice(raw: string): MultipleChoiceStimulus | null {
  const parsed = parseJson(raw)
  if (
    !parsed ||
    typeof parsed.passage !== "string" ||
    typeof parsed.question !== "string" ||
    !Array.isArray(parsed.options) ||
    parsed.options.length !== 5 ||
    typeof parsed.correct !== "number"
  ) return null
  return parsed as MultipleChoiceStimulus
}

export function multipleChoiceFeedbackStimulus(stimulus: MultipleChoiceStimulus): string {
  const options = stimulus.options
    .map((option, i) => `${option}${i === stimulus.correct ? ` ${CORRECT}` : ""}`)
    .join("\n")
  return `Passage:\n${stimulus.passage}\n\nQuestion: ${stimulus.question}\n\nOptions:\n${options}`
}

/** `selected` is null when the time ran out before the learner chose. */
export function multipleChoiceFeedbackResponse(
  stimulus: MultipleChoiceStimulus,
  selected: number | null,
): string {
  const correctText = stimulus.options[stimulus.correct]
  if (selected === null) {
    return `Selected: (no answer) ${INCORRECT} (incorrect — correct answer: ${correctText})`
  }
  const selectedText = stimulus.options[selected]
  if (selected === stimulus.correct) return `Selected: ${selectedText} ${CORRECT} (correct)`
  return `Selected: ${selectedText} ${INCORRECT} (incorrect — correct answer: ${correctText})`
}

// ── Highlight Correct Summary ────────────────────────────────────────────────

export type HighlightCorrectSummaryStimulus = {
  passage: string
  summaries: string[]
  correct: number
}

export function parseHighlightCorrectSummary(raw: string): HighlightCorrectSummaryStimulus | null {
  const parsed = parseJson(raw)
  if (
    !parsed ||
    typeof parsed.passage !== "string" ||
    !Array.isArray(parsed.summaries) ||
    parsed.summaries.length !== 5 ||
    typeof parsed.correct !== "number"
  ) return null
  return parsed as HighlightCorrectSummaryStimulus
}

const optionLetter = (index: number) => String.fromCharCode(65 + index)

export function highlightCorrectSummaryFeedbackStimulus(
  stimulus: HighlightCorrectSummaryStimulus,
): string {
  const options = stimulus.summaries
    .map((summary, i) => `${optionLetter(i)}. ${summary}${i === stimulus.correct ? ` ${CORRECT}` : ""}`)
    .join("\n")
  return `Passage:\n${stimulus.passage}\n\nSummary options:\n${options}`
}

/** `selected` is null when the time ran out before the learner chose. */
export function highlightCorrectSummaryFeedbackResponse(
  stimulus: HighlightCorrectSummaryStimulus,
  selected: number | null,
): string {
  const correct = `${optionLetter(stimulus.correct)}. ${stimulus.summaries[stimulus.correct]}`
  if (selected === null) {
    return `Selected: (no answer) ${INCORRECT} (incorrect — correct answer: ${correct})`
  }
  const chosen = `${optionLetter(selected)}. ${stimulus.summaries[selected]}`
  if (selected === stimulus.correct) return `Selected: ${chosen} ${CORRECT} (correct)`
  return `Selected: ${chosen} ${INCORRECT} (incorrect — correct answer: ${correct})`
}

// ── Every structured Task Type ───────────────────────────────────────────────

/** Whether `raw` has the shape this Task Type's screens can render. Plain-text Task Types always pass. */
export function isValidStructuredStimulus(taskType: PteTaskType, raw: string): boolean {
  switch (taskType) {
    case "fill_in_the_blanks_reading":
    case "fill_in_the_blanks_listening":
      return parseFillInTheBlanks(raw) !== null
    case "re_order_paragraphs":
      return parseReOrderParagraphs(raw) !== null
    case "multiple_choice_reading":
      return parseMultipleChoice(raw) !== null
    case "highlight_correct_summary":
      return parseHighlightCorrectSummary(raw) !== null
    default:
      return true
  }
}

// ── Spoken Stimuli ───────────────────────────────────────────────────────────

/**
 * The text to read out for a Task Type whose Stimulus is played as audio.
 * Plain-text Stimuli are spoken as they are; structured ones speak their
 * passage. Throws when a structured Stimulus does not have the expected shape.
 */
export function spokenStimulusText(taskType: PteTaskType, raw: string): string {
  if (taskType === "fill_in_the_blanks_listening") {
    const stimulus = parseFillInTheBlanks(raw)
    if (!stimulus) throw new Error("Invalid stimulus format from server")
    return fillInTheBlanksSpokenText(stimulus)
  }
  if (taskType === "highlight_correct_summary") {
    const stimulus = parseHighlightCorrectSummary(raw)
    if (!stimulus) throw new Error("Invalid stimulus format from server")
    return stimulus.passage
  }
  return raw
}
