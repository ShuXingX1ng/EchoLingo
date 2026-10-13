"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import { useTranslation } from "@/lib/i18n"
import {
  multipleChoiceFeedbackResponse,
  multipleChoiceFeedbackStimulus,
  parseMultipleChoice,
  type MultipleChoiceStimulus,
} from "@/lib/structured-stimulus"

type ParsedStimulus = MultipleChoiceStimulus

export default function MultipleChoicePage() {
  const { t } = useTranslation()
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const parsedRef = useRef<ParsedStimulus | null>(null)
  const selectedRef = useRef<number | null>(null)
  useEffect(() => { parsedRef.current = parsed }, [parsed])
  useEffect(() => { selectedRef.current = selected }, [selected])

  const { phase, stimulus, seconds, feedback, savedTask, error, generate, submit: handleSubmit } =
    usePracticeTaskRun("multiple_choice_reading", {
      buildSubmission: () => {
        const p = parsedRef.current
        if (!p) return null
        if (selectedRef.current === null) return null
        return {
          feedbackStimulus: multipleChoiceFeedbackStimulus(p),
          feedbackResponse: multipleChoiceFeedbackResponse(p, selectedRef.current),
        }
      },
    })
  const submittedResponse = savedTask?.response.content ?? ""

  // Parse the structured Stimulus when the run loads it
  useEffect(() => {
    if (!stimulus) return
    const p = parseMultipleChoice(stimulus)
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
          <span className="text-[var(--foreground)] font-medium">{t("practiceTask.multiple-choice.title")}</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteReading')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{t("practiceTask.multiple-choice.title")}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.multiple-choice.desc')}
          </p>
        </div>

        {(phase === "idle" || phase === "generating") && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.multiple-choice.generating')}</p>
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
            <div className="border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm leading-8 text-[var(--foreground)]">{parsed.passage}</p>
            </div>

            <div className="border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
              <p className="text-sm font-semibold text-[var(--foreground)] leading-7">{parsed.question}</p>
              <div className="space-y-2">
                {parsed.options.map((opt, i) => (
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
                      name="mc-option"
                      value={i}
                      checked={selected === i}
                      onChange={() => setSelected(i)}
                      className="mt-0.5 shrink-0 accent-emerald-600"
                    />
                    <span className="text-sm text-[var(--foreground)]">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={selected === null}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {t('practiceTask.common.submitAnswer')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.multiple-choice.evaluating')}</p>
          </div>
        )}

        {phase === "done" && feedback && parsed && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={multipleChoiceFeedbackStimulus(parsed)}
              stimulusLabel={t('practiceTask.multiple-choice.passageQuestion')}
              responseText={submittedResponse}
              responseLabel={t('practiceTask.multiple-choice.yourAnswer')}
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
