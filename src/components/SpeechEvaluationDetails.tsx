"use client";

import { useState } from "react";
import type {
  SpeechEvaluationFailure,
  SpeechEvaluationResult,
  SpeechScoreScale,
  WordEvidence,
} from "@/types";
import { useTranslation } from "@/lib/i18n";
import {
  bandFloors,
  evidenceNoticeKey,
  scoreBand,
  scoreShare,
  speechErrorKey,
  type ScoreBand,
} from "@/lib/speech-evaluation";

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

const WORD_COLORS: Record<ScoreBand, string> = {
  excellent: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  good: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  fair: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  needsWork: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
};

function wordStyle(word: WordEvidence, scale: SpeechScoreScale) {
  if (word.status === "mispronounced") {
    return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 line-through";
  }
  if (word.status === "omitted" || word.status === "not_scored" || word.score === null) {
    return "bg-gray-100 dark:bg-gray-800 text-gray-500 italic";
  }
  return WORD_COLORS[scoreBand(word.score, scale)];
}

export default function SpeechEvaluationDetails({ evaluation }: SpeechEvaluationDetailsProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const notice = evidenceNoticeKey(evaluation);
  const floors = bandFloors(evaluation.scale);
  const toPractice = evaluation.words.filter((word) => word.status === "mispronounced");

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

      {/* Word-level Analysis */}
      {evaluation.words.length > 0 && (
        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            {showDetails ? t("pronunciation.hideDetails") : t("pronunciation.showDetails")}
            <svg
              className={`w-4 h-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDetails && (
            <div className="mt-3 space-y-3">
              {/* Word scores */}
              <div className="flex flex-wrap gap-2">
                {evaluation.words.map((word, index) => (
                  <div
                    key={index}
                    className={`px-2 py-1 rounded text-sm font-medium ${wordStyle(word, evaluation.scale)}`}
                    title={word.status === "correct" ? `${word.score}` : t(`speechEvaluation.wordStatus.${word.status}`)}
                  >
                    {word.word}
                    {word.score !== null && <span className="text-xs ml-1 opacity-70">{word.score}</span>}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-200 dark:bg-green-800"></span>
                  {floors.excellent}+ {t("pronunciation.excellent")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800"></span>
                  {floors.good}–{floors.excellent - 1} {t("pronunciation.good")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-yellow-200 dark:bg-yellow-800"></span>
                  &lt;{floors.good} {t("pronunciation.fair")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-200 dark:bg-red-800"></span>
                  {t("pronunciation.needsWork")}
                </span>
              </div>

              {/* Mispronounced words */}
              {toPractice.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">
                    {t("pronunciation.wordsToPractice")}:
                  </p>
                  <ul className="space-y-1">
                    {toPractice.map((word, index) => (
                      <li
                        key={index}
                        className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2"
                      >
                        <span className="font-medium">&ldquo;{word.word}&rdquo;</span>
                        {word.score !== null && <span className="text-xs opacity-70">{word.score}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
