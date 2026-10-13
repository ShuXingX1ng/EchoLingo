"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { useTranslation } from "@/lib/i18n"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import {
  highlightCorrectSummaryFeedbackResponse,
  highlightCorrectSummaryFeedbackStimulus,
  parseHighlightCorrectSummary,
  type HighlightCorrectSummaryStimulus,
} from "@/lib/structured-stimulus"

type ParsedStimulus = HighlightCorrectSummaryStimulus

export default function HighlightCorrectSummaryPage() {
  const { t } = useTranslation()
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const parsedRef = useRef<ParsedStimulus | null>(null)
  const selectedRef = useRef<number | null>(null)
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { parsedRef.current = parsed }, [parsed])

  const { phase, stimulus, seconds, feedback, error, hasPlayed, play: playPassage, previewStimulus, submit, generate } =
    usePracticeTaskRun("highlight_correct_summary", {
      buildSubmission: () => {
        const p = parsedRef.current
        if (!p || selectedRef.current === null) return null
        return {
          feedbackStimulus: highlightCorrectSummaryFeedbackStimulus(p),
          feedbackResponse: highlightCorrectSummaryFeedbackResponse(p, selectedRef.current),
        }
      },
    })

  // The learner submits a choice; only the time limit submits without one.
  const handleSubmit = () => {
    if (selected !== null) void submit()
  }

  // Parse the structured Stimulus when the run loads it
  useEffect(() => {
    if (!stimulus) return
    const p = parseHighlightCorrectSummary(stimulus)
    if (!p) return
    setParsed(p)
    setSelected(null)
  }, [stimulus])

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
          <span className="text-[var(--foreground)] font-medium">{t("practiceTask.highlight-correct-summary.title")}</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteListening')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{t("practiceTask.highlight-correct-summary.title")}</h1>
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

        {phase === "ready" && (
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

        {(phase === "listening" || phase === "writing") && parsed && (
          <div className="space-y-5">
            {phase === "listening" && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
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
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 ml-2">{t('practiceTask.common.passagePlaying')}</p>
                </div>
                <p className="text-xs text-[var(--text-muted)]">{t('practiceTask.highlight-correct-summary.listenTimer')}</p>
                <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
              </div>
            )}
            {phase === "writing" && (
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.highlight-correct-summary.selectSummary')}</p>
                <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                  {timeStr}
                </span>
              </div>
            )}

            <div className="border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">
                {t('practiceTask.highlight-correct-summary.whichSummary')}
              </p>
              {parsed.summaries.map((s, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 ${phase === "listening" ? "cursor-default opacity-70" : "cursor-pointer"} rounded-lg border p-3 transition-all ${
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
                    onChange={() => phase === "writing" && setSelected(i)}
                    disabled={phase === "listening"}
                    className="mt-0.5 shrink-0 accent-emerald-600"
                  />
                  <span className="text-sm text-[var(--foreground)]">
                    <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>{s}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between">
              {hasPlayed && (
                <button
                  onClick={previewStimulus}
                  className="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 underline"
                >
                  {t('practiceTask.highlight-correct-summary.replayPassage')}
                </button>
              )}
              {phase === "writing" && (
                <button
                  onClick={handleSubmit}
                  disabled={selected === null}
                  className="ml-auto rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
                >
                  {t('practiceTask.common.submitAnswer')}
                </button>
              )}
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
              stimulus={highlightCorrectSummaryFeedbackStimulus(parsed)}
              stimulusLabel={t('practiceTask.highlight-correct-summary.passageSummaries')}
              responseText={highlightCorrectSummaryFeedbackResponse(parsed, selected)}
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
