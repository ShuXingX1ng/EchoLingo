"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import CountdownRing from "@/components/CountdownRing"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import type { TaskFeedback } from "@/types"
import { useTranslation } from "@/lib/i18n"

const PAUSE_TIME = 3
const RECORD_TIME = 10

type Phase = "idle" | "generating" | "playing" | "countdown" | "recording" | "processing" | "done" | "error"

export default function AnswerShortQuestionPage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [question, setQuestion] = useState("")
  const [correctAnswer, setCorrectAnswer] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [countSec, setCountSec] = useState(PAUSE_TIME)
  const [transcript, setTranscript] = useState("")

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const generateIdRef = useRef(0)

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null }
  }, [])

  const processResponse = useCallback(async (_blob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    setTranscript(tx)
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )

    const stimulusWithAnswer = `Question: ${question}\nCorrect answer: ${correctAnswer}`

    let result: TaskFeedback | null = null
    try {
      result = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "answer_short_question", stimulus: stimulusWithAnswer, response: tx }, { timeoutMs: 90000 })
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
        createdAt: startedAt,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [question, correctAnswer])

  const recording = useRecordingSession({
    totalSeconds: RECORD_TIME,
    onComplete: processResponse,
    onError: msg => { setError(msg); setPhase("error") },
  })

  // Start countdown directly — avoids the useEffect cleanup race condition
  const startCountdown = useCallback(() => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    setCountSec(PAUSE_TIME)
    setPhase("countdown")
    let remaining = PAUSE_TIME
    prepTimerRef.current = setInterval(() => {
      remaining -= 1
      setCountSec(remaining)
      if (remaining <= 0) {
        clearInterval(prepTimerRef.current!)
        setPhase("recording")
        recording.start()
      }
    }, 1000)
  }, [recording])

  useEffect(() => () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    cleanupAudio()
  }, [cleanupAudio])

  const generate = useCallback(async () => {
    const id = ++generateIdRef.current
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    cleanupAudio()
    setPhase("generating")
    setError(""); setFeedback(null); setTranscript("")
    try {
      const text = await loadStimulusText({ taskType: "answer_short_question" })
      if (id !== generateIdRef.current) return

      const [q, a] = text.split("\n")
      const questionText = q?.trim() ?? text
      const answerText = a?.trim() ?? ""
      setQuestion(questionText)
      setCorrectAnswer(answerText)

      // Fetch TTS for the question
      let audioUrl: string | null = null
      try {
        const blob = await apiPostBlob("/api/tts", { text: questionText, voice: "en-US-AriaNeural", rate: 0.9 }, { timeoutMs: 30000 })
        if (id !== generateIdRef.current) return
        audioUrl = URL.createObjectURL(blob)
        audioUrlRef.current = audioUrl
      } catch { /* TTS failure falls back to countdown directly */ }

      if (id !== generateIdRef.current) return
      setPhase("playing")

      if (audioUrl) {
        const audio = new Audio(audioUrl)
        audioRef.current = audio
        let fired = false
        const onDone = () => {
          if (fired || id !== generateIdRef.current) return
          fired = true
          audioRef.current = null
          startCountdown()
        }
        audio.onended = onDone
        audio.onerror = onDone
        audio.play().catch(onDone)
      } else {
        startCountdown()
      }
    } catch (e) {
      if (id !== generateIdRef.current) return
      setError(e instanceof Error ? e.message : t('practiceTask.answer-short-question.errorGenerate'))
      setPhase("error")
    }
  }, [t, cleanupAudio, startCountdown])

  useEffect(() => {
    generate()
    return () => {
      // Invalidate any in-flight generate() so its async continuations bail out.
      // This is essential for React Strict Mode which unmounts+remounts on dev.
      generateIdRef.current++
      cleanupAudio()
      if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">{t("practiceTask.answer-short-question.title")}</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteSpeaking')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{t("practiceTask.answer-short-question.title")}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.answer-short-question.desc', { recordTime: String(RECORD_TIME) })}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">
              {t('practiceTask.answer-short-question.idleDesc')}
            </p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {t('practiceTask.answer-short-question.getQuestion')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.answer-short-question.generatingQuestion')}</p>
          </div>
        )}

        {phase === "playing" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 shadow-[6px_6px_0_rgba(15,23,42,0.08)] space-y-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-[0.18em]">
                {t('practiceTask.answer-short-question.listeningToQuestion')}
              </p>
            </div>
            {question && (
              <div className="border-t border-[var(--border)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">Question</p>
                <p className="text-lg font-semibold text-[var(--foreground)] leading-relaxed">{question}</p>
              </div>
            )}
          </div>
        )}

        {phase === "countdown" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">Question</p>
            <p className="text-xl font-semibold text-[var(--foreground)] leading-relaxed mb-6">{question}</p>
            <div className="flex flex-col items-center gap-2">
              <CountdownRing seconds={countSec} total={PAUSE_TIME} size={56} />
              <p className="text-xs text-slate-400">{t('practiceTask.answer-short-question.recordingStartsAuto')}</p>
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">{t('practiceTask.common.recording')}</p>
              </div>
              <p className="text-xl font-semibold text-[var(--foreground)] mb-6">{question}</p>
              <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} size={72} />
            </div>
            <div className="text-center">
              <button onClick={recording.stop}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
                {t('practiceTask.common.stopRecording')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.answer-short-question.checking')}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            {correctAnswer && (
              <div className="border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300 mb-1">{t('practiceTask.answer-short-question.modelAnswer')}</p>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{correctAnswer}</p>
              </div>
            )}
            <TaskFeedbackDisplay feedback={feedback} stimulus={question} stimulusLabel={t('practiceTask.answer-short-question.question')}
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined} responseLabel={t('practiceTask.answer-short-question.yourAnswer')} />
            <div className="flex gap-3 justify-center">
              <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                {t('practiceTask.answer-short-question.nextQuestion')}
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
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">{t('practiceTask.common.tryAgain')}</button>
          </div>
        )}
      </main>
    </div>
  )
}
