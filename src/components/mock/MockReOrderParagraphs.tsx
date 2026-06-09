"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { PracticeTask, TaskFeedback } from "@/types"

const TIME_LIMIT = 180 // 3 min

type Paragraph = { label: string; text: string }
type ParsedStimulus = { paragraphs: Paragraph[] }
type Phase = "generating" | "ready" | "processing" | "done" | "error"

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as { paragraphs?: unknown }
    if (!Array.isArray(parsed.paragraphs) || parsed.paragraphs.length < 2) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildStimulusForFeedback(correctOrder: Paragraph[]): string {
  return "Paragraphs in correct order:\n" + correctOrder.map((p) => `[${p.label}] ${p.text}`).join("\n\n")
}

function buildResponseForFeedback(userOrder: Paragraph[], correctOrder: Paragraph[]): string {
  const userLabels = userOrder.map((p) => p.label).join(" → ")
  const correctLabels = correctOrder.map((p) => p.label).join(" → ")
  const correctCount = userOrder.filter((p, i) => p.label === correctOrder[i].label).length
  return (
    `Submitted order: ${userLabels}\n` +
    `Correct order:   ${correctLabels}\n` +
    `${correctCount} of ${correctOrder.length} paragraphs in the correct position.`
  )
}

export default function MockReOrderParagraphs({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [correctOrder, setCorrectOrder] = useState<Paragraph[]>([])
  const [displayOrder, setDisplayOrder] = useState<Paragraph[]>([])
  const [rawStimulus, setRawStimulus] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [error, setError] = useState("")

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const correctOrderRef = useRef<Paragraph[]>([])
  const displayOrderRef = useRef<Paragraph[]>([])
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

  useEffect(() => { correctOrderRef.current = correctOrder }, [correctOrder])
  useEffect(() => { displayOrderRef.current = displayOrder }, [displayOrder])

  const handleSubmit = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const startedAt = startedAtRef.current || endedAt
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    const stimulusForFeedback = buildStimulusForFeedback(correctOrderRef.current)
    const responseForFeedback = buildResponseForFeedback(displayOrderRef.current, correctOrderRef.current)

    let fb: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "re_order_paragraphs",
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
        taskType: "re_order_paragraphs",
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
        taskType: "re_order_paragraphs",
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
        const cached = getStimulusFromBank("re_order_paragraphs")
        if (cached) {
          raw = cached
        } else {
          const res = await fetch("/api/pte/stimulus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskType: "re_order_paragraphs" }),
          })
          if (!res.ok) throw new Error("Failed to generate stimulus")
          raw = ((await res.json()) as { text: string }).text
          addStimulusToBank("re_order_paragraphs", raw)
        }
        const nextParsed = parseStimulus(raw)
        if (!nextParsed) throw new Error("Invalid stimulus format")

        const shuffled = shuffleArray(nextParsed.paragraphs)
        correctOrderRef.current = nextParsed.paragraphs
        displayOrderRef.current = shuffled
        rawStimulusRef.current = raw
        startedAtRef.current = new Date().toISOString()
        setCorrectOrder(nextParsed.paragraphs)
        setDisplayOrder(shuffled)
        setRawStimulus(raw)
        setPhase("ready")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed")
        setPhase("error")
      }
    }
    generate()
  }, [])

  const moveUp = (idx: number) => {
    if (idx === 0) return
    const next = [...displayOrder]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setDisplayOrder(next)
  }

  const moveDown = (idx: number) => {
    if (idx === displayOrder.length - 1) return
    const next = [...displayOrder]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setDisplayOrder(next)
  }

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    const next = [...displayOrder]
    const [removed] = next.splice(dragIdx, 1)
    next.splice(targetIdx, 0, removed)
    setDisplayOrder(next)
    setDragIdx(null)
    setDragOverIdx(null)
  }

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 30

  const skipTask = () => {
    onComplete({
      id: `mock_${Date.now()}`,
      taskType: "re_order_paragraphs",
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
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating paragraphs...</p>
        </div>
      )}

      {phase === "ready" && displayOrder.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Drag to reorder</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>{timeStr}</span>
          </div>
          <div className="space-y-3">
            {displayOrder.map((para, idx) => (
              <div
                key={para.label}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(idx) }}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                className={`group flex items-start gap-3 border bg-white p-4 cursor-grab active:cursor-grabbing transition-all dark:bg-slate-900 ${
                  dragOverIdx === idx && dragIdx !== idx
                    ? "border-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.3)]"
                    : "border-slate-200 dark:border-white/10"
                } ${dragIdx === idx ? "opacity-50" : ""}`}
              >
                <span className="mt-0.5 shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-400">
                  {idx + 1}
                </span>
                <p className="flex-1 text-sm leading-7 text-slate-800 dark:text-slate-100">{para.text}</p>
                <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    aria-label="Move up"
                    className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 dark:hover:text-slate-200"
                  >↑</button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === displayOrder.length - 1}
                    aria-label="Move down"
                    className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 dark:hover:text-slate-200"
                  >↓</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Submit Order
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your order...</p>
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
