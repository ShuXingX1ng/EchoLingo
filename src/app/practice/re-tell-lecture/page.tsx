"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import type { TaskFeedback } from "@/types"

const PREP_TIME = 10
const RECORD_TIME = 40
const MIN_REC_SECONDS = 5

type Phase =
  | "idle"
  | "generating"
  | "ready"
  | "listening"
  | "prep"
  | "recording"
  | "processing"
  | "done"
  | "error"

function CountdownRing({ seconds, total, size = 72 }: { seconds: number; total: number; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (seconds / total)
  const urgent = seconds <= 5
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={urgent ? "stroke-red-500" : "stroke-emerald-500"}
          style={{ transition: "stroke-dasharray 0.9s linear" }} />
      </svg>
      <span className={`absolute text-lg font-bold tabular-nums ${urgent ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]"}`}>
        {seconds}
      </span>
    </div>
  )
}

export default function ReTellLecturePage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [lectureText, setLectureText] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [prepSeconds, setPrepSeconds] = useState(PREP_TIME)
  const [recSeconds, setRecSeconds] = useState(RECORD_TIME)
  const [transcript, setTranscript] = useState("")

  const startedAtRef = useRef("")
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null)
  const txRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const generate = useCallback(async () => {
    setPhase("generating")
    setError(""); setFeedback(null); setTranscript("")
    txRef.current = ""
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      let text: string
      const cached = getStimulusFromBank("re_tell_lecture")
      if (cached) {
        text = cached
      } else {
        const stimData = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType: "re_tell_lecture" })
        text = stimData.text
        addStimulusToBank("re_tell_lecture", text)
      }
      setLectureText(text)

      const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.85 })
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setPrepSeconds(PREP_TIME)
      setRecSeconds(RECORD_TIME)
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate lecture")
      setPhase("error")
    }
  }, [audioUrl])

  const playLecture = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    audio.onended = () => {
      // Transition to 10s prep phase after lecture finishes
      setPhase("prep")
      setPrepSeconds(PREP_TIME)
      timerRef.current = setInterval(() => {
        setPrepSeconds(s => {
          if (s <= 1) { clearInterval(timerRef.current!); startRecording(); return 0 }
          return s - 1
        })
      }, 1000)
    }

    setPhase("listening")
    audio.play().catch(() => {
      // Autoplay blocked — go back to ready so learner can manually trigger
      setPhase("ready")
      audioRef.current = null
    })
  }, [audioUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("recording")
    startedAtRef.current = new Date().toISOString()
    chunksRef.current = []
    txRef.current = ""
    setRecSeconds(RECORD_TIME)

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
      setRecSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); stopRecording(); return 0 }
        return s - 1
      })
    }, 1000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    srRef.current?.stop(); srRef.current = null
    const mr = mrRef.current
    if (!mr || mr.state === "inactive") { processResponse(new Blob([], { type: "audio/webm" })); return }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" })
      streamRef.current?.getTracks().forEach(t => t.stop())
      processResponse(blob)
    }
    mr.stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const processResponse = useCallback(async (_blob: Blob) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000
    )
    const tx = txRef.current.trim() || "[transcript not captured]"
    setTranscript(tx)

    let fb: TaskFeedback
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "re_tell_lecture", stimulus: lectureText, response: tx })
    } catch {
      fb = { summary: "Feedback unavailable. Please try again.", strengths: [], weaknesses: [], suggestions: [] }
    }

    setFeedback(fb)

    try {
      await saveTask({
        taskType: "re_tell_lecture",
        stimulus: { kind: "audio", content: lectureText },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [lectureText])

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">Practice</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Re-tell Lecture</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            PTE Speaking
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Re-tell Lecture</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Listen to a short lecture, then re-tell it in your own words. You have {PREP_TIME}s to prepare and {RECORD_TIME}s to respond.
          </p>
        </div>

        {/* Idle */}
        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              An AI-generated lecture will be synthesized as audio. Listen carefully, prepare for 10s, then re-tell the key points.
            </p>
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 9.75v4.5m0 0a2.25 2.25 0 01-2.25-2.25m2.25 2.25a2.25 2.25 0 002.25-2.25M9.75 9.75a2.25 2.25 0 00-2.25 2.25m2.25-2.25a2.25 2.25 0 012.25 2.25" />
              </svg>
              Generate Lecture
            </button>
          </div>
        )}

        {/* Generating */}
        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">Generating lecture audio…</p>
            <p className="text-xs text-[var(--text-muted)]">Writing lecture text and synthesizing speech</p>
          </div>
        )}

        {/* Ready — play button */}
        {phase === "ready" && audioUrl && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              Lecture ready — listen carefully
            </p>
            <button
              onClick={playLecture}
              className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 mb-4"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play Lecture
            </button>
            <p className="text-xs text-[var(--text-muted)]">
              After the lecture ends, you will have {PREP_TIME}s to prepare, then {RECORD_TIME}s to re-tell it.
            </p>
          </div>
        )}

        {/* Listening — audio is playing */}
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
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">Lecture playing…</p>
            <p className="text-xs text-[var(--text-muted)]">Listen carefully. The preparation timer starts when the lecture ends.</p>
            <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
          </div>
        )}

        {/* Prep — 10s countdown after audio ends */}
        {phase === "prep" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              Preparation — organise your thoughts
            </p>
            <CountdownRing seconds={prepSeconds} total={PREP_TIME} size={88} />
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              Recording starts automatically in {prepSeconds}s
            </p>
          </div>
        )}

        {/* Recording */}
        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                  Recording — Re-tell the lecture now
                </p>
              </div>
              <CountdownRing seconds={recSeconds} total={RECORD_TIME} size={80} />
            </div>
            <div className="text-center">
              <button
                onClick={stopRecording}
                disabled={recSeconds > RECORD_TIME - MIN_REC_SECONDS}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                </svg>
                {recSeconds > RECORD_TIME - MIN_REC_SECONDS
                  ? `Hold on… ${recSeconds - (RECORD_TIME - MIN_REC_SECONDS)}s`
                  : "Done"}
              </button>
            </div>
          </div>
        )}

        {/* Processing */}
        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Analyzing your re-tell…</p>
          </div>
        )}

        {/* Done */}
        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={lectureText}
              stimulusLabel="Lecture Text"
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined}
              responseLabel="Your Re-tell"
            />
            <div className="flex gap-3 justify-center">
              <button
                onClick={generate}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                New Lecture
              </button>
              <Link href="/practice" className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--foreground)]">
                Back to Practice
              </Link>
            </div>
          </div>
        )}

        {/* Error */}
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
