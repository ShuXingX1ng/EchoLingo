"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { TaskFeedback } from "@/types"

const TIME_LIMIT = 420 // 7 minutes

type BlankDef = { options: string[]; correct: number }
type ParsedStimulus = { passage: string; blanks: BlankDef[] }
type Phase = "idle" | "generating" | "ready" | "listening" | "answering" | "processing" | "done" | "error"

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
  const parts = passage.split(/(\[BLANK_\d+\])/)
  return parts.map((p) => {
    const m = p.match(/^\[BLANK_(\d+)\]$/)
    return m ? { type: "blank" as const, value: m[1] } : { type: "text" as const, value: p }
  })
}

function buildStimulusForFeedback(parsed: ParsedStimulus): string {
  let passage = parsed.passage
  parsed.blanks.forEach((b, i) => {
    passage = passage.replace(`[BLANK_${i}]`, `[${b.options[b.correct]}]`)
  })
  const answers = parsed.blanks.map((b, i) => `Blank ${i + 1}: "${b.options[b.correct]}"`).join(", ")
  return `Passage (with correct answers):\n${passage}\n\nCorrect answers: ${answers}`
}

function buildResponseForFeedback(parsed: ParsedStimulus, selections: (string | null)[]): string {
  return parsed.blanks
    .map((b, i) => {
      const selected = selections[i] ?? "(no answer)"
      const correct = b.options[b.correct]
      const isCorrect = selected === correct
      return `Blank ${i + 1}: selected "${selected}" (correct: "${correct}") ${isCorrect ? "✓" : "✗"}`
    })
    .join("\n")
}

export default function FillInTheBlanksListeningPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [rawStimulus, setRawStimulus] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [selections, setSelections] = useState<(string | null)[]>([])
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    if (phase !== "answering") return
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
    setError(""); setFeedback(null); setSelections([]); setSeconds(TIME_LIMIT)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      let raw: string
      const cached = getStimulusFromBank("fill_in_the_blanks_listening")
      if (cached) {
        raw = cached
      } else {
        const res = await fetch("/api/pte/stimulus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskType: "fill_in_the_blanks_listening" }),
        })
        if (!res.ok) throw new Error("Failed to generate stimulus")
        raw = ((await res.json()) as { text: string }).text
        addStimulusToBank("fill_in_the_blanks_listening", raw)
      }
      const p = parseStimulus(raw)
      if (!p) throw new Error("Invalid stimulus format from server")

      // Build the full passage text for TTS (with blanks filled)
      let ttsText = p.passage
      p.blanks.forEach((b, i) => {
        ttsText = ttsText.replace(`[BLANK_${i}]`, b.options[b.correct])
      })

      const ttsRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, voice: "en-US-AriaNeural", rate: 0.85 }),
      })
      if (!ttsRes.ok) throw new Error("TTS synthesis failed")
      const blob = await ttsRes.blob()
      const url = URL.createObjectURL(blob)

      setRawStimulus(raw)
      setParsed(p)
      setAudioUrl(url)
      setSelections(new Array(p.blanks.length).fill(null))
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
      setPhase("answering")
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
    if (!parsed) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000,
    )

    const stimulusForFeedback = buildStimulusForFeedback(parsed)
    const responseForFeedback = buildResponseForFeedback(parsed, selections)

    let result: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "fill_in_the_blanks_listening",
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
        taskType: "fill_in_the_blanks_listening",
        stimulus: { kind: "audio", content: rawStimulus },
        response: { kind: "text", content: responseForFeedback },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [parsed, selections, rawStimulus])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const allAnswered = parsed ? selections.every(s => s !== null) : false
  const segments = parsed ? splitPassage(parsed.passage) : []

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/practice" className="hover:text-slate-700 dark:hover:text-slate-200">Practice</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">Fill in the Blanks (Listening)</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">PTE Listening</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Fill in the Blanks</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Listen to a passage, then select the correct word from the dropdown for each blank. 7 minutes.
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-8">
              An AI-generated academic passage will be read aloud. After listening, fill in the blanks using the dropdown options.
            </p>
            <button
              onClick={generate}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Get Passage
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
              After the passage ends, you will fill in the blanks using dropdown options.
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
            <p className="text-xs text-slate-400 dark:text-slate-500">Listen for the words that fill the blanks.</p>
            <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
          </div>
        )}

        {phase === "answering" && parsed && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select the correct words</p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
                {timeStr}
              </span>
            </div>
            <div className="border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900 leading-9 text-sm text-slate-800 dark:text-slate-100">
              {segments.map((seg, i) => {
                if (seg.type === "text") return <span key={i}>{seg.value}</span>
                const blankIdx = parseInt(seg.value, 10)
                const blank = parsed.blanks[blankIdx]
                return (
                  <select
                    key={i}
                    value={selections[blankIdx] ?? ""}
                    onChange={e => {
                      const newSel = [...selections]
                      newSel[blankIdx] = e.target.value || null
                      setSelections(newSel)
                    }}
                    className="mx-1 inline-block rounded border border-emerald-400 bg-white px-2 py-0.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-white dark:border-emerald-600"
                  >
                    <option value="">— choose —</option>
                    {blank.options.map((opt, oi) => (
                      <option key={oi} value={opt}>{opt}</option>
                    ))}
                  </select>
                )
              })}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <p className="text-xs text-slate-400">
                  {selections.filter(Boolean).length} / {parsed.blanks.length} answered
                </p>
                {audioUrl && (
                  <button
                    onClick={playPassage}
                    className="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 underline"
                  >
                    Replay
                  </button>
                )}
              </div>
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
          <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your answers…</p>
          </div>
        )}

        {phase === "done" && feedback && parsed && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={buildStimulusForFeedback(parsed)}
              stimulusLabel="Passage (with answers)"
              responseText={buildResponseForFeedback(parsed, selections)}
              responseLabel="Your Answers"
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
