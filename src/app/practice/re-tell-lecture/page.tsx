"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import CountdownRing from "@/components/CountdownRing"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import type { TaskFeedback } from "@/types"
import { useTranslation } from "@/lib/i18n"

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

export default function ReTellLecturePage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [lectureText, setLectureText] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [prepSeconds, setPrepSeconds] = useState(PREP_TIME)
  const [transcript, setTranscript] = useState("")

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const processResponse = useCallback(async (_blob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    setTranscript(tx)
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )

    let fb: TaskFeedback
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "re_tell_lecture", stimulus: lectureText, response: tx }, { timeoutMs: 90000 })
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
        createdAt: startedAt,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [lectureText])

  const recording = useRecordingSession({
    totalSeconds: RECORD_TIME,
    minSeconds: MIN_REC_SECONDS,
    onComplete: processResponse,
    onError: msg => { setError(msg); setPhase("error") },
  })

  useEffect(() => () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    audioRef.current?.pause()
  }, [])

  const generate = useCallback(async () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPhase("generating")
    setError(""); setFeedback(null); setTranscript("")
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      const text = await loadStimulusText({ taskType: "re_tell_lecture" })
      setLectureText(text)

      const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.85 }, { timeoutMs: 30000 })
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setPrepSeconds(PREP_TIME)
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : t('practiceTask.re-tell-lecture.errorGenerate'))
      setPhase("error")
    }
  }, [audioUrl, t])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generate() }, [])

  const startPrepTimer = useCallback(() => {
    setPrepSeconds(PREP_TIME)
    setPhase("prep")
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
  }, [recording.start]) // eslint-disable-line react-hooks/exhaustive-deps

  const playLecture = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    audio.onended = () => startPrepTimer()
    audio.onerror = () => startPrepTimer()

    setPhase("listening")
    requestAnimationFrame(() => {
      audio.play().catch(() => {
        setPhase("ready")
        audioRef.current = null
      })
    })
  }, [audioUrl, startPrepTimer])

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">{t("practiceTask.re-tell-lecture.title")}</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            {t('practiceTask.common.pteSpeaking')}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{t("practiceTask.re-tell-lecture.title")}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.re-tell-lecture.desc', { prepTime: String(PREP_TIME), recordTime: String(RECORD_TIME) })}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              {t('practiceTask.re-tell-lecture.idleDesc')}
            </p>
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 9.75v4.5m0 0a2.25 2.25 0 01-2.25-2.25m2.25 2.25a2.25 2.25 0 002.25-2.25M9.75 9.75a2.25 2.25 0 00-2.25 2.25m2.25-2.25a2.25 2.25 0 012.25 2.25" />
              </svg>
              {t('practiceTask.re-tell-lecture.generateLecture')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">{t('practiceTask.re-tell-lecture.generatingLecture')}</p>
            <p className="text-xs text-[var(--text-muted)]">{t('practiceTask.re-tell-lecture.writingLecture')}</p>
          </div>
        )}

        {phase === "ready" && audioUrl && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              {t('practiceTask.re-tell-lecture.lectureReady')}
            </p>
            <button
              onClick={playLecture}
              className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 mb-4"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              {t('practiceTask.re-tell-lecture.playLecture')}
            </button>
            <p className="text-xs text-[var(--text-muted)]">
              {t('practiceTask.re-tell-lecture.afterLecture', { prepTime: String(PREP_TIME), recordTime: String(RECORD_TIME) })}
            </p>
          </div>
        )}

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
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">{t('practiceTask.re-tell-lecture.lecturePlaying')}</p>
            <p className="text-xs text-[var(--text-muted)]">{t('practiceTask.re-tell-lecture.listenTimer')}</p>
            <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
          </div>
        )}

        {phase === "prep" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              {t('practiceTask.re-tell-lecture.prepPhase')}
            </p>
            <CountdownRing seconds={prepSeconds} total={PREP_TIME} size={88} />
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              {t('practiceTask.re-tell-lecture.recordingStartsIn', { sec: String(prepSeconds) })}
            </p>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                  {t('practiceTask.re-tell-lecture.recordingPhase')}
                </p>
              </div>
              <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} size={80} />
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
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.re-tell-lecture.analyzing')}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={lectureText}
              stimulusLabel={t('practiceTask.re-tell-lecture.lectureText')}
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined}
              responseLabel={t('practiceTask.re-tell-lecture.yourRetell')}
            />
            <div className="flex gap-3 justify-center">
              <button
                onClick={generate}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                {t('practiceTask.re-tell-lecture.newLecture')}
              </button>
              <Link href="/practice" className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--foreground)]">
                {t('practiceTask.common.backToPractice')}
              </Link>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              {t('practiceTask.common.tryAgain')}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
