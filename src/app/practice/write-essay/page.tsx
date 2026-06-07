"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { TaskFeedback } from "@/types"

// PTE: 20 minutes; 1200s
const TIME_LIMIT = 1200
const MIN_WORDS = 200
const MAX_WORDS = 300

type Phase = "idle" | "generating" | "writing" | "processing" | "done" | "error"

export default function WriteEssayPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [prompt, setPrompt] = useState("")
  const [userText, setUserText] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Ref holds latest submit fn so timer closure stays fresh
  const submitRef = useRef<() => void>(() => {})

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

  const generate = useCallback(async () => {
    setPhase("generating")
    setError(""); setFeedback(null); setUserText(""); setSeconds(TIME_LIMIT)
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
        if (!res.ok) throw new Error("Failed to generate prompt")
        text = ((await res.json()) as { text: string }).text
        addStimulusToBank("write_essay", text)
      }
      setPrompt(text)
      startedAtRef.current = new Date().toISOString()
      setPhase("writing")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setPhase("error")
    }
  }, [])

  const handleSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!userText.trim()) { setError("Please write your essay before submitting."); return }
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)

    let result: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "write_essay", stimulus: prompt, response: userText }),
      })
      if (res.ok) result = await res.json() as TaskFeedback
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "write_essay",
        stimulus: { kind: "text", content: prompt },
        response: { kind: "text", content: userText },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }

  // Keep ref current so the timer closure always calls the latest version
  useEffect(() => { submitRef.current = handleSubmit })

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 120
  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length
  const wordStatus = wordCount < MIN_WORDS ? "below" : wordCount > MAX_WORDS ? "over" : "ok"

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/practice" className="hover:text-slate-700 dark:hover:text-slate-200">Practice</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">Write Essay</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">PTE Writing</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Write Essay</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Write a {MIN_WORDS}–{MAX_WORDS} word essay in response to the prompt. 20 minutes.
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-8">
              An AI-generated essay question will appear. Write a structured {MIN_WORDS}–{MAX_WORDS} word response.
            </p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              Get Essay Question
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Generating essay question…</p>
          </div>
        )}

        {phase === "writing" && (
          <div className="space-y-5">
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
                placeholder={`Write your essay here. Aim for ${MIN_WORDS}–${MAX_WORDS} words with a clear structure: introduction, body paragraphs, conclusion.`}
                className="w-full rounded-lg border border-slate-300 bg-white p-4 text-sm leading-7 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 resize-none"
                rows={16}
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

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay feedback={feedback} stimulus={prompt} stimulusLabel="Essay Question"
              responseText={userText} responseLabel="Your Essay" />
            <div className="flex gap-3 justify-center">
              <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                Try Another
              </button>
              <Link href="/practice" className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:border-slate-900 dark:border-white/20 dark:text-slate-300">
                Back to Practice
              </Link>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">Try Again</button>
          </div>
        )}
      </main>
    </div>
  )
}
