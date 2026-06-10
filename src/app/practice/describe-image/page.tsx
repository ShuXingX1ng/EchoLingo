"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getRandomImage } from "@/lib/image-bank"
import type { ImageStimulus } from "@/lib/image-bank"
import type { TaskFeedback } from "@/types"

const PREP_TIME = 25
const RECORD_TIME = 40
const MIN_REC_SECONDS = 5

type Phase = "idle" | "ready" | "recording" | "processing" | "done" | "error"

function CountdownRing({ seconds, total, size = 72 }: { seconds: number; total: number; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (seconds / total)
  const urgent = seconds <= 10
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5}
          className="stroke-slate-200 dark:stroke-slate-700" />
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

export default function DescribeImagePage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [image, setImage] = useState<ImageStimulus | null>(null)
  const [imageError, setImageError] = useState(false)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      srRef.current?.stop()
    }
  }, [])

  const loadImage = useCallback(() => {
    setFeedback(null)
    setErrorMsg("")
    setTranscript("")
    txRef.current = ""
    setImageError(false)
    setPrepSeconds(PREP_TIME)
    setRecSeconds(RECORD_TIME)
    setImage(getRandomImage())
    setPhase("ready")
  }, [])

  // Auto-start prep timer when ready
  useEffect(() => {
    if (phase !== "ready") return
    timerRef.current = setInterval(() => {
      setPrepSeconds(s => {
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
    setRecSeconds(RECORD_TIME)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mrRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(250)
    } catch {
      setErrorMsg("Microphone access denied. Please allow microphone and try again.")
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

    const currentImage = image
    if (!currentImage) { setErrorMsg("No image loaded."); setPhase("error"); return }

    // Build a text stimulus from the image metadata for the feedback API
    const stimulusText = `Image type: ${currentImage.topic}\n\nImage content: ${currentImage.description}`

    let fb: TaskFeedback
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "describe_image", stimulus: stimulusText, response: tx }),
      })
      fb = res.ok
        ? (await res.json()) as TaskFeedback
        : { summary: "Feedback unavailable. Please try again.", strengths: [], weaknesses: [], suggestions: [] }
    } catch {
      fb = { summary: "Feedback unavailable. Please try again.", strengths: [], weaknesses: [], suggestions: [] }
    }

    setFeedback(fb)

    try {
      await saveTask({
        taskType: "describe_image",
        stimulus: { kind: "image", content: currentImage.url },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [image])

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">Practice</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Describe Image</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            PTE Speaking
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Describe Image</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Study the image for {PREP_TIME}s, then describe it in detail. You have {RECORD_TIME}s to speak.
          </p>
        </div>

        {/* Idle */}
        {phase === "idle" && (
          <div className="border border-slate-900 bg-[var(--surface)] p-8 dark:border-white/15 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              A chart, map, or diagram will appear. Study it during the preparation phase, then describe what you see when recording starts.
            </p>
            <button
              onClick={loadImage}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Load Image
            </button>
          </div>
        )}

        {/* Ready — image + prep timer */}
        {phase === "ready" && image && (
          <div className="space-y-6">
            <div className="border border-slate-900 bg-[var(--surface)] p-5 dark:border-white/15 shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preparation</p>
                <CountdownRing seconds={prepSeconds} total={PREP_TIME} />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">{image.topic}</p>
              {imageError ? (
                <div className="flex items-center justify-center h-48 bg-[var(--background)] text-sm text-[var(--text-secondary)]">
                  Image failed to load
                </div>
              ) : (
                <div className="relative w-full" style={{ minHeight: 240 }}>
                  <Image
                    src={image.url}
                    alt={image.topic}
                    width={640}
                    height={400}
                    className="w-full h-auto object-contain"
                    onError={() => setImageError(true)}
                    unoptimized
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
              <p>Recording starts automatically when the timer reaches 0.</p>
              <button
                onClick={() => { if (timerRef.current) clearInterval(timerRef.current); startRecording() }}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                Start now
              </button>
            </div>
          </div>
        )}

        {/* Recording */}
        {phase === "recording" && image && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Recording</p>
                </div>
                <CountdownRing seconds={recSeconds} total={RECORD_TIME} />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">{image.topic}</p>
              {imageError ? (
                <div className="flex items-center justify-center h-48 bg-[var(--background)] text-sm text-[var(--text-secondary)]">
                  Image failed to load
                </div>
              ) : (
                <div className="relative w-full" style={{ minHeight: 240 }}>
                  <Image
                    src={image.url}
                    alt={image.topic}
                    width={640}
                    height={400}
                    className="w-full h-auto object-contain"
                    onError={() => setImageError(true)}
                    unoptimized
                  />
                </div>
              )}
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
                  : "Stop Recording"}
              </button>
            </div>
          </div>
        )}

        {/* Processing */}
        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Analyzing your description…</p>
          </div>
        )}

        {/* Done */}
        {phase === "done" && feedback && image && (
          <div className="space-y-6">
            <div className="border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">Image</p>
              <p className="text-sm text-[var(--text-secondary)] mb-2">{image.topic}</p>
              <div className="relative w-full">
                <Image
                  src={image.url}
                  alt={image.topic}
                  width={400}
                  height={250}
                  className="w-full h-auto object-contain max-h-48"
                  unoptimized
                />
              </div>
            </div>
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={image.description}
              stimulusLabel="Image Description"
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined}
              responseLabel="Your Description"
            />
            <div className="flex gap-3 justify-center">
              <button
                onClick={loadImage}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                New Image
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
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{errorMsg}</p>
            <button onClick={loadImage} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
