"use client"

import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { usePracticeTaskRunner } from "@/hooks/usePracticeTaskRunner"
import { useTranslation } from "@/lib/i18n"

const TIME_LIMIT = 600

export default function SummarizeWrittenTextPage() {
  const { t } = useTranslation()
  const {
    phase, stimulus, seconds, error, feedback,
    userText, setText, submit, generate,
  } = usePracticeTaskRunner({
    taskType: "summarize_written_text",
    responseKind: "text",
    timeLimit: TIME_LIMIT,
  })

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Summarize Written Text</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteWriting')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Summarize Written Text</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.summarize-written-text.desc')}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">{t('practiceTask.summarize-written-text.idleDesc')}</p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {t('practiceTask.summarize-written-text.generatePassage')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.common.generatingPassage')}</p>
          </div>
        )}

        {phase === "writing" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.common.passage')}</p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                {timeStr}
              </span>
            </div>
            <div className="border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm leading-8 text-[var(--foreground)] font-serif">{stimulus}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.summarize-written-text.yourSummary')}</p>
                <span className={`text-xs tabular-nums ${wordCount > 75 ? "text-red-500" : wordCount >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                  {wordCount} / 5–75 words
                </span>
              </div>
              <textarea
                value={userText}
                onChange={e => setText(e.target.value)}
                placeholder={t('practiceTask.summarize-written-text.summaryPlaceholder')}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-7 text-[var(--foreground)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={4}
              />
              <p className="mt-1 text-xs text-slate-400">{t('practiceTask.summarize-written-text.summaryHint')}</p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => submit()} disabled={!userText.trim()}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">
                {t('practiceTask.common.submit')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.summarize-written-text.evaluating')}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay feedback={feedback} stimulus={stimulus} stimulusLabel={t('practiceTask.common.passage')}
              responseText={userText} responseLabel={t('practiceTask.summarize-written-text.yourSummary')} />
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
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">{t('practiceTask.common.tryAgain')}</button>
          </div>
        )}
      </main>
    </div>
  )
}
