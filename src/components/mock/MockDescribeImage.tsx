"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useTranslation } from "@/lib/i18n"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import type { PracticeTask } from "@/types"
import CountdownRing from "./CountdownRing"

export default function MockDescribeImage({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const {
    phase, image, seconds: prepSec, timer, error: errorMsg, savedTask: doneTask,
    recSeconds, emptyTask,
  } = usePracticeTaskRun("describe_image", { mode: "mock" })

  const [imageError, setImageError] = useState(false)
  const imageUrl = image?.url
  useEffect(() => { setImageError(false) }, [imageUrl])

  const skipTask = () => onComplete(emptyTask())

  return (
    <div className="space-y-5">
      {phase === "prep" && image && (
        <div className="space-y-4">
          <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("mock.common.preparation")}</p>
              <CountdownRing seconds={prepSec} total={timer.prepSeconds} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{image.topic}</p>
            {imageError ? (
              <div className="flex items-center justify-center h-48 bg-slate-100 dark:bg-slate-800 text-sm text-slate-500">
                {t("mock.common.imageFailedToLoad")}
              </div>
            ) : (
              <div className="relative w-full" style={{ minHeight: 200 }}>
                <Image src={image.url} alt={image.topic} width={640} height={400}
                  className="w-full h-auto object-contain" onError={() => setImageError(true)} unoptimized />
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 text-center">{t("mock.common.recordingStartsAuto")}</p>
        </div>
      )}

      {phase === "recording" && image && (
        <div className="space-y-4">
          <div className="border-2 border-red-400 bg-white p-5 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">{t("mock.common.recording")}</p>
              </div>
              <CountdownRing seconds={recSeconds} total={timer.recordSeconds} size={64} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{image.topic}</p>
            {imageError ? (
              <div className="flex items-center justify-center h-48 bg-slate-100 dark:bg-slate-800 text-sm text-slate-500">
                {t("mock.common.imageFailedToLoad")}
              </div>
            ) : (
              <div className="relative w-full" style={{ minHeight: 200 }}>
                <Image src={image.url} alt={image.topic} width={640} height={400}
                  className="w-full h-auto object-contain" onError={() => setImageError(true)} unoptimized />
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 text-center">{t("mock.describeImage.instruction")}</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.describeImage.analyzing")}</p>
        </div>
      )}

      {phase === "done" && doneTask && image && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">{t("mock.common.image")}</p>
            <p className="text-xs text-slate-500 mb-2">{image.topic}</p>
            {!imageError && (
              <div className="relative w-full">
                <Image src={image.url} alt={image.topic} width={400} height={250}
                  className="w-full h-auto object-contain max-h-40" unoptimized />
              </div>
            )}
          </div>
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
          <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            {t("mock.common.skipTask")}
          </button>
        </div>
      )}
    </div>
  )
}
