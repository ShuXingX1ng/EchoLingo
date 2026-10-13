"use client"

import { useTranslation } from "@/lib/i18n"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import type { PracticeTask } from "@/types"
import CountdownRing from "./CountdownRing"

export default function MockPersonalIntro({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const {
    phase, stimulus, seconds: prepSec, timer, savedTask: doneTask, recSeconds, emptyTask,
  } = usePracticeTaskRun("personal_intro", { mode: "mock" })

  const skipTask = () => onComplete(emptyTask())

  return (
    <div className="space-y-5">
      <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2">{t("mock.common.taskPrompt")}</p>
        <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{stimulus}</p>
      </div>

      {phase === "prep" && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-4">{t("mock.common.preparation")}</p>
          <CountdownRing seconds={prepSec} total={timer.prepSeconds} size={80} />
          <p className="mt-4 text-xs text-slate-400">{t("mock.common.recordingStartsAuto")}</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="border-2 border-red-400 bg-white p-8 dark:bg-slate-900 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
              {t("mock.personalIntro.recordingPhase")}
            </p>
          </div>
          <CountdownRing seconds={recSeconds} total={timer.recordSeconds} size={80} />
          <p className="mt-4 text-xs text-slate-400">{t("mock.common.recordingStopsAuto")}</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.personalIntro.processing")}</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-3">{t("mock.common.feedback")}</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
            {(doneTask.feedback?.strengths.length ?? 0) > 0 && (
              <div className="mt-3 border-t border-slate-100 dark:border-white/10 pt-3">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">{t("mock.common.strengths")}</p>
                <ul className="space-y-1">
                  {doneTask.feedback!.strengths.map((s, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span className="text-emerald-500 shrink-0">+</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {t("mock.common.continueNext")}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{t("mock.common.micFailed")}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            {t("mock.common.skipTask")}
          </button>
        </div>
      )}
    </div>
  )
}
