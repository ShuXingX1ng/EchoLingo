"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import type { SessionFeedback } from "@/types";
import ErrorAnnotations from "@/components/ErrorAnnotations";
import PronunciationFeedback from "@/components/PronunciationFeedback";

type FeedbackPanelProps = {
  feedback: SessionFeedback;
  title?: string;
  primaryActionHref: string;
  primaryActionLabel: string;
};

type FeedbackReviewProps = {
  feedback: SessionFeedback;
  title?: string;
  primaryActionHref?: string;
  primaryActionLabel?: string;
  containerClassName?: string;
  showFooter?: boolean;
};

function bandLevel(band: number, t: (key: string) => string) {
  if (band >= 7) return t("feedback.bandLevel.ready");
  if (band >= 6) return t("feedback.bandLevel.building");
  if (band >= 5) return t("feedback.bandLevel.strengthen");
  return t("feedback.bandLevel.foundation");
}

function getNextFocus(feedback: SessionFeedback) {
  const suggestions = feedback.improvementSuggestions.slice(0, 3);
  const weaknesses = feedback.weaknesses.slice(0, 3);
  const pronunciationWords =
    feedback.pronunciationAssessment?.words
      .filter((word) => word.errorType === "Mispronunciation" && word.score < 70)
      .map((word) => word.word)
      .slice(0, 4) ?? [];

  const focusParams = new URLSearchParams();
  if (weaknesses.length > 0) focusParams.set("focus", weaknesses.join(","));
  if (suggestions.length > 0) focusParams.set("suggestions", suggestions.join(","));

  const wordsParams = new URLSearchParams();
  if (pronunciationWords.length > 0) wordsParams.set("words", pronunciationWords.join(","));

  return {
    suggestions,
    weaknesses,
    pronunciationWords,
    drillHref: `/practice/setup${focusParams.toString() ? `?${focusParams}` : ""}`,
    shadowingHref: `/practice/shadowing${wordsParams.toString() ? `?${wordsParams}` : ""}`,
  };
}

export default function FeedbackPanel({
  feedback,
  title,
  primaryActionHref,
  primaryActionLabel,
}: FeedbackPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4">
      <FeedbackReview
        feedback={feedback}
        title={title}
        primaryActionHref={primaryActionHref}
        primaryActionLabel={primaryActionLabel}
        showFooter
        containerClassName="max-h-[92vh] shadow-2xl"
      />
    </div>
  );
}

export function FeedbackReview({
  feedback,
  title,
  primaryActionHref,
  primaryActionLabel,
  containerClassName = "",
  showFooter = false,
}: FeedbackReviewProps) {
  const { t } = useTranslation();
  const nextFocus = useMemo(() => getNextFocus(feedback), [feedback]);

  return (
    <div
      className={`w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950 ${containerClassName}`}
    >
      <div className="border-b border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
              {t("feedback.studyReview")}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
              {title || t("feedback.title")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t("feedback.reviewSubtitle")}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
              {t("feedback.estimatedBand")}
            </p>
            <p className="mt-1 text-4xl font-semibold text-emerald-700 dark:text-emerald-300">
              {feedback.estimatedBand}
            </p>
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
              {bandLevel(feedback.estimatedBand, t)}
            </p>
          </div>
        </div>
      </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[1.05fr_0.95fr] sm:p-6">
          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-950 dark:text-white">
                  {t("feedback.nextStudyPlan")}
                </h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {t("feedback.topPriorities")}
                </span>
              </div>
              <ol className="mt-4 space-y-3">
                {nextFocus.suggestions.map((item, index) => (
                  <li key={item} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6 text-slate-700 dark:text-slate-200">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href={nextFocus.drillHref}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
              >
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {t("feedback.actionDrill")}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
                  {t("feedback.actionDrillDesc")}
                </p>
              </Link>
              <Link
                href={nextFocus.shadowingHref}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10"
              >
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {t("feedback.actionShadowing")}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
                  {t("feedback.actionShadowingDesc")}
                </p>
              </Link>
            </div>

            {nextFocus.pronunciationWords.length > 0 && (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
                <h3 className="font-semibold text-cyan-950 dark:text-cyan-100">
                  {t("feedback.pronunciationQueue")}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {nextFocus.pronunciationWords.map((word) => (
                    <span
                      key={word}
                      className="rounded-full bg-white px-3 py-1 text-sm font-medium text-cyan-800 shadow-sm dark:bg-slate-900 dark:text-cyan-200"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <h3 className="font-semibold text-slate-950 dark:text-white">
                {t("feedback.whatWorked")}
              </h3>
              <ul className="mt-3 space-y-2">
                {feedback.strengths.slice(0, 3).map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                    <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="font-semibold text-amber-950 dark:text-amber-100">
                {t("feedback.focusAreas")}
              </h3>
              <ul className="mt-3 space-y-2">
                {nextFocus.weaknesses.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-6 text-amber-900 dark:text-amber-100">
                    <span className="mt-0.5">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-white/10 sm:p-6">
          <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-semibold text-slate-950 dark:text-white">
              {t("feedback.criteriaDetails")}
              <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">
                {t("feedback.expand")}
              </span>
              <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">
                {t("feedback.collapse")}
              </span>
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FeedbackSection title={t("feedback.fluency")} content={feedback.fluencyAndCoherence} />
              <FeedbackSection title={t("feedback.vocabulary")} content={feedback.lexicalResource} />
              <FeedbackSection title={t("feedback.grammar")} content={feedback.grammarRangeAndAccuracy} />
              <FeedbackSection title={t("feedback.pronunciation")} content={feedback.pronunciation} />
            </div>
          </details>

          {feedback.pronunciationAssessment && (
            <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <summary className="cursor-pointer list-none font-semibold text-slate-950 dark:text-white">
                {t("pronunciation.title")}
                <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">
                  {t("feedback.expand")}
                </span>
                <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">
                  {t("feedback.collapse")}
                </span>
              </summary>
              <div className="mt-4">
                <PronunciationFeedback assessment={feedback.pronunciationAssessment} />
              </div>
            </details>
          )}

          <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-semibold text-slate-950 dark:text-white">
              {t("feedback.sampleAnswer")}
              <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">
                {t("feedback.expand")}
              </span>
              <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">
                {t("feedback.collapse")}
              </span>
            </summary>
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-7 text-slate-700 dark:bg-white/5 dark:text-slate-200">
              {feedback.improvedSampleAnswer}
            </p>
          </details>

          {feedback.errorAnnotations && (
            <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <summary className="cursor-pointer list-none font-semibold text-slate-950 dark:text-white">
                {t("feedback.errorAnnotations")}
                <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">
                  {t("feedback.expand")}
                </span>
                <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">
                  {t("feedback.collapse")}
                </span>
              </summary>
              <ErrorAnnotations annotations={feedback.errorAnnotations} />
            </details>
          )}
        </div>

        {showFooter && primaryActionHref && primaryActionLabel && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:justify-end sm:p-6">
            <Link
              href="/history"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
            >
              {t("nav.history")}
            </Link>
            <Link
              href={primaryActionHref}
              className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {primaryActionLabel}
            </Link>
          </div>
        )}
    </div>
  );
}

function FeedbackSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{content}</p>
    </div>
  );
}
