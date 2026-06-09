"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { TaskFeedback } from "@/types"

const TIME_LIMIT = 300 // 5 minutes

type ParsedStimulus = {
  passage: string
  summaries: string[]
  correct: number
}
type Phase = "idle" | "generating" | "ready" | "listening" | "selecting" | "processing" | "done" | "error"

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as {
      passage?: unknown; summaries?: unknown; correct?: unknown
    }
    if (
      typeof parsed.passage !== "string" ||
      !Array.isArray(parsed.summaries) ||
      parsed.summaries.length !== 5 ||
      typeof parsed.correct !== "number"
    ) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function buildStimulusForFeedback(p: ParsedStimulus): string {
  const opts = p.summaries.map((s, i) => `${String.fromCharCode(65 + i)}. ${s}${i === p.correct ? " ✓" : ""}`).join("\n")
  return `Passage:\n${p.passage}\n\nSummary options:\n${opts}`
}

function buildResponseForFeedback(p: ParsedStimulus, selected: number): string {
  const letter = String.fromCharCode(65 + selected)
  const correctLetter = String.fromCharCode(65 + p.correct)
  const isCorrect = selected === p.correct
  if (isCorrect) {
    return `Selected: ${letter}. ${p.summaries[selected]} ✓ (correct)`
  }
  return `Selected: ${letter}. ${p.summaries[selected]} ✗ (incorrect — correct answer: ${correctLetter}. ${p.summaries[p.correct]})`
}

export default function HighlightCorrectSummaryPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [rawStimulus, setRawStimulus] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    if (phase !== "selecting") return
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
    setError(""); setFeedback(null); setSelected(null); setSeconds(TIME_LIMIT)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      let raw: string
      const cached = getStimulusFromBank("highlight_correct_summary")
      if (cached) {
        raw = cached
      } else {
        const res = await fetch("/api/pte/stimulus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskType: "highlight_correct_summary" }),
        })
        if (!res.ok) throw new Error("Failed to generate stimulus")
        raw = ((await res.json()) as { text: string }).text
        addStimulusToBank("highlight_correct_summary", raw)
      }
      const p = parseStimulus(raw)
      if (!p) throw new Error("Invalid stimulus format from server")

      const ttsRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: p.passage, voice: "en-US-AriaNeural", rate: 0.85 }),
      })
      if (!ttsRes.ok) throw new Error("TTS synthesis failed")
      const blob = await ttsRes.blob()
      const url = URL.createObjectURL(blob)

      setRawStimulus(raw)
      setParsed(p)
      setAudioUrl(url)
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate")
      setPhase("error")
    }
  }, [audioUrl])

  const playPassage = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.onended = () => {
      setPhase("selecting")
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
    if (parsed === null || selected === null) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000,
    )

    const stimulusForFeedback = buildStimulusForFeedback(parsed)
    const responseForFeedback = buildResponseForFeedback(parsed, selected)

    let result: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "highlight_correct_summary",
          stimulus: stimulusForFeedback,
          response: responseForFeedback,
        }),
      })
      if (res.ok) result = (await res.json()) as TaskFeedback
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
        taskType: "highlight_correct_summary",
        stimulus: { kind: "audio", content: rawStimulus },
        response: { kind: "text", content: responseForFeedback },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [parsed, selected, rawStimulus])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/practice" className="hover:text-slate-700 dark:hover:text-slate-200">Practice</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">Highlight Correct Summary</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">PTE Listening</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Highlight Correct Summary</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Listen to a passage, then select the summary that best matches what you heard. 5 minutes.
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-8">
              An AI-generated passage will be read aloud. After listening, select the one summary that accurately captures the main idea and key points.
            </p>
            <button
              onClick={generate}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Get Question
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Generating passage and audio…</p>
          </div>
        )}

        {phase === "ready" && audioUrl && (
          <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
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
            <p className="text-xs text-slate-400 dark:text-slate-500">
              After the passage ends, you will choose the correct summary from 5 options.
            </p>
          </div>
        )}

        {phase === "listening" && (
          <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
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
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Passage playing…</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Focus on the main idea and key points.</p>
            <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
          </div>
        )}

        {phase === "selecting" && parsed && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select the correct summary</p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
                {timeStr}
              </span>
            </div>

            <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">
                Which summary best captures what the passage was about?
              </p>
              {parsed.summaries.map((s, i) => (
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
                    name="hcs-option"
                    value={i}
                    checked={selected === i}
                    onChange={() => setSelected(i)}
                    className="mt-0.5 shrink-0 accent-emerald-600"
                  />
                  <span className="text-sm text-slate-800 dark:text-slate-100">
                    <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>{s}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between">
              {audioUrl && (
                <button
                  onClick={playPassage}
                  className="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 underline"
                >
                  Replay passage
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={selected === null}
                className="ml-auto rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                Submit Answer
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your answer…</p>
          </div>
        )}

        {phase === "done" && feedback && parsed && selected !== null && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={buildStimulusForFeedback(parsed)}
              stimulusLabel="Passage & Summaries"
              responseText={buildResponseForFeedback(parsed, selected)}
              responseLabel="Your Answer"
            />
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
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
