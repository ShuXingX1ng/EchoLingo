"use client"

import { useTranslation } from "@/lib/i18n"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import type { PracticeTask } from "@/types"
import CountdownRing from "@/components/CountdownRing"
import { speechEvaluationOf, speechScores } from "@/lib/speech-evaluation"

export default function MockRepeatSentence({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const {
    phase, stimulus: sentence, timer, error: errorMsg, savedTask: doneTask,
    recSeconds, play: playAndRecord, emptyTask,
  } = usePracticeTaskRun("repeat_sentence", { mode: "mock" })
  const speechEvaluation = speechEvaluationOf(doneTask?.feedback)

  const skipTask = () => onComplete(emptyTask())

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.repeatSentence.generating")}</p>
        </div>
      )}

      {(phase === "ready" || phase === "listening") && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
            {t("mock.repeatSentence.instruction")}
          </p>
          <button onClick={() => playAndRecord()}
            className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
            {t("mock.repeatSentence.playAndRecord")}
          </button>
          <p className="mt-4 text-xs text-slate-400">{t("mock.repeatSentence.autoRecord")}</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="border-2 border-red-400 bg-white p-8 dark:bg-slate-900 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
              {t("mock.repeatSentence.recordingPhase")}
            </p>
          </div>
          <CountdownRing seconds={recSeconds} total={timer.recordSeconds} size={80} />
          <p className="mt-4 text-xs text-slate-400">{t("mock.common.recordingStopsAuto")}</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.repeatSentence.analyzing")}</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">{t("mock.repeatSentence.originalSentence")}</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-300 italic">{sentence}</p>
          </div>
          {speechEvaluation && (
            <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-3">{t("mock.repeatSentence.pronunciationScores")}</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {speechScores(speechEvaluation).map(({ labelKey, score: val }) => (
                  <div key={labelKey}>
                    <span className={`inline-block rounded border px-2 py-0.5 text-sm font-semibold ${val >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" : val >= 60 ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"}`}>{val}</span>
                    <p className="mt-1 text-xs text-slate-500">{t(labelKey)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">{t("mock.common.aiFeedback")}</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              {t("mock.common.continueNext")}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{errorMsg}</p>
          <button onClick={skipTask}
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            {t("mock.common.skipTask")}
          </button>
        </div>
      )}
    </div>
  )
}
