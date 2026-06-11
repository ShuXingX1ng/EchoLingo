"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { blobToWav } from "@/lib/wav-encoder"
import type { TaskFeedback } from "@/types"

const PREP_TIME = 25
const RECORD_TIME = 30
const MIN_REC_SECONDS = 5

const FIXED_PROMPT =
  "Please introduce yourself. Tell us about your background, studies or work, " +
  "your English learning experience, and your goals. Speak naturally and clearly."

type Phase = "idle" | "ready" | "recording" | "processing" | "done" | "error"

function CountdownRing({ seconds, total, size = 80 }: { seconds: number; total: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (seconds / total)
  const urgent = seconds <= 8
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={urgent ? "stroke-red-500" : "stroke-emerald-500"}
          style={{ transition: "stroke-dasharray 0.9s linear" }} />
      </svg>
      <span className={`absolute text-xl font-bold tabular-nums ${urgent ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]"}`}>{seconds}</span>
    </div>
  )
}

export default function PersonalIntroPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [prepSec, setPrepSec] = useState(PREP_TIME)
  const [recSec, setRecSec] = useState(RECORD_TIME)
  const [transcript, setTranscript] = useState("")

  const startedAtRef = useRef("")
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null)
  const txRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    srRef.current?.stop()
  }, [])

  // prep timer
  useEffect(() => {
    if (phase !== "ready") return
    timerRef.current = setInterval(() => {
      setPrepSec(s => {
        if (s <= 1) { clearInterval(timerRef.current!); startRecording(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const startRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("recording")
    startedAtRef.current = new Date().toISOString()
    chunksRef.current = []
    txRef.current = ""
    setRecSec(RECORD_TIME)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mrRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(250)
    } catch {
      setError("Microphone access denied.")
      setPhase("error")
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : null
    if (SR) {
      const rec = new SR()
      rec.continuous = true; rec.interimResults = false; rec.lang = "en-US"
      rec.onresult = (e: { results: SpeechRecognitionResultList; resultIndex: number }) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) txRef.current += (txRef.current ? " " : "") + e.results[i][0].transcript
        }
      }
      rec.onerror = () => { /* ignore */ }
      srRef.current = rec
      try { rec.start() } catch { /* ignore */ }
    }

    timerRef.current = setInterval(() => {
      setRecSec(s => {
        if (s <= 1) { clearInterval(timerRef.current!); stopRecording(); return 0 }
        return s - 1
      })
    }, 1000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    srRef.current?.stop(); srRef.current = null
    const mr = mrRef.current
    if (!mr || mr.state === "inactive") { processAudio(new Blob([], { type: "audio/webm" })); return }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" })
      streamRef.current?.getTracks().forEach(t => t.stop())
      processAudio(blob)
    }
    mr.stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const processAudio = useCallback(async (blob: Blob) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)
    const tx = txRef.current.trim() || "[transcript not captured]"
    setTranscript(tx)

    // No pronunciation assessment for personal intro
    let wavBlob: Blob | null = null
    if (blob.size > 0) { try { wavBlob = await blobToWav(blob) } catch { /* optional */ } }
    void wavBlob // not used for personal intro

    let result: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "personal_intro", stimulus: FIXED_PROMPT, response: tx }),
      })
      if (res.ok) result = await res.json() as TaskFeedback
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? {
      summary: "Feedback could not be generated. Please try again.",
      strengths: [], weaknesses: [], suggestions: [],
    }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "personal_intro",
        stimulus: { kind: "text", content: FIXED_PROMPT },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [])

  const restart = () => {
    setFeedback(null); setTranscript(""); setError("")
    setPrepSec(PREP_TIME); setRecSec(RECORD_TIME)
    setPhase("ready")
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">Practice</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Personal Introduction</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">PTE Speaking</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Personal Introduction</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Unscored in PTE, but great for warming up. {PREP_TIME}s prep, {RECORD_TIME}s to speak.
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <div className="mb-6 rounded-lg bg-[var(--background)] p-4 text-sm leading-7 text-[var(--text-secondary)] text-left font-serif">
              {FIXED_PROMPT}
            </div>
            <button onClick={() => setPhase("ready")}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              I&apos;m Ready
            </button>
          </div>
        )}

        {phase === "ready" && (
          <div className="space-y-6">
            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Prepare</p>
                <CountdownRing seconds={prepSec} total={PREP_TIME} />
              </div>
              <p className="text-base leading-8 text-[var(--foreground)] font-serif">{FIXED_PROMPT}</p>
            </div>
            <div className="text-center">
              <button onClick={() => { if (timerRef.current) clearInterval(timerRef.current); startRecording() }}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--foreground)]">
                Start speaking now
              </button>
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Recording</p>
                </div>
                <CountdownRing seconds={recSec} total={RECORD_TIME} size={72} />
              </div>
              <p className="text-base leading-8 text-[var(--foreground)] font-serif">{FIXED_PROMPT}</p>
            </div>
            <div className="text-center">
              <button onClick={stopRecording}
                disabled={recSec > RECORD_TIME - MIN_REC_SECONDS}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent">
                {recSec > RECORD_TIME - MIN_REC_SECONDS
                  ? `Hold on… ${recSec - (RECORD_TIME - MIN_REC_SECONDS)}s`
                  : "Stop Recording"}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Generating feedback…</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay feedback={feedback} stimulus={FIXED_PROMPT} stimulusLabel="Prompt"
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined} responseLabel="Your Introduction" />
            <div className="flex gap-3 justify-center">
              <button onClick={restart}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                Try Again
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
            <button onClick={() => setPhase("idle")} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">Try Again</button>
          </div>
        )}
      </main>
    </div>
  )
}
