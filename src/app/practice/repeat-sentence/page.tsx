"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import CountdownRing from "@/components/CountdownRing"
import MicrophoneMonitor from "@/components/MicrophoneMonitor"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { blobToWav } from "@/lib/wav-encoder"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import { apiPost, apiPostBlob, apiPostForm } from "@/lib/api-client"
import type { TaskFeedback, PronunciationAssessmentResult } from "@/types"
import { useTranslation } from "@/lib/i18n"

const RECORD_TIME = 15
const MIN_REC_SECONDS = 5

type Phase = "idle" | "generating" | "ready" | "recording" | "processing" | "done" | "error"

export default function RepeatSentencePage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [sentence, setSentence] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [transcript, setTranscript] = useState("")

  const sentenceRef = useRef("")
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const processAudio = useCallback(async (audioBlob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    setTranscript(tx)
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )

    let wavBlob: Blob | null = null
    if (audioBlob.size > 0) {
      try { wavBlob = await blobToWav(audioBlob) } catch { /* optional */ }
    }

    const azurePromise: Promise<PronunciationAssessmentResult | null> = wavBlob
      ? (async () => {
          try {
            const form = new FormData()
            form.append("audio", wavBlob!, "recording.wav")
            form.append("referenceText", sentenceRef.current)
            return await apiPostForm<PronunciationAssessmentResult>("/api/pronunciation", form)
          } catch { return null }
        })()
      : Promise.resolve(null)

    const feedbackPromise: Promise<TaskFeedback | null> = (async () => {
      try {
        return await apiPost<TaskFeedback>("/api/pte/feedback", {
          taskType: "repeat_sentence",
          stimulus: sentenceRef.current,
          response: tx,
        })
      } catch { return null }
    })()

    const [pronunciationResult, feedbackResult] = await Promise.all([azurePromise, feedbackPromise])

    const fb: TaskFeedback = feedbackResult ?? {
      summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [],
    }
    if (pronunciationResult) {
      fb.pronunciationAssessment = pronunciationResult
      if (tx === "[transcript not captured]" && pronunciationResult.words.length > 0) {
        setTranscript(pronunciationResult.words.map(w => w.word).join(" "))
      }
    }

    setFeedback(fb)
    setPhase("done")

    saveTask({
      taskType: "repeat_sentence",
      stimulus: { kind: "audio", content: sentenceRef.current },
      response: { kind: "audio", content: tx },
      feedback: fb,
      durationSeconds,
      createdAt: startedAt,
      endedAt,
    }).catch(e => console.warn("saveTask failed:", e))
  }, [])

  const recording = useRecordingSession({
    totalSeconds: RECORD_TIME,
    minSeconds: MIN_REC_SECONDS,
    onComplete: processAudio,
    onError: msg => { setError(msg); setPhase("error") },
  })

  const generate = useCallback(async () => {
    setError(""); setFeedback(null); setTranscript("")
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }
    setPhase("generating")

    try {
      const text = await loadStimulusText({ taskType: "repeat_sentence" })
      setSentence(text)
      sentenceRef.current = text

      const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.9 })
      setAudioUrl(URL.createObjectURL(blob))
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : t("practiceTask.repeat-sentence.errorGenerate"))
      setPhase("error")
    }
  }, [audioUrl, t])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generate() }, [])

  const playAudio = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.play().catch(() => {})
  }, [audioUrl])

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t("nav.practice")}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Repeat Sentence</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            {t("practiceTask.common.pteSpeaking")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Repeat Sentence</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t("practiceTask.repeat-sentence.desc", { recordTime: String(RECORD_TIME) })}
          </p>
          <div className="mt-3"><MicrophoneMonitor /></div>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              {t("practiceTask.repeat-sentence.idleDesc")}
            </p>
            <button onClick={generate}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {t("practiceTask.repeat-sentence.generateSentence")}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t("practiceTask.repeat-sentence.generating")}</p>
          </div>
        )}

        {phase === "ready" && audioUrl && (
          <div className="space-y-6">
            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
                {t("practiceTask.repeat-sentence.listenFirst")}
              </p>
              <button onClick={playAudio}
                className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 mb-6">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
                {t("practiceTask.repeat-sentence.playSentence")}
              </button>
              <p className="text-xs text-slate-400 mb-6">{t("practiceTask.repeat-sentence.playThenRecord")}</p>
              <button onClick={recording.start}
                className="rounded-xl border-2 border-emerald-500 px-8 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                {t("practiceTask.repeat-sentence.recordMyAnswer")}
              </button>
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                  {t("practiceTask.repeat-sentence.recordingRepeat")}
                </p>
              </div>
              <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} size={80} />
            </div>
            <div className="text-center">
              <button onClick={recording.stop}
                disabled={!recording.canStop}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent">
                {!recording.canStop
                  ? t("practiceTask.common.holdOn", { sec: String(recording.recSeconds - (RECORD_TIME - MIN_REC_SECONDS)) })
                  : t("practiceTask.common.stopRecording")}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t("practiceTask.repeat-sentence.analyzing")}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={sentence}
              stimulusLabel={t("practiceTask.repeat-sentence.originalSentence")}
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined}
              responseLabel={t("practiceTask.repeat-sentence.yourRepetition")}
            />
            <div className="flex gap-3 justify-center">
              <button onClick={generate}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                {t("practiceTask.common.tryAnother")}
              </button>
              <Link href="/practice"
                className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--foreground)]">
                {t("practiceTask.common.backToPractice")}
              </Link>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
            <button onClick={generate}
              className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              {t("practiceTask.common.tryAgain")}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
