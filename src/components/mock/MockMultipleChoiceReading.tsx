"use client"

import { useState, useRef, useEffect } from "react"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import { useTranslation } from "@/lib/i18n"
import {
  multipleChoiceFeedbackResponse,
  multipleChoiceFeedbackStimulus,
  parseMultipleChoice,
  type MultipleChoiceStimulus,
} from "@/lib/structured-stimulus"
import type { PracticeTask } from "@/types"

type ParsedStimulus = MultipleChoiceStimulus

export default function MockMultipleChoiceReading({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const parsedRef = useRef<ParsedStimulus | null>(null)
  const selectedRef = useRef<number | null>(null)
  useEffect(() => { parsedRef.current = parsed }, [parsed])
  useEffect(() => { selectedRef.current = selected }, [selected])

  const { phase, stimulus, seconds, savedTask, error, submit: handleSubmit, emptyTask } =
    usePracticeTaskRun("multiple_choice_reading", {
      mode: "mock",
      buildSubmission: () => {
        const p = parsedRef.current
        if (!p) return null
        return {
          feedbackStimulus: multipleChoiceFeedbackStimulus(p),
          feedbackResponse: multipleChoiceFeedbackResponse(p, selectedRef.current),
        }
      },
    })

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

  const skipTask = () => onComplete(emptyTask())

  return (
    <div className="space-y-5">
      {(phase === "idle" || phase === "generating") && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.multipleChoice.generating")}</p>
        </div>
      )}

      {phase === "writing" && parsed && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("mock.common.passage")}</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>{timeStr}</span>
          </div>
          <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <p className="text-sm leading-8 text-slate-800 dark:text-slate-100">{parsed.passage}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 space-y-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-7">{parsed.question}</p>
            <div className="space-y-2">
              {parsed.options.map((opt, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-all ${
                    selected === i
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600"
                      : "border-slate-200 bg-white hover:border-slate-400 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/30"
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
                  <span className="text-sm text-slate-800 dark:text-slate-100">{opt}</span>
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
              {t("mock.common.submitAnswer")}
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.common.evaluating")}</p>
        </div>
      )}

      {phase === "done" && savedTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t("mock.common.aiFeedback")}</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{savedTask.feedback?.summary}</p>
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(savedTask)} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              {t("mock.common.continueNext")}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300">
            {t("mock.common.skipTask")}
          </button>
        </div>
      )}
    </div>
  )
}
