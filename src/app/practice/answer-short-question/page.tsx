"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { TaskFeedback } from "@/types"

// PTE: 3s pause before recording starts, 10s to answer
const PAUSE_TIME = 3
const RECORD_TIME = 10
const MIN_REC_SECONDS = 5

type Phase = "idle" | "generating" | "ready" | "countdown" | "recording" | "processing" | "done" | "error"

function CountdownRing({ seconds, total, size = 64 }: { seconds: number; total: number; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (seconds / total)
  const urgent = seconds <= 3
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={urgent ? "stroke-red-500" : "stroke-emerald-500"}
          style={{ transition: "stroke-dasharray 0.9s linear" }} />
      </svg>
      <span className={`absolute text-lg font-bold tabular-nums ${urgent ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]"}`}>{seconds}</span>
    </div>
  )
}

export default function AnswerShortQuestionPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [question, setQuestion] = useState("")
  const [correctAnswer, setCorrectAnswer] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [countSec, setCountSec] = useState(PAUSE_TIME)
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

  const generate = useCallback(async () => {
    setPhase("generating")
    setError(""); setFeedback(null); setTranscript("")
    txRef.current = ""
    try {
      let text: string
      const cached = getStimulusFromBank("answer_short_question")
      if (cached) {
        text = cached
      } else {
        const res = await fetch("/api/pte/stimulus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskType: "answer_short_question" }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
        text = ((await res.json()) as { text: string }).text
        addStimulusToBank("answer_short_question", text)
      }
      // Format: "Question\nAnswer"
      const [q, a] = text.split("\n")
      setQuestion(q?.trim() ?? text)
      setCorrectAnswer(a?.trim() ?? "")
      setCountSec(PAUSE_TIME)
      setRecSec(RECORD_TIME)
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate question")
      setPhase("error")
    }
  }, [])

  // auto-countdown when ready
  useEffect(() => {
    if (phase !== "ready") return
    setPhase("countdown")
    timerRef.current = setInterval(() => {
      setCountSec(s => {
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
    if (!mr || mr.state === "inactive") { processResponse(txRef.current || "[no answer detected]"); return }
    mr.onstop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      processResponse(txRef.current || "[no answer detected]")
    }
    mr.stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const processResponse = useCallback(async (tx: string) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)
    setTranscript(tx)

    // Include the correct answer in the stimulus so AI knows what to compare against
    const stimulusWithAnswer = `Question: ${question}\nCorrect answer: ${correctAnswer}`

    let result: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "answer_short_question", stimulus: stimulusWithAnswer, response: tx }),
      })
      if (res.ok) result = await res.json() as TaskFeedback
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "answer_short_question",
        stimulus: { kind: "text", content: question },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [question, correctAnswer])

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">Practice</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Answer Short Question</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">PTE Speaking</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Answer Short Question</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Listen to the question, then give a short spoken answer (1–3 words). {RECORD_TIME}s to respond.
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-slate-900 bg-[var(--surface)] p-8 dark:border-white/15 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">
              An AI-generated factual question will appear. Answer as briefly and accurately as possible.
            </p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              Get Question
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Generating question…</p>
          </div>
        )}

        {(phase === "countdown" || phase === "ready") && (
          <div className="space-y-6">
            <div className="border border-slate-900 bg-[var(--surface)] p-8 dark:border-white/15 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">Question</p>
              <p className="text-2xl font-semibold text-[var(--foreground)] leading-relaxed">{question}</p>
              <div className="mt-6 flex flex-col items-center gap-2">
                <CountdownRing seconds={countSec} total={PAUSE_TIME} size={56} />
                <p className="text-xs text-slate-400">Recording starts automatically</p>
              </div>
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Recording</p>
              </div>
              <p className="text-2xl font-semibold text-[var(--foreground)] mb-6">{question}</p>
              <CountdownRing seconds={recSec} total={RECORD_TIME} size={72} />
            </div>
            <div className="text-center">
              <button onClick={stopRecording}
                disabled={recSec > RECORD_TIME - MIN_REC_SECONDS}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent">
                {recSec > RECORD_TIME - MIN_REC_SECONDS
                  ? `Hold on… ${recSec - (RECORD_TIME - MIN_REC_SECONDS)}s`
                  : "Done"}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Checking your answer…</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            {correctAnswer && (
              <div className="border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300 mb-1">Model Answer</p>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{correctAnswer}</p>
              </div>
            )}
            <TaskFeedbackDisplay feedback={feedback} stimulus={question} stimulusLabel="Question"
              responseText={transcript !== "[no answer detected]" ? transcript : undefined} responseLabel="Your Answer" />
            <div className="flex gap-3 justify-center">
              <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                Next Question
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
