"use client";

import { useState, useEffect } from "react";
import {
  getPersonalizedSuggestions,
  getErrorStats,
} from "@/lib/supabase-error-patterns";
import { useAuth } from "@/lib/auth-context";

interface PersonalizedSuggestionsProps {
  compact?: boolean;
}

export default function PersonalizedSuggestions({
  compact = false,
}: PersonalizedSuggestionsProps) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [stats, setStats] = useState<{
    totalErrors: number;
    byType: Record<string, number>;
  } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (user) {
      // Use Supabase as the authority for logged-in users
      getPersonalizedSuggestions(user.id)
        .then(setSuggestions)
        .catch(console.error);

      getErrorStats(user.id)
        .then(setStats)
        .catch(console.error);
    }
  }, [user]);

  if (!user || suggestions.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 text-amber-600 dark:text-amber-400"
          >
            <path
              fillRule="evenodd"
              d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
              clipRule="evenodd"
            />
          </svg>
          <h3 className="font-medium text-amber-800 dark:text-amber-200">
            Personalized Tips
          </h3>
        </div>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Based on your practice history, we have {suggestions.length} tips for
          you.
        </p>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium"
        >
          {isExpanded ? "Hide" : "Show"} Tips
        </button>
        {isExpanded && (
          <ul className="mt-3 space-y-2">
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2"
              >
                <span className="text-amber-500 mt-0.5">•</span>
                {suggestion}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6 text-blue-600 dark:text-blue-400"
          >
            <path d="M11.7 2.805a.75.75 0 0 1 .6 0A65.17 65.17 0 0 1 22.74 7.22a.75.75 0 0 1-.476.714A64.8 64.8 0 0 1 18 9.722c-1.576.374-3.168.69-4.78.946l-2.27 2.27a.75.75 0 0 1-.994-.044l-.003-.004-.112-.125a21.1 21.1 0 0 1-4.097 3.425.75.75 0 0 1-.762 0A21.1 21.1 0 0 1 1.14 11.94l-.112.125-.003.004a.75.75 0 0 1-.994.044L6.3 9.84a64.8 64.8 0 0 1-4.354-1.803.75.75 0 0 1-.476-.714A65.17 65.17 0 0 1 11.7 2.805Z" />
            <path d="M13.06 15.473a64.8 64.8 0 0 1 4.78-.946l2.27-2.27a.75.75 0 0 1 .994.044l.003.004.112.125a21.1 21.1 0 0 1 4.097 3.425.75.75 0 0 1 0 .762 21.1 21.1 0 0 1-4.097 3.425l-.112.125-.003.004a.75.75 0 0 1-.994-.044l-2.27-2.27a64.8 64.8 0 0 1-4.78.946c-1.576.374-3.168.69-4.78.946l-2.27 2.27a.75.75 0 0 1-.994-.044l-.003-.004-.112-.125a21.1 21.1 0 0 1-4.097-3.425.75.75 0 0 1 0-.762 21.1 21.1 0 0 1 4.097-3.425l.112-.125.003-.004a.75.75 0 0 1 .994.044l2.27 2.27a64.8 64.8 0 0 1 4.78-.946Z" />
          </svg>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Personalized Learning
          </h2>
        </div>
        {stats && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Based on {stats.totalErrors} error patterns
          </span>
        )}
      </div>

      {/* Error Type Distribution */}
      {stats && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Your Error Distribution
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(stats.byType).map(([type, count]) => (
              <div
                key={type}
                className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-center"
              >
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {count}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {type}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Improvement Suggestions
        </h3>
        <ul className="space-y-3">
          {suggestions.map((suggestion, index) => (
            <li
              key={index}
              className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
            >
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-sm font-medium">
                {index + 1}
              </span>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {suggestion}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* Practice Count */}
      {stats && stats.totalErrors > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Keep practicing to reduce your error patterns and improve your band
            score!
          </p>
        </div>
      )}
    </div>
  );
}
