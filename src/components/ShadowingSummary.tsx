"use client";

import { useTranslation } from "@/lib/i18n";
import type { ShadowingResult } from "@/hooks/useShadowingPractice";

interface ShadowingSummaryProps {
  results: ShadowingResult[];
  topicName: string;
  onRestart: () => void;
  onHome: () => void;
}

export default function ShadowingSummary({
  results,
  topicName,
  onRestart,
  onHome,
}: ShadowingSummaryProps) {
  const { t } = useTranslation();

  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0;

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

  const getScoreLabel = (score: number) => {
    if (score >= 90) return t("pronunciation.excellent");
    if (score >= 80) return t("pronunciation.good");
    if (score >= 70) return t("pronunciation.fair");
    return t("pronunciation.needsWork");
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t("shadowing.summary.title")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {topicName}
            </p>
          </div>

          {/* Average Score */}
          <div className="flex justify-center mb-6">
            <div
              className={`w-24 h-24 rounded-full flex flex-col items-center justify-center ${getScoreBgColor(averageScore)}`}
            >
              <span className={`text-3xl font-bold ${getScoreColor(averageScore)}`}>
                {averageScore}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {getScoreLabel(averageScore)}
              </span>
            </div>
          </div>

          {/* Sentence-by-sentence results */}
          <div className="space-y-3 mb-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("shadowing.summary.details")}
            </h3>
            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${getScoreBgColor(result.score)} ${getScoreColor(result.score)}`}
                >
                  {result.score}
                </div>
                <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                  {result.sentence}
                </p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onRestart}
              className="flex-1 px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              {t("shadowing.summary.restart")}
            </button>
            <button
              onClick={onHome}
              className="flex-1 px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t("shadowing.summary.backHome")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
