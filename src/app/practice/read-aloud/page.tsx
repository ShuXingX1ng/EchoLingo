"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import PronunciationFeedback from "@/components/PronunciationFeedback"
import { useTranslation } from "@/lib/i18n"
import { saveTask } from "@/lib/unified-task-history"
import { blobToWav } from "@/lib/wav-encoder"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import { apiPost, apiPostForm } from "@/lib/api-client"
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
      <span className={`absolute text-xl font-bold tabular-nums ${urgent ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]"}`}>
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
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [stimulus, setStimulus] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [prepSeconds, setPrepSeconds] = useState(PREP_TIME)
  const [recSeconds, setRecSeconds] = useState(RECORD_TIME)
  const [transcript, setTranscript] = useState("")

  const stimulusRef = useRef("")
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
        const data = await apiPost<{ text: string }>("/api/read-aloud/stimulus", {})
        text = data.text
        addStimulusToBank("read_aloud", text)
      }
      stimulusRef.current = text
      setStimulus(text)
      setPhase("ready")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("practiceTask.read-aloud.errorGenerate"))
      setPhase("error")
    }
  }, [t])

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
      setErrorMsg(t("practiceTask.common.micDenied"))
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
  }, [t]) // eslint-disable-line react-hooks/exhaustive-deps

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
            form.append("referenceText", stimulusRef.current)
            return await apiPostForm<PronunciationAssessmentResult>("/api/pronunciation", form)
          } catch { return null }
        })()
      : Promise.resolve(null)

    const feedbackPromise: Promise<TaskFeedback | null> = (async () => {
      try {
        return await apiPost<TaskFeedback>("/api/read-aloud/feedback", {
          stimulus: stimulusRef.current,
          transcript: capturedTranscript,
        })
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
        stimulus: { kind: "text", content: stimulusRef.current },
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
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/" className="hover:text-[var(--foreground)]">{t("nav.home")}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Read Aloud</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            {t("practiceTask.common.pteSpeaking")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Read Aloud</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t("practiceTask.read-aloud.desc", { prepTime: String(PREP_TIME), recordTime: String(RECORD_TIME) })}
          </p>
        </div>

        {/* ── Idle ─────────────────────────────────────────────────────────── */}
        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-[var(--text-secondary)] text-sm mb-8 max-w-sm mx-auto">
              {t("practiceTask.read-aloud.idleDesc")}
            </p>
            <button
              onClick={generateStimulus}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {t("practiceTask.read-aloud.generatePassage")}
            </button>
          </div>
        )}

        {/* ── Generating ───────────────────────────────────────────────────── */}
        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t("practiceTask.common.generatingPassage")}</p>
          </div>
        )}

        {/* ── Ready (prep timer) ───────────────────────────────────────────── */}
        {phase === "ready" && (
          <div className="space-y-6">
            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("practiceTask.common.preparation")}
                </p>
                <CountdownRing seconds={prepSeconds} total={PREP_TIME} />
              </div>
              <p className="text-base sm:text-lg leading-8 text-[var(--foreground)] font-serif">
                {stimulus}
              </p>
            </div>

            <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
              <p>{t("practiceTask.common.recordingStartsAuto")}</p>
              <button
                onClick={() => { if (timerRef.current) clearInterval(timerRef.current); startRecording() }}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
              >
                {t("practiceTask.common.startNow")}
              </button>
            </div>
          </div>
        )}

        {/* ── Recording ────────────────────────────────────────────────────── */}
        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                    {t("practiceTask.common.recording")}
                  </p>
                </div>
                <CountdownRing seconds={recSeconds} total={RECORD_TIME} size={72} />
              </div>
              <p className="text-base sm:text-lg leading-8 text-[var(--foreground)] font-serif">
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
                  ? t("practiceTask.common.holdOn", { sec: String(recSeconds - (RECORD_TIME - MIN_REC_SECONDS)) })
                  : t("practiceTask.common.stopRecording")}
              </button>
            </div>
          </div>
        )}

        {/* ── Processing ───────────────────────────────────────────────────── */}
        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">
              {t("practiceTask.read-aloud.analyzing")}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {t("practiceTask.read-aloud.analyzingSubtitle")}
            </p>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────────────── */}
        {phase === "done" && feedback && (
          <div className="space-y-6">
            {/* Stimulus recap */}
            <div className="border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">{t("practiceTask.common.passage")}</p>
              <p className="text-sm leading-7 text-[var(--text-secondary)] font-serif">{stimulus}</p>
            </div>

            {/* Transcript */}
            {transcript && transcript !== "[transcript not captured]" && (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">{t("practiceTask.read-aloud.yourReading")}</p>
                <p className="text-sm leading-7 text-[var(--text-secondary)] italic">{transcript}</p>
              </div>
            )}

            {/* Pronunciation score summary */}
            {feedback.pronunciationAssessment && (
              <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-4">
                  {t("practiceTask.read-aloud.azurePronunciation")}
                </p>
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: t("pronunciation.overall"), score: feedback.pronunciationAssessment.score },
                    { label: t("pronunciation.accuracy"), score: feedback.pronunciationAssessment.accuracyScore },
                    { label: t("pronunciation.fluency"), score: feedback.pronunciationAssessment.fluencyScore },
                    { label: t("pronunciation.completeness"), score: feedback.pronunciationAssessment.completenessScore },
                  ].map(({ label, score }) => (
                    <div key={label} className="text-center">
                      <ScoreBadge score={score} />
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{label}</p>
                    </div>
                  ))}
                </div>
                <PronunciationFeedback assessment={feedback.pronunciationAssessment} />
              </div>
            )}

            {/* AI feedback */}
            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[4px_4px_0_rgba(15,23,42,0.08)] space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {t("practiceTask.common.aiFeedback")}
              </p>

              <p className="text-sm leading-7 text-[var(--foreground)]">{feedback.summary}</p>

              {feedback.details && feedback.details.taskType === "read_aloud" && (
                <div className="grid gap-4 sm:grid-cols-2 border-t border-[var(--border)] pt-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                      {t("practiceTask.read-aloud.oralFluency")}
                    </p>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">
                      {feedback.details.oralFluency}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                      {t("practiceTask.read-aloud.pronunciation")}
                    </p>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">
                      {feedback.details.pronunciation}
                    </p>
                  </div>
                </div>
              )}

              {feedback.strengths.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400 mb-2">
                    {t("practiceTask.common.strengths")}
                  </p>
                  <ul className="space-y-1">
                    {feedback.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--foreground)]">
                        <span className="text-emerald-500 shrink-0">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.weaknesses.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600 dark:text-red-400 mb-2">
                    {t("practiceTask.common.areasToImprove")}
                  </p>
                  <ul className="space-y-1">
                    {feedback.weaknesses.map((w, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--foreground)]">
                        <span className="text-red-400 shrink-0">–</span>{w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.suggestions.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">
                    {t("practiceTask.common.suggestions")}
                  </p>
                  <ul className="space-y-1">
                    {feedback.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)]">
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
                {t("practiceTask.common.practiceAgain")}
              </button>
              <Link
                href="/"
                className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--foreground)]"
              >
                {t("practiceTask.common.backToHome")}
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
              {t("practiceTask.common.tryAgain")}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
