"use client"

import { useState, useRef, useEffect, useCallback } from "react"

import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import CountdownRing from "@/components/CountdownRing"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost } from "@/lib/api-client"
import { getRandomImage } from "@/lib/image-bank"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import type { ImageStimulus } from "@/lib/image-bank"
import type { TaskFeedback } from "@/types"
import { useTranslation } from "@/lib/i18n"

const PREP_TIME = 25
const RECORD_TIME = 40
const MIN_REC_SECONDS = 5

type Phase = "idle" | "ready" | "recording" | "processing" | "done" | "error"

export default function DescribeImagePage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [image, setImage] = useState<ImageStimulus | null>(null)
  const [imageError, setImageError] = useState(false)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [prepSeconds, setPrepSeconds] = useState(PREP_TIME)
  const [transcript, setTranscript] = useState("")

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const processResponse = useCallback(async (_blob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    setTranscript(tx)
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )

    const currentImage = image
    if (!currentImage) { setErrorMsg("No image loaded."); setPhase("error"); return }

    const stimulusText = `Image type: ${currentImage.topic}\n\nImage content: ${currentImage.description}`

    let fb: TaskFeedback
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "describe_image", stimulus: stimulusText, response: tx }, { timeoutMs: 90000 })
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
        createdAt: startedAt,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [image])

  const recording = useRecordingSession({
    totalSeconds: RECORD_TIME,
    minSeconds: MIN_REC_SECONDS,
    onComplete: processResponse,
    onError: msg => { setErrorMsg(msg); setPhase("error") },
  })

  useEffect(() => () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
  }, [])

  const loadImage = useCallback(() => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    setFeedback(null)
    setErrorMsg("")
    setTranscript("")
    setImageError(false)
    setPrepSeconds(PREP_TIME)
    setImage(prev => getRandomImage(prev?.url))
    setPhase("ready")
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadImage() }, [])

  // Auto-start prep timer when ready
  useEffect(() => {
    if (phase !== "ready") return
    prepTimerRef.current = setInterval(() => {
      setPrepSeconds(s => {
        if (s <= 1) {
          clearInterval(prepTimerRef.current!)
          setPhase("recording")
          recording.start()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (prepTimerRef.current) clearInterval(prepTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const handleStartNow = () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    setPhase("recording")
    recording.start()
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Describe Image</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            {t('practiceTask.common.pteSpeaking')}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Describe Image</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.describe-image.desc', { prepTime: String(PREP_TIME), recordTime: String(RECORD_TIME) })}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              {t('practiceTask.describe-image.idleDesc')}
            </p>
            <button
              onClick={loadImage}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {t('practiceTask.describe-image.loadImage')}
            </button>
          </div>
        )}

        {phase === "ready" && image && (
          <div className="space-y-6">
            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.common.preparation')}</p>
                <CountdownRing seconds={prepSeconds} total={PREP_TIME} />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">{image.topic}</p>
              {imageError ? (
                <div className="flex items-center justify-center h-48 bg-[var(--background)] text-sm text-[var(--text-secondary)]">
                  {t('practiceTask.describe-image.imageFailedToLoad')}
                </div>
              ) : (
                <div className="relative w-full" style={{ minHeight: 240 }}>
                  <img src={image.url} alt={image.topic}
                    className="w-full h-auto object-contain" onError={() => setImageError(true)} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
              <p>{t('practiceTask.common.recordingStartsAuto')}</p>
              <button
                onClick={handleStartNow}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                {t('practiceTask.common.startNow')}
              </button>
            </div>
          </div>
        )}

        {phase === "recording" && image && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">{t('practiceTask.common.recording')}</p>
                </div>
                <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">{image.topic}</p>
              {imageError ? (
                <div className="flex items-center justify-center h-48 bg-[var(--background)] text-sm text-[var(--text-secondary)]">
                  {t('practiceTask.describe-image.imageFailedToLoad')}
                </div>
              ) : (
                <div className="relative w-full" style={{ minHeight: 240 }}>
                  <img src={image.url} alt={image.topic}
                    className="w-full h-auto object-contain" onError={() => setImageError(true)} />
                </div>
              )}
            </div>
            <div className="text-center">
              <button
                onClick={recording.stop}
                disabled={!recording.canStop}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                </svg>
                {!recording.canStop
                  ? t('practiceTask.common.holdOn', { sec: String(recording.recSeconds - (RECORD_TIME - MIN_REC_SECONDS)) })
                  : t('practiceTask.common.stopRecording')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.describe-image.analyzing')}</p>
          </div>
        )}

        {phase === "done" && feedback && image && (
          <div className="space-y-6">
            <div className="border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">{t('practiceTask.describe-image.image')}</p>
              <p className="text-sm text-[var(--text-secondary)] mb-2">{image.topic}</p>
              <div className="relative w-full">
                <img src={image.url} alt={image.topic}
                  className="w-full h-auto object-contain max-h-48"
                  onError={() => setImageError(true)} />
              </div>
            </div>
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={image.description}
              stimulusLabel={t('practiceTask.describe-image.imageDescription')}
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined}
              responseLabel={t('practiceTask.describe-image.yourDescription')}
            />
            <div className="flex gap-3 justify-center">
              <button
                onClick={loadImage}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                {t('practiceTask.describe-image.newImage')}
              </button>
              <Link href="/practice" className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--foreground)]">
                {t('practiceTask.common.backToPractice')}
              </Link>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{errorMsg}</p>
            <button onClick={loadImage} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              {t('practiceTask.common.tryAgain')}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
