"use client"

import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import CountdownRing from "@/components/CountdownRing"
import PronunciationFeedback from "@/components/PronunciationFeedback"
import { usePracticeTaskRunner } from "@/hooks/usePracticeTaskRunner"
import { useTranslation } from "@/lib/i18n"

const PREP_TIME = 35
const RECORD_TIME = 40
const MIN_REC_SECONDS = 5

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80
    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"
    : score >= 60
    ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800"
    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-sm font-semibold ${color}`}>
      {score}
    </span>
  )
}

export default function ReadAloudPage() {
  const { t } = useTranslation()
  const {
    phase, stimulus, seconds, error: errorMsg, feedback, transcript,
    recSeconds, canStop, startRecording, stopRecording, generate,
  } = usePracticeTaskRunner({
    taskType: "read_aloud",
    responseKind: "audio",
    prepTime: PREP_TIME,
    recordTime: RECORD_TIME,
    minRecSeconds: MIN_REC_SECONDS,
    withPronunciation: true,
    randomEndpoint: "/api/read-aloud/stimulus",
  })

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/" className="hover:text-[var(--foreground)]">{t("nav.home")}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Read Aloud</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            {t("practiceTask.common.pteSpeaking")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Read Aloud</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t("practiceTask.read-aloud.desc", { prepTime: String(PREP_TIME), recordTime: String(RECORD_TIME) })}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-[var(--text-secondary)] text-sm mb-8 max-w-sm mx-auto">
              {t("practiceTask.read-aloud.idleDesc")}
            </p>
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {t("practiceTask.read-aloud.generatePassage")}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t("practiceTask.common.generatingPassage")}</p>
          </div>
        )}

        {phase === "ready" && (
          <div className="space-y-6">
            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("practiceTask.common.preparation")}
                </p>
                <CountdownRing seconds={seconds} total={PREP_TIME} />
              </div>
              <p className="text-base sm:text-lg leading-8 text-[var(--foreground)] font-serif">{stimulus}</p>
            </div>
            <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
              <p>{t("practiceTask.common.recordingStartsAuto")}</p>
              <button
                onClick={startRecording}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
              >
                {t("practiceTask.common.startNow")}
              </button>
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                    {t("practiceTask.common.recording")}
                  </p>
                </div>
                <CountdownRing seconds={recSeconds} total={RECORD_TIME} size={72} />
              </div>
              <p className="text-base sm:text-lg leading-8 text-[var(--foreground)] font-serif">{stimulus}</p>
            </div>
            <div className="text-center">
              <button
                onClick={stopRecording}
                disabled={!canStop}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                </svg>
                {!canStop
                  ? t("practiceTask.common.holdOn", { sec: String(recSeconds - (RECORD_TIME - MIN_REC_SECONDS)) })
                  : t("practiceTask.common.stopRecording")}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-[var(--foreground)] mb-1">
              {t("practiceTask.read-aloud.analyzing")}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {t("practiceTask.read-aloud.analyzingSubtitle")}
            </p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <div className="border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">{t("practiceTask.common.passage")}</p>
              <p className="text-sm leading-7 text-[var(--text-secondary)] font-serif">{stimulus}</p>
            </div>

            {transcript && transcript !== "[transcript not captured]" && (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">{t("practiceTask.read-aloud.yourReading")}</p>
                <p className="text-sm leading-7 text-[var(--text-secondary)] italic">{transcript}</p>
              </div>
            )}

            {feedback.pronunciationAssessment && (
              <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-4">
                  {t("practiceTask.read-aloud.azurePronunciation")}
                </p>
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: t("pronunciation.overall"), score: feedback.pronunciationAssessment.score },
                    { label: t("pronunciation.accuracy"), score: feedback.pronunciationAssessment.accuracyScore },
                    { label: t("pronunciation.fluency"), score: feedback.pronunciationAssessment.fluencyScore },
                    { label: t("pronunciation.completeness"), score: feedback.pronunciationAssessment.completenessScore },
                  ].map(({ label, score }) => (
                    <div key={label} className="text-center">
                      <ScoreBadge score={score} />
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{label}</p>
                    </div>
                  ))}
                </div>
                <PronunciationFeedback assessment={feedback.pronunciationAssessment} />
              </div>
            )}

            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[4px_4px_0_rgba(15,23,42,0.08)] space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {t("practiceTask.common.aiFeedback")}
              </p>
              <p className="text-sm leading-7 text-[var(--foreground)]">{feedback.summary}</p>

              {feedback.details && feedback.details.taskType === "read_aloud" && (
                <div className="grid gap-4 sm:grid-cols-2 border-t border-[var(--border)] pt-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                      {t("practiceTask.read-aloud.oralFluency")}
                    </p>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{feedback.details.oralFluency}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                      {t("practiceTask.read-aloud.pronunciation")}
                    </p>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{feedback.details.pronunciation}</p>
                  </div>
                </div>
              )}

              {feedback.strengths.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400 mb-2">
                    {t("practiceTask.common.strengths")}
                  </p>
                  <ul className="space-y-1">
                    {feedback.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--foreground)]">
                        <span className="text-emerald-500 shrink-0">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.weaknesses.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600 dark:text-red-400 mb-2">
                    {t("practiceTask.common.areasToImprove")}
                  </p>
                  <ul className="space-y-1">
                    {feedback.weaknesses.map((w, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--foreground)]">
                        <span className="text-red-400 shrink-0">–</span>{w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.suggestions.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">
                    {t("practiceTask.common.suggestions")}
                  </p>
                  <ul className="space-y-1">
                    {feedback.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                        <span className="shrink-0 tabular-nums text-slate-400">{i + 1}.</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={generate}
                className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {t("practiceTask.common.practiceAgain")}
              </button>
              <Link
                href="/"
                className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--foreground)]"
              >
                {t("practiceTask.common.backToHome")}
              </Link>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{errorMsg}</p>
            <button
              onClick={generate}
              className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              {t("practiceTask.common.tryAgain")}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
