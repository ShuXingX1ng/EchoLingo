"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { TaskFeedback } from "@/types"

// PTE: 10 minutes; we use 600s
const TIME_LIMIT = 600

type Phase = "idle" | "generating" | "writing" | "processing" | "done" | "error"

export default function SummarizeWrittenTextPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [passage, setPassage] = useState("")
  const [userText, setUserText] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
      const cached = getStimulusFromBank("summarize_written_text")
      if (cached) {
        text = cached
      } else {
        const res = await fetch("/api/pte/stimulus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskType: "summarize_written_text" }),
        })
        if (!res.ok) throw new Error("Failed to generate passage")
        text = ((await res.json()) as { text: string }).text
        addStimulusToBank("summarize_written_text", text)
      }
      setPassage(text)
      startedAtRef.current = new Date().toISOString()
      setPhase("writing")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setPhase("error")
    }
  }, [])

  const handleSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!userText.trim()) { setError("Please write your summary before submitting."); return }
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)

    let result: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "summarize_written_text", stimulus: passage, response: userText }),
      })
      if (res.ok) result = await res.json() as TaskFeedback
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "summarize_written_text",
        stimulus: { kind: "text", content: passage },
        response: { kind: "text", content: userText },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }

  useEffect(() => { submitRef.current = handleSubmit })

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">Practice</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Summarize Written Text</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">PTE Writing</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Summarize Written Text</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Read the passage, then write a one-sentence summary (5–75 words). 10 minutes.
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-slate-900 bg-[var(--surface)] p-8 dark:border-white/15 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">An AI-generated passage will appear. Write a one-sentence summary capturing the main idea.</p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              Generate Passage
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Generating passage…</p>
          </div>
        )}

        {phase === "writing" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Passage</p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                {timeStr}
              </span>
            </div>
            <div className="border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm leading-8 text-[var(--foreground)] font-serif">{passage}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your Summary</p>
                <span className={`text-xs tabular-nums ${wordCount > 75 ? "text-red-500" : wordCount >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                  {wordCount} / 5–75 words
                </span>
              </div>
              <textarea
                value={userText}
                onChange={e => setUserText(e.target.value)}
                placeholder="Write your one-sentence summary here…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-7 text-[var(--foreground)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={4}
              />
              <p className="mt-1 text-xs text-slate-400">Must be a single complete sentence.</p>
            </div>
            <div className="flex justify-end">
              <button onClick={handleSubmit} disabled={!userText.trim()}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">
                Submit
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Evaluating your summary…</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay feedback={feedback} stimulus={passage} stimulusLabel="Passage"
              responseText={userText} responseLabel="Your Summary" />
            <div className="flex gap-3 justify-center">
              <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                Try Another
              </button>
              <Link href="/practice" className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--foreground)]">
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
