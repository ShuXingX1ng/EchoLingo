"use client"

import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import CountdownRing from "@/components/CountdownRing"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { useTranslation } from "@/lib/i18n"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"

export default function PersonalIntroPage() {
  const { t } = useTranslation()
  const {
    phase, stimulus, seconds: prepSec, timer, feedback, error, transcript,
    recSeconds, canStop, stopRecording, startNow: handleStartNow, generate,
  } = usePracticeTaskRun("personal_intro")

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">{t("practiceTask.personal-intro.title")}</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteSpeaking')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{t("practiceTask.personal-intro.title")}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.personal-intro.desc', { prepTime: String(timer.prepSeconds), recordTime: String(timer.recordSeconds) })}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <div className="mb-6 rounded-lg bg-[var(--background)] p-4 text-sm leading-7 text-[var(--text-secondary)] text-left font-serif">
              {t('practiceTask.personal-intro.fixedPrompt')}
            </div>
            <button onClick={generate}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {t('practiceTask.personal-intro.imReady')}
            </button>
          </div>
        )}

        {phase === "prep" && (
          <div className="space-y-6">
            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.personal-intro.prepare')}</p>
                <CountdownRing seconds={prepSec} total={timer.prepSeconds} />
              </div>
              <p className="text-base leading-8 text-[var(--foreground)] font-serif">{t('practiceTask.personal-intro.fixedPrompt')}</p>
            </div>
            <div className="text-center">
              <button onClick={handleStartNow}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--foreground)]">
                {t('practiceTask.personal-intro.startSpeakingNow')}
              </button>
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">{t('practiceTask.common.recording')}</p>
                </div>
                <CountdownRing seconds={recSeconds} total={timer.recordSeconds} size={72} />
              </div>
              <p className="text-base leading-8 text-[var(--foreground)] font-serif">{t('practiceTask.personal-intro.fixedPrompt')}</p>
            </div>
            <div className="text-center">
              <button onClick={stopRecording}
                disabled={!canStop}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent">
                {!canStop
                  ? t('practiceTask.common.holdOn', { sec: String(recSeconds - (timer.recordSeconds - timer.minRecSeconds)) })
                  : t('practiceTask.common.stopRecording')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.personal-intro.generatingFeedback')}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay feedback={feedback} stimulus={stimulus} stimulusLabel={t('practiceTask.personal-intro.prompt')}
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined} responseLabel={t('practiceTask.personal-intro.yourIntroduction')} />
            <div className="flex gap-3 justify-center">
              <button onClick={generate}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                {t('practiceTask.common.tryAgain')}
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
