import type { PracticeItem, SpeechEvaluationResult, WordEvidence } from "@/types"

/** Something heard between a word and the next: a pause or an inserted word. */
export type BetweenWords =
  | { kind: "pause"; seconds: number; atSentenceBoundary: boolean }
  | { kind: "inserted"; heard: string }

/** One entry of the result's `words`, with what the evaluator found at it. */
export type AnnotatedWord = {
  index: number
  word: string
  score: number | null
  status: WordEvidence["status"]
  /** Seconds the word was drawn out for, if it was. */
  slowSec: number | null
  /** What was heard when the word was said again, if it was. */
  repeatedAs: string | null
  /** What came after this word, in order. */
  after: BetweenWords[]
}

const seconds = (start: number, end: number) => Math.round((end - start) * 10) / 10

/**
 * The words of a result in reading order, each carrying the fluency events
 * and reading errors that point at it (FastAPI `fluencyEvents` and
 * `readingErrors`; an omitted word already has that status).
 */
export function annotatedWords(evaluation: SpeechEvaluationResult): AnnotatedWord[] {
  const words: AnnotatedWord[] = evaluation.words.map((word, index) => ({
    index,
    word: word.word,
    score: word.score ?? null,
    status: word.status,
    slowSec: null,
    repeatedAs: null,
    after: [],
  }))
  const at = (index: number) => (index >= 0 && index < words.length ? words[index] : undefined)
  for (const error of evaluation.readingErrors ?? []) {
    const word = at(error.wordIndex)
    if (!word) continue
    if (error.kind === "inserted") word.after.push({ kind: "inserted", heard: error.heard ?? "" })
    if (error.kind === "repeated") word.repeatedAs = error.heard ?? word.word
  }
  for (const event of evaluation.fluencyEvents ?? []) {
    const word = at(event.wordIndex)
    if (!word) continue
    if (event.kind === "slow_word") word.slowSec = seconds(event.startSec, event.endSec)
    else word.after.push({
      kind: "pause",
      seconds: seconds(event.startSec, event.endSec),
      atSentenceBoundary: event.atSentenceBoundary,
    })
  }
  return words
}

/** An i18n key and its parameters. */
export type Message = { key: string; params?: Record<string, string | number> }

/** What to say about a word when it is selected; empty for a correct word. */
export function wordIssues(word: AnnotatedWord): Message[] {
  const issues: Message[] = []
  if (word.status !== "correct") issues.push({ key: `speechEvaluation.wordStatus.${word.status}` })
  if (word.repeatedAs !== null) {
    issues.push({ key: "speechEvaluation.issue.repeated", params: { heard: word.repeatedAs } })
  }
  if (word.slowSec !== null) {
    issues.push({ key: "speechEvaluation.issue.slowWord", params: { seconds: word.slowSec } })
  }
  for (const next of word.after) {
    issues.push(next.kind === "pause"
      ? {
          key: next.atSentenceBoundary
            ? "speechEvaluation.issue.pauseBetweenSentences"
            : "speechEvaluation.issue.pause",
          params: { seconds: next.seconds },
        }
      : { key: "speechEvaluation.issue.insertedAfter", params: { heard: next.heard } })
  }
  return issues
}

/** Whether a word has anything to show when selected (a score or an issue). */
export function isSelectable(word: AnnotatedWord): boolean {
  return word.score !== null || wordIssues(word).length > 0
}

/** A practice item as text: its words, and how many there are when not all are named. */
export function practiceItemText(item: PracticeItem): Message {
  return {
    key: `speechEvaluation.practice.${item.kind}${item.count > item.words.length ? "More" : ""}`,
    params: { words: item.words.map((word) => `“${word}”`).join(", "), count: item.count },
  }
}
