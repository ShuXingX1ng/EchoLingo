"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { usePracticeTaskRunner } from "@/hooks/usePracticeTaskRunner"
import { useTranslation } from "@/lib/i18n"
import type { PracticeTask } from "@/types"

const TIME_LIMIT = 420 // 7 min

type BlankDef = { options: string[]; correct: number }
type ParsedStimulus = { passage: string; blanks: BlankDef[] }

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as { passage?: unknown; blanks?: unknown }
    if (typeof parsed.passage !== "string" || !Array.isArray(parsed.blanks)) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function splitPassage(passage: string): Array<{ type: "text" | "blank"; value: string }> {
  return passage.split(/(\[BLANK_\d+\])/).map((part) => {
    const match = part.match(/^\[BLANK_(\d+)\]$/)
    return match ? { type: "blank", value: match[1] } : { type: "text", value: part }
  })
}

function buildStimulusForFeedback(parsed: ParsedStimulus): string {
  let passage = parsed.passage
  parsed.blanks.forEach((blank, i) => {
    passage = passage.replace(`[BLANK_${i}]`, `[${blank.options[blank.correct]}]`)
  })
  const answers = parsed.blanks.map((blank, i) => `Blank ${i + 1}: "${blank.options[blank.correct]}"`).join(", ")
  return `Passage (with correct answers):\n${passage}\n\nCorrect answers: ${answers}`
}

function buildResponseForFeedback(parsed: ParsedStimulus, selections: (string | null)[]): string {
  return parsed.blanks
    .map((blank, i) => {
      const selected = selections[i] ?? "(no answer)"
      const correct = blank.options[blank.correct]
      const isCorrect = selected === correct
      return `Blank ${i + 1}: selected "${selected}" (correct: "${correct}") ${isCorrect ? "correct" : "incorrect"}`
    })
    .join("\n")
}

export default function MockFillInTheBlanksReading({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const { phase, stimulus, savedTask, error, submit } = usePracticeTaskRunner({
    taskType: "fill_in_the_blanks_reading",
    responseKind: "text",
  })

  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [selections, setSelections] = useState<(string | null)[]>([])
  const [seconds, setSeconds] = useState(TIME_LIMIT)

  const parsedRef = useRef<ParsedStimulus | null>(null)
  const selectionsRef = useRef<(string | null)[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { parsedRef.current = parsed }, [parsed])
  useEffect(() => { selectionsRef.current = selections }, [selections])
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // Parse JSON stimulus when hook loads it
  useEffect(() => {
    if (!stimulus) return
    const p = parseStimulus(stimulus)
    if (!p) return
    setParsed(p)
    setSelections(new Array(p.blanks.length).fill(null))
    setSeconds(TIME_LIMIT)
  }, [stimulus])

  const handleSubmit = useCallback(async () => {
    const p = parsedRef.current
    if (!p) return
    if (timerRef.current) clearInterval(timerRef.current)
    await submit({
      feedbackStimulus: buildStimulusForFeedback(p),
      feedbackResponse: buildResponseForFeedback(p, selectionsRef.current),
    })
  }, [submit])

  // Timer while the user is answering
  useEffect(() => {
    if (phase !== "writing") return
    timerRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); handleSubmit(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase, handleSubmit])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const allAnswered = parsed ? selections.every(Boolean) : false
  const segments = parsed ? splitPassage(parsed.passage) : []

  const skipTask = (): void => {
    onComplete({
      id: `mock_${Date.now()}`,
      taskType: "fill_in_the_blanks_reading",
      stimulus: { kind: "text", content: stimulus },
      response: { kind: "text", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      {(phase === "idle" || phase === "generating") && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.common.generatingPassage")}</p>
        </div>
      )}

      {phase === "writing" && parsed && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("mock.common.selectCorrectWords")}</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>{timeStr}</span>
          </div>
          <div className="border border-slate-200 bg-white p-6 text-sm leading-9 text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
            {segments.map((seg, i) => {
              if (seg.type === "text") return <span key={i}>{seg.value}</span>
              const blankIndex = Number.parseInt(seg.value, 10)
              const blank = parsed.blanks[blankIndex]
              return (
                <select
                  key={i}
                  value={selections[blankIndex] ?? ""}
                  onChange={e => {
                    const next = [...selections]
                    next[blankIndex] = e.target.value || null
                    setSelections(next)
                  }}
                  className="mx-1 inline-block rounded border border-emerald-400 bg-white px-2 py-0.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">{t("mock.common.choose")}</option>
                  {blank.options.map((option, optionIndex) => <option key={optionIndex} value={option}>{option}</option>)}
                </select>
              )
            })}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">{t("mock.common.answered", { n: selections.filter(Boolean).length, total: parsed.blanks.length })}</p>
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              {t("mock.common.submitAnswers")}
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.common.evaluating")}</p>
        </div>
      )}

      {phase === "done" && savedTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t("mock.common.aiFeedback")}</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{savedTask.feedback?.summary}</p>
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(savedTask)} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              {t("mock.common.continueNext")}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300">
            {t("mock.common.skipTask")}
          </button>
        </div>
      )}
    </div>
  )
}
