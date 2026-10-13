"use client"

import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import CountdownRing from "@/components/CountdownRing"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { useTranslation } from "@/lib/i18n"
import { usePracticeTaskRun } from "@/hooks/usePracticeTaskRun"

export default function AnswerShortQuestionPage() {
  const { t } = useTranslation()
  const {
    phase, stimulus: question, answer: correctAnswer, seconds: countSec, timer,
    feedback, error, transcript, recSeconds, stopRecording, generate,
  } = usePracticeTaskRun("answer_short_question")

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">{t("practiceTask.answer-short-question.title")}</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteSpeaking')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{t("practiceTask.answer-short-question.title")}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.answer-short-question.desc', { recordTime: String(timer.recordSeconds) })}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">
              {t('practiceTask.answer-short-question.idleDesc')}
            </p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {t('practiceTask.answer-short-question.getQuestion')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.answer-short-question.generatingQuestion')}</p>
          </div>
        )}

        {phase === "listening" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 shadow-[6px_6px_0_rgba(15,23,42,0.08)] space-y-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-[0.18em]">
                {t('practiceTask.answer-short-question.listeningToQuestion')}
              </p>
            </div>
            {question && (
              <div className="border-t border-[var(--border)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">Question</p>
                <p className="text-lg font-semibold text-[var(--foreground)] leading-relaxed">{question}</p>
              </div>
            )}
          </div>
        )}

        {phase === "prep" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">Question</p>
            <p className="text-xl font-semibold text-[var(--foreground)] leading-relaxed mb-6">{question}</p>
            <div className="flex flex-col items-center gap-2">
              <CountdownRing seconds={countSec} total={timer.prepSeconds} size={56} />
              <p className="text-xs text-slate-400">{t('practiceTask.answer-short-question.recordingStartsAuto')}</p>
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">{t('practiceTask.common.recording')}</p>
              </div>
              <p className="text-xl font-semibold text-[var(--foreground)] mb-6">{question}</p>
              <CountdownRing seconds={recSeconds} total={timer.recordSeconds} size={72} />
            </div>
            <div className="text-center">
              <button onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
                {t('practiceTask.common.stopRecording')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.answer-short-question.checking')}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            {correctAnswer && (
              <div className="border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300 mb-1">{t('practiceTask.answer-short-question.modelAnswer')}</p>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{correctAnswer}</p>
              </div>
            )}
            <TaskFeedbackDisplay feedback={feedback} stimulus={question} stimulusLabel={t('practiceTask.answer-short-question.question')}
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined} responseLabel={t('practiceTask.answer-short-question.yourAnswer')} />
            <div className="flex gap-3 justify-center">
              <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                {t('practiceTask.answer-short-question.nextQuestion')}
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
