"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { PracticeTask, TaskFeedback } from "@/types"

const TIME_LIMIT = 420 // 7 min

type BlankDef = { options: string[]; correct: number }
type ParsedStimulus = { passage: string; blanks: BlankDef[] }
type Phase = "generating" | "ready" | "processing" | "done" | "error"

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
  const [phase, setPhase] = useState<Phase>("generating")
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [rawStimulus, setRawStimulus] = useState("")
  const [selections, setSelections] = useState<(string | null)[]>([])
  const [seconds, setSeconds] = useState(TIME_LIMIT)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [error, setError] = useState("")

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const parsedRef = useRef<ParsedStimulus | null>(null)
  const rawStimulusRef = useRef("")
  const selectionsRef = useRef<(string | null)[]>([])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    if (phase !== "ready") return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          clearInterval(timerRef.current!)
          submitRef.current()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  useEffect(() => { selectionsRef.current = selections }, [selections])

  const handleSubmit = useCallback(async () => {
    const currentParsed = parsedRef.current
    if (!currentParsed) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const startedAt = startedAtRef.current || endedAt
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    const responseForFeedback = buildResponseForFeedback(currentParsed, selectionsRef.current)
    const stimulusForFeedback = buildStimulusForFeedback(currentParsed)

    let fb: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "fill_in_the_blanks_reading",
          stimulus: stimulusForFeedback,
          response: responseForFeedback,
        }),
      })
      if (res.ok) fb = await res.json() as TaskFeedback
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "fill_in_the_blanks_reading",
        stimulus: { kind: "text", content: rawStimulusRef.current },
        response: { kind: "text", content: responseForFeedback },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "fill_in_the_blanks_reading",
        stimulus: { kind: "text", content: rawStimulusRef.current },
        response: { kind: "text", content: responseForFeedback },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  useEffect(() => {
    const generate = async () => {
      try {
        let raw: string
        const cached = getStimulusFromBank("fill_in_the_blanks_reading")
        if (cached) {
          raw = cached
        } else {
          const res = await fetch("/api/pte/stimulus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskType: "fill_in_the_blanks_reading" }),
          })
          if (!res.ok) throw new Error("Failed to generate stimulus")
          raw = ((await res.json()) as { text: string }).text
          addStimulusToBank("fill_in_the_blanks_reading", raw)
        }
        const nextParsed = parseStimulus(raw)
        if (!nextParsed) throw new Error("Invalid stimulus format")

        parsedRef.current = nextParsed
        rawStimulusRef.current = raw
        selectionsRef.current = new Array(nextParsed.blanks.length).fill(null)
        startedAtRef.current = new Date().toISOString()
        setParsed(nextParsed)
        setRawStimulus(raw)
        setSelections(selectionsRef.current)
        setPhase("ready")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed")
        setPhase("error")
      }
    }
    generate()
  }, [])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const allAnswered = parsed ? selections.every(Boolean) : false
  const segments = parsed ? splitPassage(parsed.passage) : []

  const skipTask = () => {
    onComplete({
      id: `mock_${Date.now()}`,
      taskType: "fill_in_the_blanks_reading",
      stimulus: { kind: "text", content: rawStimulus },
      response: { kind: "text", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating passage...</p>
        </div>
      )}

      {phase === "ready" && parsed && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select the correct words</p>
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
                  <option value="">choose</option>
                  {blank.options.map((option, optionIndex) => <option key={optionIndex} value={option}>{option}</option>)}
                </select>
              )
            })}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">{selections.filter(Boolean).length} / {parsed.blanks.length} answered</p>
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              Submit Answers
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your answers...</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">AI Feedback</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              Continue to Next Task
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300">
            Skip this task
          </button>
        </div>
      )}
    </div>
  )
}
