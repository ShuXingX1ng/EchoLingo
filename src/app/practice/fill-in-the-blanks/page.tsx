"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import { useTranslation } from "@/lib/i18n"
import {
  fillInTheBlanksFeedbackResponse,
  fillInTheBlanksFeedbackStimulus,
  parseFillInTheBlanks,
  splitPassage,
  type FillInTheBlanksStimulus,
} from "@/lib/structured-stimulus"

type ParsedStimulus = FillInTheBlanksStimulus

export default function FillInTheBlanksPage() {
  const { t } = useTranslation()
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [selections, setSelections] = useState<(string | null)[]>([])

  const parsedRef = useRef<ParsedStimulus | null>(null)
  const selectionsRef = useRef<(string | null)[]>([])
  useEffect(() => { parsedRef.current = parsed }, [parsed])
  useEffect(() => { selectionsRef.current = selections }, [selections])

  const { phase, stimulus, seconds, feedback, savedTask, error, generate, submit: handleSubmit } =
    usePracticeTaskRun("fill_in_the_blanks_reading", {
      buildSubmission: () => {
        const p = parsedRef.current
        if (!p || selectionsRef.current.every((s) => s === null)) return null
        return {
          feedbackStimulus: fillInTheBlanksFeedbackStimulus(p),
          feedbackResponse: fillInTheBlanksFeedbackResponse(p, selectionsRef.current),
        }
      },
    })
  const submittedResponse = savedTask?.response.content ?? ""

  // Parse the structured Stimulus when the run loads it
  useEffect(() => {
    if (!stimulus) return
    const p = parseFillInTheBlanks(stimulus)
    if (!p) return
    setParsed(p)
    setSelections(new Array(p.blanks.length).fill(null))
  }, [stimulus])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const allAnswered = parsed ? selections.every((s) => s !== null) : false
  const segments = parsed ? splitPassage(parsed.passage) : []

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">{t("practiceTask.fill-in-the-blanks.title")}</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteReading')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{t("practiceTask.fill-in-the-blanks.title")}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.fill-in-the-blanks.desc')}
          </p>
        </div>

        {(phase === "idle" || phase === "generating") && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.fill-in-the-blanks.generating')}</p>
          </div>
        )}

        {phase === "writing" && parsed && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.common.passage')}</p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                {timeStr}
              </span>
            </div>
            <div className="border border-[var(--border)] bg-[var(--surface)] p-6 leading-9 text-sm text-[var(--foreground)]">
              {segments.map((seg, i) => {
                if (seg.type === "text") return <span key={i}>{seg.value}</span>
                const blankIdx = parseInt(seg.value, 10)
                const blank = parsed.blanks[blankIdx]
                return (
                  <select
                    key={i}
                    value={selections[blankIdx] ?? ""}
                    onChange={e => {
                      const newSel = [...selections]
                      newSel[blankIdx] = e.target.value || null
                      setSelections(newSel)
                    }}
                    className="mx-1 inline-block rounded border border-emerald-400 bg-[var(--surface)] px-2 py-0.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">{t("practiceTask.common.chooseOption")}</option>
                    {blank.options.map((opt, oi) => (
                      <option key={oi} value={opt}>{opt}</option>
                    ))}
                  </select>
                )
              })}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {t("practiceTask.common.answered", { filled: selections.filter(Boolean).length, total: parsed.blanks.length })}
              </p>
              <button
                onClick={handleSubmit}
                disabled={!allAnswered}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {t('practiceTask.common.submitAnswers')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.fill-in-the-blanks.evaluating')}</p>
          </div>
        )}

        {phase === "done" && feedback && parsed && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={fillInTheBlanksFeedbackStimulus(parsed)}
              stimulusLabel={t('practiceTask.common.passage')}
              responseText={submittedResponse}
              responseLabel={t('practiceTask.fill-in-the-blanks.yourAnswers')}
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
