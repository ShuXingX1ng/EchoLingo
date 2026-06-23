"use client"

import { useEffect } from "react"
import { usePracticeTaskRunner } from "@/hooks/usePracticeTaskRunner"
import CountdownRing from "@/components/CountdownRing"
import { useTranslation } from "@/lib/i18n"
import type { PracticeTask } from "@/types"

const PREP_TIME = 35
const RECORD_TIME = 40

export default function MockReadAloud({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const {
    phase, stimulus, seconds, error: errorMsg, savedTask,
    recSeconds, canStop, startRecording, stopRecording, generate,
  } = usePracticeTaskRunner({
    taskType: "read_aloud",
    responseKind: "audio",
    prepTime: PREP_TIME,
    recordTime: RECORD_TIME,
    withPronunciation: true,
  })

  useEffect(() => {
    if (phase === "done" && savedTask) onComplete(savedTask)
  }, [phase, savedTask, onComplete])

  const skipTask = () => onComplete({
    id: `mock_${Date.now()}`,
    taskType: "read_aloud",
    stimulus: { kind: "text", content: stimulus },
    response: { kind: "audio", content: "" },
    durationSeconds: 0,
    createdAt: new Date().toISOString(),
  })

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.common.generatingPassage")}</p>
        </div>
      )}

      {phase === "ready" && (
        <div className="space-y-4">
          <div className="border border-slate-900 bg-white p-6 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("mock.common.preparation")}</p>
              <CountdownRing seconds={seconds} total={PREP_TIME} />
            </div>
            <p className="text-base leading-8 text-slate-900 dark:text-white font-serif">{stimulus}</p>
          </div>
          <p className="text-xs text-slate-400 text-center">{t("mock.common.recordingStartsAuto")}</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="space-y-4">
          <div className="border-2 border-red-400 bg-white p-6 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">{t("mock.common.recording")}</p>
              </div>
              <CountdownRing seconds={recSeconds} total={RECORD_TIME} size={64} />
            </div>
            <p className="text-base leading-8 text-slate-900 dark:text-white font-serif">{stimulus}</p>
          </div>
          <div className="text-center">
            <button
              onClick={stopRecording}
              disabled={!canStop}
              className="rounded-xl border-2 border-red-500 px-6 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("practiceTask.common.stopRecording")}
            </button>
          </div>
          <p className="text-xs text-slate-400 text-center">{t("mock.readAloud.instruction")}</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.readAloud.analyzing")}</p>
        </div>
      )}

      {/* done: onComplete fires via useEffect */}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{errorMsg}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              {t("mock.common.retry")}
            </button>
            <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
              {t("mock.common.skipTask")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
