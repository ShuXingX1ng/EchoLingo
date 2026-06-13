"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import type { TaskFeedback } from "@/types"

const TIME_LIMIT = 600 // 10 minutes to write summary

type Phase = "idle" | "generating" | "ready" | "listening" | "writing" | "processing" | "done" | "error"

export default function SummarizeSpokenTextPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [passageText, setPassageText] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [summary, setSummary] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)
  const [played, setPlayed] = useState(false)

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
    setError(""); setFeedback(null); setSummary(""); setPlayed(false); setSeconds(TIME_LIMIT)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      let text: string
      const cached = getStimulusFromBank("summarize_spoken_text")
      if (cached) {
        text = cached
      } else {
        const stimData = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType: "summarize_spoken_text" })
        text = stimData.text
        addStimulusToBank("summarize_spoken_text", text)
      }
      setPassageText(text)

      const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.85 })
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate passage")
      setPhase("error")
    }
  }, [audioUrl])

  const playPassage = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    audio.onended = () => {
      setPlayed(true)
      setPhase("writing")
      startedAtRef.current = new Date().toISOString()
      setSeconds(TIME_LIMIT)
    }

    setPhase("listening")
    audio.play().catch(() => {
      setPhase("ready")
      audioRef.current = null
    })
  }, [audioUrl])

  const handleSubmit = useCallback(async () => {
    if (!summary.trim()) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000,
    )

    let result: TaskFeedback | null = null
    try {
      result = await apiPost<TaskFeedback>("/api/pte/feedback", {
        taskType: "summarize_spoken_text",
        stimulus: passageText,
        response: summary.trim(),
      })
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? {
      summary: "Feedback unavailable.",
      strengths: [],
      weaknesses: [],
      suggestions: [],
    }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "summarize_spoken_text",
        stimulus: { kind: "audio", content: passageText },
        response: { kind: "text", content: summary.trim() },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [passageText, summary])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  const wordCount = summary.trim() ? summary.trim().split(/\s+/).length : 0
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">Practice</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Summarize Spoken Text</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            PTE Listening
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Summarize Spoken Text</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Listen to a short academic passage, then write a 50–70 word summary. You have 10 minutes to write.
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              An AI-generated academic passage will be synthesized as audio. Listen carefully, then write a concise 50–70 word summary.
            </p>
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Generate Passage
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">Generating passage audio…</p>
            <p className="text-xs text-[var(--text-muted)]">Writing passage text and synthesizing speech</p>
          </div>
        )}

        {phase === "ready" && audioUrl && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              Passage ready — listen carefully
            </p>
            <button
              onClick={playPassage}
              className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 mb-4"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play Passage
            </button>
            <p className="text-xs text-[var(--text-muted)]">
              After the passage ends, you will have 10 minutes to write your summary.
            </p>
          </div>
        )}

        {phase === "listening" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-center gap-2 mb-4">
              {[0, 1, 2, 3, 4].map(i => (
                <span
                  key={i}
                  className="inline-block w-1 rounded-full bg-emerald-500"
                  style={{
                    height: `${16 + (i % 3) * 8}px`,
                    animation: `pulse 0.8s ease-in-out ${i * 0.12}s infinite alternate`,
                  }}
                />
              ))}
            </div>
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">Passage playing…</p>
            <p className="text-xs text-[var(--text-muted)]">Listen carefully. The writing timer starts when the passage ends.</p>
            <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
          </div>
        )}

        {phase === "writing" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Write your summary</p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                {timeStr}
              </span>
            </div>
            <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs text-slate-400 mb-2">Write a 50–70 word summary of the passage you heard.</p>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="Write your summary here…"
                rows={6}
                className="w-full resize-none rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--foreground)] placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs tabular-nums ${wordCount < 50 || wordCount > 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {wordCount} words {wordCount < 50 ? `(min 50)` : wordCount > 70 ? `(max 70)` : "✓"}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!summary.trim()}
                  className="rounded-xl bg-slate-950 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
                >
                  Submit Summary
                </button>
              </div>
            </div>
            {played && (
              <button
                onClick={playPassage}
                className="text-xs text-slate-400 hover:text-[var(--foreground)] underline"
              >
                Replay passage
              </button>
            )}
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
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulusLabel="Passage (from audio)"
              responseText={summary.trim()}
              responseLabel="Your Summary"
            />
            <div className="flex gap-3 justify-center">
              <button
                onClick={generate}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                New Passage
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
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
