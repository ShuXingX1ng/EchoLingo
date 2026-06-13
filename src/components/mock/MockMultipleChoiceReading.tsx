"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost } from "@/lib/api-client"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { PracticeTask, TaskFeedback } from "@/types"

const TIME_LIMIT = 240 // 4 min

type ParsedStimulus = {
  passage: string
  question: string
  options: string[]
  correct: number
}
type Phase = "generating" | "ready" | "processing" | "done" | "error"

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as { passage?: unknown; question?: unknown; options?: unknown; correct?: unknown }
    if (
      typeof parsed.passage !== "string" ||
      typeof parsed.question !== "string" ||
      !Array.isArray(parsed.options) ||
      parsed.options.length !== 5 ||
      typeof parsed.correct !== "number"
    ) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function buildStimulusForFeedback(p: ParsedStimulus): string {
  const opts = p.options.map((o, i) => `${o}${i === p.correct ? " ✓" : ""}`).join("\n")
  return `Passage:\n${p.passage}\n\nQuestion: ${p.question}\n\nOptions:\n${opts}`
}

function buildResponseForFeedback(p: ParsedStimulus, selected: number): string {
  const selectedText = p.options[selected]
  const correctText = p.options[p.correct]
  if (selected === p.correct) return `Selected: ${selectedText} ✓ (correct)`
  return `Selected: ${selectedText} ✗ (incorrect — correct answer: ${correctText})`
}

export default function MockMultipleChoiceReading({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [rawStimulus, setRawStimulus] = useState("")
  const [selected, setSelected] = useState<number | null>(null)
  const [seconds, setSeconds] = useState(TIME_LIMIT)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [error, setError] = useState("")

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const parsedRef = useRef<ParsedStimulus | null>(null)
  const selectedRef = useRef<number | null>(null)
  const rawStimulusRef = useRef("")

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

  useEffect(() => { selectedRef.current = selected }, [selected])

  const handleSubmit = useCallback(async () => {
    const currentParsed = parsedRef.current
    if (!currentParsed) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const startedAt = startedAtRef.current || endedAt
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)

    // If timer expired with no selection, default to first option
    const finalSelected = selectedRef.current ?? 0
    const stimulusForFeedback = buildStimulusForFeedback(currentParsed)
    const responseForFeedback = buildResponseForFeedback(currentParsed, finalSelected)

    let fb: TaskFeedback | null = null
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", {
        taskType: "multiple_choice_reading",
        stimulus: stimulusForFeedback,
        response: responseForFeedback,
      })
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "multiple_choice_reading",
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
        taskType: "multiple_choice_reading",
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
        const cached = getStimulusFromBank("multiple_choice_reading")
        if (cached) {
          raw = cached
        } else {
          const res = await fetch("/api/pte/stimulus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskType: "multiple_choice_reading" }),
          })
          if (!res.ok) throw new Error("Failed to generate stimulus")
          raw = ((await res.json()) as { text: string }).text
          addStimulusToBank("multiple_choice_reading", raw)
        }
        const nextParsed = parseStimulus(raw)
        if (!nextParsed) throw new Error("Invalid stimulus format")

        parsedRef.current = nextParsed
        rawStimulusRef.current = raw
        startedAtRef.current = new Date().toISOString()
        setParsed(nextParsed)
        setRawStimulus(raw)
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

  const skipTask = () => {
    onComplete({
      id: `mock_${Date.now()}`,
      taskType: "multiple_choice_reading",
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
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating question...</p>
        </div>
      )}

      {phase === "ready" && parsed && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Passage</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>{timeStr}</span>
          </div>
          <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <p className="text-sm leading-8 text-slate-800 dark:text-slate-100">{parsed.passage}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 space-y-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-7">{parsed.question}</p>
            <div className="space-y-2">
              {parsed.options.map((opt, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-all ${
                    selected === i
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600"
                      : "border-slate-200 bg-white hover:border-slate-400 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="mc-option"
                    value={i}
                    checked={selected === i}
                    onChange={() => setSelected(i)}
                    className="mt-0.5 shrink-0 accent-emerald-600"
                  />
                  <span className="text-sm text-slate-800 dark:text-slate-100">{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={selected === null}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              Submit Answer
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your answer...</p>
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
