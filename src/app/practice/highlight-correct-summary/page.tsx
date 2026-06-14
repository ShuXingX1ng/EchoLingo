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

const TIME_LIMIT = 300 // 5 minutes

type ParsedStimulus = {
  passage: string
  summaries: string[]
  correct: number
}
type Phase = "idle" | "generating" | "ready" | "listening" | "selecting" | "processing" | "done" | "error"

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as {
      passage?: unknown; summaries?: unknown; correct?: unknown
    }
    if (
      typeof parsed.passage !== "string" ||
      !Array.isArray(parsed.summaries) ||
      parsed.summaries.length !== 5 ||
      typeof parsed.correct !== "number"
    ) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function buildStimulusForFeedback(p: ParsedStimulus): string {
  const opts = p.summaries.map((s, i) => `${String.fromCharCode(65 + i)}. ${s}${i === p.correct ? " ✓" : ""}`).join("\n")
  return `Passage:\n${p.passage}\n\nSummary options:\n${opts}`
}

function buildResponseForFeedback(p: ParsedStimulus, selected: number): string {
  const letter = String.fromCharCode(65 + selected)
  const correctLetter = String.fromCharCode(65 + p.correct)
  const isCorrect = selected === p.correct
  if (isCorrect) {
    return `Selected: ${letter}. ${p.summaries[selected]} ✓ (correct)`
  }
  return `Selected: ${letter}. ${p.summaries[selected]} ✗ (incorrect — correct answer: ${correctLetter}. ${p.summaries[p.correct]})`
}

export default function HighlightCorrectSummaryPage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [rawStimulus, setRawStimulus] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    if (phase !== "selecting") return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); submitRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  const generate = useCallback(async () => {
    setPhase("generating")
    setError(""); setFeedback(null); setSelected(null); setSeconds(TIME_LIMIT)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      const raw = await loadStimulusText({ taskType: "highlight_correct_summary" })
      const p = parseStimulus(raw)
      if (!p) throw new Error("Invalid stimulus format from server")

      const blob = await apiPostBlob("/api/tts", { text: p.passage, voice: "en-US-AriaNeural", rate: 0.85 })
      const url = URL.createObjectURL(blob)

      setRawStimulus(raw)
      setParsed(p)
      setAudioUrl(url)
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate")
      setPhase("error")
    }
  }, [audioUrl])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generate() }, [])

  const playPassage = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.onended = () => {
      setPhase("selecting")
      startedAtRef.current = new Date().toISOString()
      setSeconds(TIME_LIMIT)
    }
    setPhase("listening")
    audio.play().catch(() => {
      setPhase("ready")
      audioRef.current = null
    })
  }, [audioUrl])

  const handleSubmit = useCallback(async () => {
    if (parsed === null || selected === null) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000,
    )

    const stimulusForFeedback = buildStimulusForFeedback(parsed)
    const responseForFeedback = buildResponseForFeedback(parsed, selected)

    let result: TaskFeedback | null = null
    try {
      result = await apiPost<TaskFeedback>("/api/pte/feedback", {
        taskType: "highlight_correct_summary",
        stimulus: stimulusForFeedback,
        response: responseForFeedback,
      })
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? {
      summary: "Feedback unavailable.",
      strengths: [],
      weaknesses: [],
      suggestions: [],
    }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "highlight_correct_summary",
        stimulus: { kind: "audio", content: rawStimulus },
        response: { kind: "text", content: responseForFeedback },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [parsed, selected, rawStimulus])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Highlight Correct Summary</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteListening')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Highlight Correct Summary</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.highlight-correct-summary.desc')}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">
              {t('practiceTask.highlight-correct-summary.idleDesc')}
            </p>
            <button
              onClick={generate}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {t('practiceTask.highlight-correct-summary.getQuestion')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.highlight-correct-summary.generating')}</p>
          </div>
        )}

        {phase === "ready" && audioUrl && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              {t('practiceTask.common.passageReady')}
            </p>
            <button
              onClick={playPassage}
              className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 mb-4"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              {t('practiceTask.common.playPassage')}
            </button>
            <p className="text-xs text-[var(--text-muted)]">
              {t('practiceTask.highlight-correct-summary.afterPassage')}
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
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">{t('practiceTask.common.passagePlaying')}</p>
            <p className="text-xs text-[var(--text-muted)]">{t('practiceTask.highlight-correct-summary.listenTimer')}</p>
            <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
          </div>
        )}

        {phase === "selecting" && parsed && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.highlight-correct-summary.selectSummary')}</p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                {timeStr}
              </span>
            </div>

            <div className="border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">
                {t('practiceTask.highlight-correct-summary.whichSummary')}
              </p>
              {parsed.summaries.map((s, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-all ${
                    selected === i
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--foreground)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="hcs-option"
                    value={i}
                    checked={selected === i}
                    onChange={() => setSelected(i)}
                    className="mt-0.5 shrink-0 accent-emerald-600"
                  />
                  <span className="text-sm text-[var(--foreground)]">
                    <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>{s}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between">
              {audioUrl && (
                <button
                  onClick={playPassage}
                  className="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 underline"
                >
                  {t('practiceTask.highlight-correct-summary.replayPassage')}
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={selected === null}
                className="ml-auto rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {t('practiceTask.common.submitAnswer')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.highlight-correct-summary.evaluating')}</p>
          </div>
        )}

        {phase === "done" && feedback && parsed && selected !== null && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={buildStimulusForFeedback(parsed)}
              stimulusLabel={t('practiceTask.highlight-correct-summary.passageSummaries')}
              responseText={buildResponseForFeedback(parsed, selected)}
              responseLabel={t('practiceTask.highlight-correct-summary.yourAnswer')}
            />
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
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              {t('practiceTask.common.tryAgain')}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
