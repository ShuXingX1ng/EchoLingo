"use client";

import { useState } from "react";
import type { SpeechEvaluationResult, WordEvidence } from "@/types";
import { useTranslation } from "@/lib/i18n";

interface SpeechEvaluationDetailsProps {
  evaluation: SpeechEvaluationResult;
}

export default function SpeechEvaluationDetails({
  evaluation,
}: SpeechEvaluationDetailsProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const overall = evaluation.overallScore;

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600 dark:text-green-400";
    if (score >= 80) return "text-blue-600 dark:text-blue-400";
    if (score >= 70) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return "bg-green-100 dark:bg-green-900/30";
    if (score >= 80) return "bg-blue-100 dark:bg-blue-900/30";
    if (score >= 70) return "bg-yellow-100 dark:bg-yellow-900/30";
    return "bg-red-100 dark:bg-red-900/30";
  };

  const getWordStyle = (word: WordEvidence) => {
    if (needsPractice(word)) {
      return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 line-through";
    }
    if (word.status === "omitted") {
      return "bg-gray-100 dark:bg-gray-800 text-gray-500 italic";
    }
    if (word.score >= 90) {
      return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
    }
    if (word.score >= 80) {
      return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
    }
    return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300";
  };

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="flex items-center gap-4">
        {overall !== null && (
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center ${getScoreBgColor(overall)}`}
          >
            <span className={`text-2xl font-bold ${getScoreColor(overall)}`}>
              {overall}
            </span>
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {t("speechEvaluation.overall")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {evaluation.summary}
          </p>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-3 gap-3">
        <ScoreCard label={t("speechEvaluation.pronunciation")} score={evaluation.pronunciation} />
        <ScoreCard label={t("speechEvaluation.oralFluency")} score={evaluation.oralFluency} />
        <ScoreCard label={t("speechEvaluation.content")} score={evaluation.content} />
      </div>

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
                    className={`px-2 py-1 rounded text-sm font-medium ${getWordStyle(word)}`}
                    title={`Score: ${word.score}${word.status !== "correct" ? ` (${word.status})` : ""}`}
                  >
                    {word.word}
                    <span className="text-xs ml-1 opacity-70">{word.score}</span>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-200 dark:bg-green-800"></span>
                  90+ {t("pronunciation.excellent")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800"></span>
                  80-89 {t("pronunciation.good")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-yellow-200 dark:bg-yellow-800"></span>
                  70-79 {t("pronunciation.fair")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-200 dark:bg-red-800"></span>
                  &lt;70 {t("pronunciation.needsWork")}
                </span>
              </div>

              {/* Mispronounced words details */}
              {evaluation.words.filter(needsPractice).length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">
                    {t("pronunciation.wordsToPractice")}:
                  </p>
                  <ul className="space-y-1">
                    {evaluation.words
                      .filter(needsPractice)
                      .map((word, index) => (
                        <li
                          key={index}
                          className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2"
                        >
                          <span className="font-medium">&ldquo;{word.word}&rdquo;</span>
                          <span className="text-xs opacity-70">Score: {word.score}</span>
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

function needsPractice(word: WordEvidence) {
  return word.status === "mispronounced" && word.score < 70;
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const getColor = (score: number) => {
    if (score >= 90) return "text-green-600 dark:text-green-400";
    if (score >= 80) return "text-blue-600 dark:text-blue-400";
    if (score >= 70) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getBgColor = (score: number) => {
    if (score >= 90) return "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
    if (score >= 80) return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
    if (score >= 70) return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800";
    return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
  };

  return (
    <div className={`rounded-lg border p-3 text-center ${getBgColor(score)}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${getColor(score)}`}>{score}</p>
    </div>
  );
}
