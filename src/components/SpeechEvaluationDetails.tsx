"use client";

import { useState } from "react";
import type {
  PracticeItem,
  SpeechEvaluationFailure,
  SpeechEvaluationResult,
  SpeechScoreScale,
  WordEvidence,
} from "@/types";
import { useTranslation } from "@/lib/i18n";
import {
  evidenceNoticeKey,
  scoreShare,
  speechErrorKey,
} from "@/lib/speech-evaluation";
import {
  annotatedWords,
  isSelectable,
  practiceItemText,
  wordIssues,
  type AnnotatedWord,
  type BetweenWords,
} from "@/lib/speech-annotation";

interface SpeechEvaluationDetailsProps {
  evaluation: SpeechEvaluationResult;
}

// Badges keep the 80% / 60% cut-offs of the Feedback dimension badges, as a
// share of the provider's scale (80 / 60 on 0–100, 74 / 58 on 10–90).
function badgeColor(score: number, scale: SpeechScoreScale) {
  const share = scoreShare(score, scale);
  if (share >= 0.8) return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800";
  if (share >= 0.6) return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800";
  return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
}

const UNAVAILABLE_BADGE = "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700";

/** One score on its provider's scale; a dash when the evidence could not support it. */
export function SpeechScoreBadge({ score, scale }: { score: number | null; scale: SpeechScoreScale }) {
  const { t } = useTranslation();
  const color = score === null ? UNAVAILABLE_BADGE : badgeColor(score, scale);
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-sm font-semibold ${color}`}
      title={score === null ? t("speechEvaluation.unavailable") : undefined}
    >
      {score ?? "—"}
    </span>
  );
}

/** A recording whose evaluation failed: said plainly, never replaced by another provider. */
export function SpeechEvaluationErrorNotice({ error }: { error: SpeechEvaluationFailure }) {
  const { t } = useTranslation();
  return (
    <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
      <p className="font-medium">{t("speechEvaluation.failed")}</p>
      <p className="mt-1 text-xs opacity-80">{t(speechErrorKey(error.code))}</p>
    </div>
  );
}

const WORD_STYLES: Record<WordEvidence["status"], string> = {
  correct: "text-[var(--foreground)]",
  mispronounced: "bg-red-50 text-red-700 underline decoration-red-400 decoration-2 underline-offset-4 dark:bg-red-900/30 dark:text-red-300",
  omitted: "text-slate-400 line-through dark:text-slate-500",
  inserted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  not_scored: "text-slate-400 italic dark:text-slate-500",
}

const SLOW_STYLE = "underline decoration-dotted decoration-amber-500 decoration-2 underline-offset-4"
const PAUSE_STYLE = "font-sans text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400"
const INSERTED_STYLE = "font-sans rounded bg-emerald-50 px-1 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"

function Between({ next }: { next: BetweenWords }) {
  const { t } = useTranslation();
  if (next.kind === "pause") {
    return (
      <span className={PAUSE_STYLE} title={t(next.atSentenceBoundary
        ? "speechEvaluation.issue.pauseBetweenSentences"
        : "speechEvaluation.issue.pause", { seconds: next.seconds })}>
        ‖ {next.seconds}s
      </span>
    );
  }
  return (
    <span className={INSERTED_STYLE} title={t("speechEvaluation.issue.insertedAfter", { heard: next.heard })}>
      +{next.heard}
    </span>
  );
}

/** The few practice items FastAPI chose, most important first. */
function PracticeSummary({ items }: { items: PracticeItem[] }) {
  const { t } = useTranslation();
  return (
    <div className="border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
      <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-200">{t("speechEvaluation.practice.title")}</p>
      <ol className="space-y-1">
        {items.map((item, index) => {
          const { key, params } = practiceItemText(item);
          return (
            <li key={item.kind} className="flex gap-2 text-sm text-amber-900 dark:text-amber-200">
              <span className="shrink-0 tabular-nums opacity-60">{index + 1}.</span>{t(key, params)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function WordDetail({ word }: { word: AnnotatedWord }) {
  const { t } = useTranslation();
  const issues = wordIssues(word);
  return (
    <div className="border border-[var(--border)] bg-[var(--background)] p-3 text-sm" aria-live="polite">
      <p className="font-medium text-[var(--foreground)]">
        &ldquo;{word.word}&rdquo;
        {word.score !== null && (
          <span className="ml-2 text-xs text-[var(--text-secondary)]">{t("speechEvaluation.wordScore", { score: word.score })}</span>
        )}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-secondary)]">
        {issues.length === 0
          ? <li>{t("speechEvaluation.wordStatus.correct")}</li>
          : issues.map(({ key, params }) => <li key={key}>{t(key, params)}</li>)}
      </ul>
    </div>
  );
}

function Legend({ fluency }: { fluency: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
      <span><span className={WORD_STYLES.mispronounced}>abc</span> {t("speechEvaluation.wordStatus.mispronounced")}</span>
      <span><span className={WORD_STYLES.omitted}>abc</span> {t("speechEvaluation.wordStatus.omitted")}</span>
      <span><span className={INSERTED_STYLE}>+abc</span> {t("speechEvaluation.wordStatus.inserted")}</span>
      <span><span className={WORD_STYLES.not_scored}>abc</span> {t("speechEvaluation.wordStatus.not_scored")}</span>
      {fluency && (
        <>
          <span><span className={PAUSE_STYLE}>‖</span> {t("speechEvaluation.legend.pause")}</span>
          <span><span className={SLOW_STYLE}>abc</span> {t("speechEvaluation.legend.slowWord")}</span>
        </>
      )}
    </div>
  );
}

export default function SpeechEvaluationDetails({ evaluation }: SpeechEvaluationDetailsProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(null);
  const notice = evidenceNoticeKey(evaluation);
  const words = annotatedWords(evaluation);
  const selectedWord = selected === null ? undefined : words[selected];
  const practice = evaluation.practiceSummary ?? [];

  return (
    <div className="space-y-4">
      {evaluation.scale === "10-90" && (
        <p className="text-xs text-[var(--text-secondary)]">{t("speechEvaluation.referenceLabel")}</p>
      )}
      {evaluation.summary && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{evaluation.summary}</p>
      )}
      {notice && (
        <p className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {t(notice)}
        </p>
      )}
      {evaluation.warnings?.includes("duration_outside_training_range") && (
        <p className="text-xs text-[var(--text-secondary)]">{t("speechEvaluation.notice.durationOutsideTrainingRange")}</p>
      )}

      {practice.length > 0 && <PracticeSummary items={practice} />}

      {/* The passage as read, annotated where the evaluator found something. */}
      {words.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">{t("speechEvaluation.selectWord")}</p>
          <p className="font-serif text-base leading-9">
            {words.map((word) => {
              const style = `${WORD_STYLES[word.status]} ${word.slowSec !== null ? SLOW_STYLE : ""}`;
              return (
                <span key={word.index}>
                  {isSelectable(word) ? (
                    <button
                      type="button"
                      onClick={() => setSelected(selected === word.index ? null : word.index)}
                      aria-pressed={selected === word.index}
                      className={`rounded px-0.5 ${style} ${selected === word.index ? "ring-2 ring-slate-400" : ""}`}
                    >
                      {word.status === "inserted" ? `+${word.word}` : word.word}
                    </button>
                  ) : (
                    <span className={`px-0.5 ${style}`}>{word.word}</span>
                  )}
                  {word.repeatedAs !== null && (
                    <sup className={PAUSE_STYLE} title={t("speechEvaluation.issue.repeated", { heard: word.repeatedAs })}>↻</sup>
                  )}
                  {word.after.map((next, index) => (
                    <span key={index}> <Between next={next} /></span>
                  ))}{" "}
                </span>
              );
            })}
          </p>
          {selectedWord && <WordDetail word={selectedWord} />}
          <Legend fluency={evaluation.provider === "echolingo"} />
        </div>
      )}
    </div>
  );
}
