"use client";

import { useTranslation } from "@/lib/i18n";
import type { ErrorAnnotation } from "@/types";

const typeColors: Record<string, { bg: string; text: string; label: string }> = {
  grammar: {
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-300",
    label: "Grammar",
  },
  vocabulary: {
    bg: "bg-purple-50 dark:bg-purple-900/20",
    text: "text-purple-700 dark:text-purple-300",
    label: "Vocabulary",
  },
  fluency: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-300",
    label: "Fluency",
  },
};

export default function ErrorAnnotations({
  annotations,
}: {
  annotations: ErrorAnnotation[];
}) {
  const { t } = useTranslation();

  if (!annotations || annotations.length === 0) return null;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
      <h3 className="font-medium text-gray-900 dark:text-white mb-3">
        {t("feedback.errorAnnotations")}
      </h3>
      <div className="space-y-3">
        {annotations.map((error, i) => {
          const config = typeColors[error.type] || typeColors.grammar;
          return (
            <div
              key={i}
              className={`rounded-xl p-4 ${config.bg} border border-gray-200 dark:border-gray-700`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.text} bg-white/60 dark:bg-gray-800/60`}
                >
                  {t(`feedback.errorType.${error.type}`)}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-2">
                <span className="text-sm text-red-600 dark:text-red-400 line-through decoration-red-400">
                  {error.original}
                </span>
                <span className="text-sm text-gray-400 hidden sm:inline">→</span>
                <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                  {error.corrected}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {error.explanation}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
