"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import PronunciationFeedback from "@/components/PronunciationFeedback"
import { saveTask } from "@/lib/unified-task-history"
import { blobToWav } from "@/lib/wav-encoder"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { TaskFeedback, PronunciationAssessmentResult } from "@/types"

// ── Timing constants (seconds) ────────────────────────────────────────────────
const PREP_TIME = 35      // preparation phase
const RECORD_TIME = 40    // recording phase
const MIN_REC_SECONDS = 5 // earliest a learner can stop early

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "generating" | "ready" | "recording" | "processing" | "done" | "error"

// ── Countdown ring component ──────────────────────────────────────────────────

function CountdownRing({ seconds, total, size = 80 }: { seconds: number; total: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const progress = seconds / total
  const dash = circ * progress
  const urgent = seconds <= 10
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6}
          className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={urgent ? "stroke-red-500" : "stroke-emerald-500"}
          style={{ transition: "stroke-dasharray 0.9s linear" }}
        />
      </svg>
      <span className={`absolute text-xl font-bold tabular-nums ${urgent ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
        {seconds}
      </span>
    </div>
  )
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"
    : score >= 60 ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800"
    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-sm font-semibold ${color}`}>
      {score}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReadAloudPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [stimulus, setStimulus] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [prepSeconds, setPrepSeconds] = useState(PREP_TIME)
  const [recSeconds, setRecSeconds] = useState(RECORD_TIME)
  const [transcript, setTranscript] = useState("")

  const startedAtRef = useRef<string>("")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecRef = useRef<any>(null)
  const transcriptRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      speechRecRef.current?.stop()
    }
  }, [])

  // ── Stimulus generation ───────────────────────────────────────────────────

  const generateStimulus = useCallback(async () => {
    setPhase("generating")
    setErrorMsg("")
    setFeedback(null)
    setTranscript("")
    transcriptRef.current = ""
    setPrepSeconds(PREP_TIME)
    setRecSeconds(RECORD_TIME)

    try {
      const cached = getStimulusFromBank("read_aloud")
      let text: string
      if (cached) {
        text = cached
      } else {
        const res = await fetch("/api/read-aloud/stimulus", { method: "POST" })
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to generate passage")
        text = ((await res.json()) as { text: string }).text
        addStimulusToBank("read_aloud", text)
      }
      setStimulus(text)
      setPhase("ready")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate passage")
      setPhase("error")
    }
  }, [])

  // ── Prep timer ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "ready") return
    timerRef.current = setInterval(() => {
      setPrepSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!)
          startRecording()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("recording")
    startedAtRef.current = new Date().toISOString()
    audioChunksRef.current = []
    transcriptRef.current = ""
    setRecSeconds(RECORD_TIME)

    // MediaRecorder
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.start(250)
    } catch {
      setErrorMsg("Microphone access denied. Please allow microphone and try again.")
      setPhase("error")
      return
    }

    // Web Speech API for transcript (best-effort)
    const SR = (typeof window !== "undefined")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
      : null
    if (SR) {
      const rec = new SR()
      rec.continuous = true
      rec.interimResults = false
      rec.lang = "en-US"
      rec.onresult = (event: { results: SpeechRecognitionResultList; resultIndex: number }) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcriptRef.current += (transcriptRef.current ? " " : "") + event.results[i][0].transcript
          }
        }
      }
      rec.onerror = () => { /* ignore */ }
      speechRecRef.current = rec
      try { rec.start() } catch { /* ignore */ }
    }

    // Recording countdown
    timerRef.current = setInterval(() => {
      setRecSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!)
          stopRecording()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    speechRecRef.current?.stop()
    speechRecRef.current = null

    const mr = mediaRecorderRef.current
    if (!mr || mr.state === "inactive") {
      processAudio(new Blob([], { type: "audio/webm" }))
      return
    }

    mr.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
      streamRef.current?.getTracks().forEach((t) => t.stop())
      processAudio(blob)
    }
    mr.stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Processing ────────────────────────────────────────────────────────────

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000
    )

    // Reconstruct transcript from Web Speech or fall back to placeholder
    const capturedTranscript = transcriptRef.current.trim() || "[transcript not captured]"
    setTranscript(capturedTranscript)

    // Convert to WAV for Azure (best-effort)
    let wavBlob: Blob | null = null
    if (audioBlob.size > 0) {
      try { wavBlob = await blobToWav(audioBlob) } catch { /* Azure optional */ }
    }

    // Parallel: AI feedback + Azure pronunciation
    const azurePromise: Promise<PronunciationAssessmentResult | null> = wavBlob
      ? (async () => {
          try {
            const form = new FormData()
            form.append("audio", wavBlob!, "recording.wav")
            form.append("text", stimulus)
            const res = await fetch("/api/pronunciation", { method: "POST", body: form })
            if (!res.ok) return null
            return await res.json() as PronunciationAssessmentResult
          } catch { return null }
        })()
      : Promise.resolve(null)

    const feedbackPromise: Promise<TaskFeedback | null> = (async () => {
      try {
        const res = await fetch("/api/read-aloud/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stimulus, transcript: capturedTranscript }),
        })
        if (!res.ok) return null
        return await res.json() as TaskFeedback
      } catch { return null }
    })()

    const [pronunciationResult, feedbackResult] = await Promise.all([azurePromise, feedbackPromise])

    // Merge pronunciation result into feedback
    const mergedFeedback: TaskFeedback = feedbackResult ?? {
      summary: "Feedback could not be generated. Please try again.",
      strengths: [],
      weaknesses: [],
      suggestions: [],
    }
    if (pronunciationResult) {
      mergedFeedback.pronunciationAssessment = pronunciationResult
      // Use Azure word list to improve transcript if Web Speech captured nothing
      if (capturedTranscript === "[transcript not captured]" && pronunciationResult.words.length > 0) {
        const azureTranscript = pronunciationResult.words.map((w) => w.word).join(" ")
        setTranscript(azureTranscript)
      }
    }

    setFeedback(mergedFeedback)

    // Save PracticeTask
    try {
      await saveTask({
        taskType: "read_aloud",
        stimulus: { kind: "text", content: stimulus },
        response: { kind: "audio", content: capturedTranscript },
        feedback: mergedFeedback,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (err) {
      console.warn("Failed to save task:", err)
    }

    setPhase("done")
  }, [stimulus])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="4xl" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-slate-700 dark:hover:text-slate-200">Home</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">Read Aloud</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            PTE Speaking
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Read Aloud</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Read the passage aloud as clearly and naturally as possible. You will have{" "}
            {PREP_TIME}s to prepare, then {RECORD_TIME}s to read.
          </p>
        </div>

        {/* ── Idle ─────────────────────────────────────────────────────────── */}
        {phase === "idle" && (
          <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-8 max-w-sm mx-auto">
              An AI-generated passage will appear. Study it during the preparation phase, then read it aloud when recording starts.
            </p>
            <button
              onClick={generateStimulus}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Passage
            </button>
          </div>
        )}

        {/* ── Generating ───────────────────────────────────────────────────── */}
        {phase === "generating" && (
          <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Generating passage…</p>
          </div>
        )}

        {/* ── Ready (prep timer) ───────────────────────────────────────────── */}
        {phase === "ready" && (
          <div className="space-y-6">
            <div className="border border-slate-900 bg-white p-6 dark:border-white/15 dark:bg-slate-900 shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Preparation
                </p>
                <CountdownRing seconds={prepSeconds} total={PREP_TIME} />
              </div>
              <p className="text-base sm:text-lg leading-8 text-slate-900 dark:text-white font-serif">
                {stimulus}
              </p>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <p>Recording starts automatically when the timer reaches 0.</p>
              <button
                onClick={() => { if (timerRef.current) clearInterval(timerRef.current); startRecording() }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 transition-colors hover:border-slate-900 hover:text-slate-900 dark:border-white/20 dark:text-slate-300 dark:hover:border-white dark:hover:text-white"
              >
                Start now
              </button>
            </div>
          </div>
        )}

        {/* ── Recording ────────────────────────────────────────────────────── */}
        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-white p-6 dark:bg-slate-900">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                    Recording
                  </p>
                </div>
                <CountdownRing seconds={recSeconds} total={RECORD_TIME} size={72} />
              </div>
              <p className="text-base sm:text-lg leading-8 text-slate-900 dark:text-white font-serif">
                {stimulus}
              </p>
            </div>

            <div className="text-center">
              <button
                onClick={stopRecording}
                disabled={recSeconds > RECORD_TIME - MIN_REC_SECONDS}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                </svg>
                {recSeconds > RECORD_TIME - MIN_REC_SECONDS
                  ? `Hold on… ${recSeconds - (RECORD_TIME - MIN_REC_SECONDS)}s`
                  : "Stop Recording"}
              </button>
            </div>
          </div>
        )}

        {/* ── Processing ───────────────────────────────────────────────────── */}
        {phase === "processing" && (
          <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Analyzing your reading…
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Running AI feedback and pronunciation assessment in parallel
            </p>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────────────── */}
        {phase === "done" && feedback && (
          <div className="space-y-6">
            {/* Stimulus recap */}
            <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/50">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">Passage</p>
              <p className="text-sm leading-7 text-slate-700 dark:text-slate-300 font-serif">{stimulus}</p>
            </div>

            {/* Transcript */}
            {transcript && transcript !== "[transcript not captured]" && (
              <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">Your Reading</p>
                <p className="text-sm leading-7 text-slate-600 dark:text-slate-300 italic">{transcript}</p>
              </div>
            )}

            {/* Pronunciation score summary */}
            {feedback.pronunciationAssessment && (
              <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-4">
                  Azure Pronunciation Assessment
                </p>
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "Overall", score: feedback.pronunciationAssessment.score },
                    { label: "Accuracy", score: feedback.pronunciationAssessment.accuracyScore },
                    { label: "Fluency", score: feedback.pronunciationAssessment.fluencyScore },
                    { label: "Completeness", score: feedback.pronunciationAssessment.completenessScore },
                  ].map(({ label, score }) => (
                    <div key={label} className="text-center">
                      <ScoreBadge score={score} />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
                <PronunciationFeedback assessment={feedback.pronunciationAssessment} />
              </div>
            )}

            {/* AI feedback */}
            <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)] space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                AI Feedback
              </p>

              <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{feedback.summary}</p>

              {feedback.details && feedback.details.taskType === "read_aloud" && (
                <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 dark:border-white/10 pt-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                      Oral Fluency
                    </p>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {feedback.details.oralFluency}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                      Pronunciation
                    </p>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {feedback.details.pronunciation}
                    </p>
                  </div>
                </div>
              )}

              {feedback.strengths.length > 0 && (
                <div className="border-t border-slate-100 dark:border-white/10 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400 mb-2">
                    Strengths
                  </p>
                  <ul className="space-y-1">
                    {feedback.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <span className="text-emerald-500 shrink-0">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.weaknesses.length > 0 && (
                <div className="border-t border-slate-100 dark:border-white/10 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600 dark:text-red-400 mb-2">
                    Areas to Improve
                  </p>
                  <ul className="space-y-1">
                    {feedback.weaknesses.map((w, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <span className="text-red-400 shrink-0">–</span>{w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.suggestions.length > 0 && (
                <div className="border-t border-slate-100 dark:border-white/10 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">
                    Suggestions
                  </p>
                  <ul className="space-y-1">
                    {feedback.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <span className="shrink-0 tabular-nums text-slate-400">{i + 1}.</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={generateStimulus}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Practice Again
              </button>
              <Link
                href="/"
                className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-900 dark:border-white/20 dark:text-slate-300 dark:hover:border-white"
              >
                Back to Home
              </Link>
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{errorMsg}</p>
            <button
              onClick={generateStimulus}
              className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
