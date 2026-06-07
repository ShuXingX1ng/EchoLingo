"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { PracticeTask, TaskFeedback } from "@/types"

const TIME_LIMIT = 1200 // 20 min
const MIN_WORDS = 200
const MAX_WORDS = 300

type Phase = "generating" | "writing" | "processing" | "done" | "error"

export default function MockWriteEssay({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [prompt, setPrompt] = useState("")
  const [userText, setUserText] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [error, setError] = useState("")

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const promptRef = useRef("")
  const userTextRef = useRef("")

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    if (phase !== "writing") return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); submitRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  const handleSubmit = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    const text = userTextRef.current.trim()
    const stim = promptRef.current
    if (!text) { setError("Please write your essay before submitting."); return }
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)

    let fb: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "write_essay", stimulus: stim, response: text }),
      })
      if (res.ok) fb = await res.json() as TaskFeedback
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "write_essay",
        stimulus: { kind: "text", content: stim },
        response: { kind: "text", content: text },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "write_essay",
        stimulus: { kind: "text", content: stim },
        response: { kind: "text", content: text },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [])  

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])
  useEffect(() => { userTextRef.current = userText }, [userText])

  // Auto-generate on mount
  useEffect(() => {
    const generate = async () => {
      try {
        let text: string
        const cached = getStimulusFromBank("write_essay")
        if (cached) {
          text = cached
        } else {
          const res = await fetch("/api/pte/stimulus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskType: "write_essay" }),
          })
          if (!res.ok) throw new Error("Failed to generate essay prompt")
          text = ((await res.json()) as { text: string }).text
          addStimulusToBank("write_essay", text)
        }
        promptRef.current = text
        setPrompt(text)
        startedAtRef.current = new Date().toISOString()
        setPhase("writing")
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
  const timeUrgent = seconds <= 120
  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length
  const wordStatus = wordCount < MIN_WORDS ? "below" : wordCount > MAX_WORDS ? "over" : "ok"

  const skipTask = () => {
    const emptyTask: PracticeTask = {
      id: `mock_${Date.now()}`,
      taskType: "write_essay",
      stimulus: { kind: "text", content: prompt },
      response: { kind: "text", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    }
    onComplete(emptyTask)
  }

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating essay question…</p>
        </div>
      )}

      {phase === "writing" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Essay Question</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
              {timeStr}
            </span>
          </div>
          <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <p className="text-sm leading-8 text-slate-800 dark:text-slate-100">{prompt}</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your Essay</p>
              <span className={`text-xs tabular-nums font-medium ${wordStatus === "over" ? "text-red-500" : wordStatus === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                {wordCount} words {wordStatus === "below" ? `(aim for ${MIN_WORDS}+)` : wordStatus === "over" ? `(max ${MAX_WORDS})` : "✓"}
              </span>
            </div>
            <textarea
              value={userText}
              onChange={e => setUserText(e.target.value)}
              placeholder={`Write your essay here. Aim for ${MIN_WORDS}–${MAX_WORDS} words with a clear introduction, body, and conclusion.`}
              className="w-full rounded-lg border border-slate-300 bg-white p-4 text-sm leading-7 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 resize-none"
              rows={14}
            />
          </div>
          <div className="flex justify-end">
            <button onClick={handleSubmit} disabled={!userText.trim()}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">
              Submit Essay
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your essay…</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">AI Feedback</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
            {(doneTask.feedback?.strengths.length ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">Strengths</p>
                <ul className="space-y-1">{doneTask.feedback!.strengths.map((s, i) => <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="text-emerald-500 shrink-0">+</span>{s}</li>)}</ul>
              </div>
            )}
            {(doneTask.feedback?.weaknesses.length ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">Areas to Improve</p>
                <ul className="space-y-1">{doneTask.feedback!.weaknesses.map((w, i) => <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="text-red-400 shrink-0">–</span>{w}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              Continue to Next Task →
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            Skip this task
          </button>
        </div>
      )}
    </div>
  )
}
