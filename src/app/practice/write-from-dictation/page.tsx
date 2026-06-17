"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import type { TaskFeedback } from "@/types"
import { useTranslation } from "@/lib/i18n"

type Phase = "idle" | "generating" | "ready" | "listening" | "typing" | "processing" | "done" | "error"

export default function WriteFromDictationPage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [sentence, setSentence] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [userText, setUserText] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [hasPlayed, setHasPlayed] = useState(false)

  const startedAtRef = useRef("")
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
  }, [])

  const generate = useCallback(async () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPhase("generating")
    setError(""); setFeedback(null); setUserText(""); setHasPlayed(false)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      const text = await loadStimulusText({ taskType: "write_from_dictation" })
      setSentence(text)

      const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.85 }, { timeoutMs: 30000 })
      setAudioUrl(URL.createObjectURL(blob))
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setPhase("error")
    }
  }, [audioUrl])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generate() }, [])

  const playAudio = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.onended = () => {
      setHasPlayed(true)
      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setPhase("typing")
    }
    setPhase("listening")
    requestAnimationFrame(() => {
      audio.play().catch(() => {
        setHasPlayed(true)
        setPhase("typing")
        audioRef.current = null
      })
    })
  }, [audioUrl])

  const handleSubmit = useCallback(async () => {
    if (!userText.trim()) return
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current || endedAt).getTime()) / 1000)

    let result: TaskFeedback | null = null
    try {
      result = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "write_from_dictation", stimulus: sentence, response: userText }, { timeoutMs: 90000 })
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "write_from_dictation",
        stimulus: { kind: "audio", content: sentence },
        response: { kind: "text", content: userText },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current || new Date().toISOString(),
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [sentence, userText])

  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Write from Dictation</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteListening')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Write from Dictation</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.write-from-dictation.desc')}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              {t('practiceTask.write-from-dictation.idleDesc')}
            </p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {t('practiceTask.write-from-dictation.getSentence')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.write-from-dictation.generating')}</p>
          </div>
        )}

        {phase === "ready" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              {t('practiceTask.write-from-dictation.listenCarefully')}
            </p>
            <button onClick={playAudio}
              className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              {t('practiceTask.write-from-dictation.playSentence')}
            </button>
            <p className="mt-4 text-xs text-slate-400">{t('practiceTask.write-from-dictation.typingStartsAfter')}</p>
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
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">{t('practiceTask.common.passagePlaying')}</p>
            <p className="text-xs text-slate-400">{t('practiceTask.write-from-dictation.listenCarefully')}</p>
            <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
          </div>
        )}

        {phase === "typing" && (
          <div className="space-y-5">
            <div className="border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300 mb-1">{t('practiceTask.write-from-dictation.typeWhatYouHeard')}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">{t('practiceTask.write-from-dictation.doNotReplay')}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.write-from-dictation.yourTranscription')}</p>
                <span className="text-xs text-slate-400 tabular-nums">{wordCount} words</span>
              </div>
              <textarea
                value={userText}
                onChange={e => setUserText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                placeholder="Type the sentence here…"
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-7 text-[var(--foreground)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={3}
              />
              <p className="mt-1 text-xs text-slate-400">{t('practiceTask.write-from-dictation.pressEnter')}</p>
            </div>
            <div className="flex justify-between items-center">
              <button onClick={playAudio} disabled={hasPlayed}
                className="text-xs text-slate-400 disabled:opacity-40 hover:text-[var(--foreground)] disabled:cursor-not-allowed">
                {hasPlayed ? t('practiceTask.write-from-dictation.replayDisabled') : t('practiceTask.write-from-dictation.replayOnce')}
              </button>
              <button onClick={handleSubmit} disabled={!userText.trim()}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">
                {t('practiceTask.common.submit')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.write-from-dictation.checking')}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay feedback={feedback} stimulus={sentence} stimulusLabel={t('practiceTask.write-from-dictation.dictatedSentence')}
              responseText={userText} responseLabel={t('practiceTask.write-from-dictation.yourTranscription')} />
            <div className="flex gap-3 justify-center">
              <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                {t('practiceTask.common.tryAnother')}
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
