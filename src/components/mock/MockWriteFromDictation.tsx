"use client"

import { useTranslation } from "@/lib/i18n"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"
import type { PracticeTask } from "@/types"

export default function MockWriteFromDictation({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const {
    phase, seconds, error, savedTask: doneTask,
    userText, setText: setUserText, play: playAudio, submit: handleSubmit, emptyTask,
  } = usePracticeTaskRun("write_from_dictation", { mode: "mock" })

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 30
  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length

  const skipTask = () => onComplete(emptyTask())

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.writeFromDictation.generating")}</p>
        </div>
      )}

      {(phase === "ready" || phase === "listening") && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
            {t("mock.writeFromDictation.listenOnce")}
          </p>
          <button onClick={() => playAudio()}
            className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
            {t("mock.writeFromDictation.playSentence")}
          </button>
          <p className="mt-4 text-xs text-slate-400">{t("mock.writeFromDictation.typingStartsAfter")}</p>
        </div>
      )}

      {phase === "writing" && (
        <div className="space-y-4">
          <div className="border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300 mb-1">
                  {t("mock.writeFromDictation.typeWhatYouHeard")}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">{t("mock.writeFromDictation.doNotReplay")}</p>
              </div>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
                {timeStr}
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("mock.writeFromDictation.yourTranscription")}</p>
              <span className="text-xs text-slate-400 tabular-nums">{wordCount} words</span>
            </div>
            <textarea
              value={userText}
              onChange={e => setUserText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
              placeholder={t("mock.writeFromDictation.placeholder")}
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white p-4 text-sm leading-7 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 resize-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <button onClick={handleSubmit} disabled={!userText.trim()}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">
              {t("mock.common.submit")}
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.writeFromDictation.checking")}</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">{t("mock.common.aiFeedback")}</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
            {(doneTask.feedback?.strengths.length ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">{t("mock.common.strengths")}</p>
                <ul className="space-y-1">{doneTask.feedback!.strengths.map((s, i) => <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="text-emerald-500 shrink-0">+</span>{s}</li>)}</ul>
              </div>
            )}
            {(doneTask.feedback?.weaknesses.length ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">{t("mock.common.areasToImprove")}</p>
                <ul className="space-y-1">{doneTask.feedback!.weaknesses.map((w, i) => <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="text-red-400 shrink-0">–</span>{w}</li>)}</ul>
              </div>
            )}
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
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            {t("mock.common.skipTask")}
          </button>
        </div>
      )}
    </div>
  )
}
