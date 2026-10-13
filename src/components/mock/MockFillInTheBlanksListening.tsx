"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslation } from "@/lib/i18n"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import type { PracticeTask } from "@/types"
import {
  fillInTheBlanksFeedbackResponse,
  fillInTheBlanksFeedbackStimulus,
  parseFillInTheBlanks,
  splitPassage,
  type FillInTheBlanksStimulus,
} from "@/lib/structured-stimulus"

type ParsedStimulus = FillInTheBlanksStimulus

export default function MockFillInTheBlanksListening({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [selections, setSelections] = useState<(string | null)[]>([])

  const parsedRef = useRef<ParsedStimulus | null>(null)
  const selectionsRef = useRef<(string | null)[]>([])
  useEffect(() => { selectionsRef.current = selections }, [selections])
  useEffect(() => { parsedRef.current = parsed }, [parsed])

  const { phase, stimulus, seconds, error, savedTask: doneTask, play: playAudio, submit: handleSubmit, emptyTask } =
    usePracticeTaskRun("fill_in_the_blanks_listening", {
      mode: "mock",
      buildSubmission: () => {
        const p = parsedRef.current
        if (!p) return null
        return {
          feedbackStimulus: fillInTheBlanksFeedbackStimulus(p),
          feedbackResponse: fillInTheBlanksFeedbackResponse(p, selectionsRef.current),
        }
      },
    })

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

  const skipTask = () => onComplete(emptyTask())

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.common.generatingPassageAudio")}</p>
        </div>
      )}

      {phase === "ready" && (
        <div className="border border-slate-900 bg-white p-8 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-slate-900">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t("mock.fillBlanksListening.listenOnce")}
          </p>
          <button
            onClick={() => playAudio()}
            className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            {t("mock.common.playPassage")}
          </button>
          <p className="mt-4 text-xs text-slate-400">{t("mock.fillBlanksListening.blanksOpenAfter")}</p>
        </div>
      )}

      {phase === "listening" && (
        <div className="border border-slate-900 bg-white p-8 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("mock.common.passagePlaying")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("mock.fillBlanksListening.listenForWords")}</p>
        </div>
      )}

      {phase === "writing" && parsed && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("mock.common.selectCorrectWords")}</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>{timeStr}</span>
          </div>
          <div className="border border-slate-200 bg-white p-6 text-sm leading-9 text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
            {segments.map((seg, i) => {
              if (seg.type === "text") return <span key={i}>{seg.value}</span>
              const blankIndex = Number.parseInt(seg.value, 10)
              const blank = parsed.blanks[blankIndex]
              return (
                <select
                  key={i}
                  value={selections[blankIndex] ?? ""}
                  onChange={e => {
                    const next = [...selections]
                    next[blankIndex] = e.target.value || null
                    setSelections(next)
                  }}
                  className="mx-1 inline-block rounded border border-emerald-400 bg-white px-2 py-0.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">{t("mock.common.choose")}</option>
                  {blank.options.map((option, optionIndex) => <option key={optionIndex} value={option}>{option}</option>)}
                </select>
              )
            })}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">{t("mock.common.answered", { n: selections.filter(Boolean).length, total: parsed.blanks.length })}</p>
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              {t("mock.common.submitAnswers")}
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

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t("mock.common.aiFeedback")}</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
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
