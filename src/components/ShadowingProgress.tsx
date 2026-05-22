"use client";

import { useTranslation } from "@/lib/i18n";

interface ShadowingProgressProps {
  currentIndex: number;
  total: number;
  scores: number[];
}

export default function ShadowingProgress({
  currentIndex,
  total,
  scores,
}: ShadowingProgressProps) {
  const { t } = useTranslation();

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {Array.from({ length: total }).map((_, i) => {
        const isCompleted = i < scores.length;
        const isCurrent = i === currentIndex;
        const score = scores[i];

        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                isCurrent
                  ? "bg-slate-950 text-white ring-2 ring-slate-300 dark:bg-white dark:text-slate-950 dark:ring-slate-700"
                  : isCompleted
                  ? `${getScoreColor(score)} text-white`
                  : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
              }`}
            >
              {isCompleted ? score : i + 1}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {t("shadowing.progress.sentence")} {i + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
