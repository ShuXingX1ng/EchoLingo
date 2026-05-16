"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/lib/i18n";
import { getRecommendations, type Recommendation } from "@/lib/recommendations";

export default function LearningPath() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    getRecommendations(user.id)
      .then(setRecommendations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || loading) return null;

  if (recommendations.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {t("recommendations.title")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("recommendations.noData")}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t("recommendations.title")}
        </h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("recommendations.basedOn")}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recommendations.map((rec) => (
          <Link
            key={rec.topic.id}
            href={`/practice?mode=part1&topic=${rec.topic.id}`}
            className="group p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                {rec.topic.category}
              </span>
              {rec.focusArea && (
                <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
                  {t("recommendations.weakArea")}
                </span>
              )}
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {rec.topic.name}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
              {rec.reason}
            </p>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 group-hover:underline">
              {t("recommendations.startPractice")} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
