"use client";

import { useTranslation } from "@/lib/i18n";

// Shared loading indicator for chat-based pages
export function ChatLoadingIndicator({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-start animate-message-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 border border-slate-200 dark:border-slate-700 shadow-sm min-w-[200px]">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
          {label || t("practice.examiner")}
        </p>
        <div className="space-y-2">
          <div className="h-3 w-3/4 rounded animate-shimmer" />
          <div
            className="h-3 w-1/2 rounded animate-shimmer"
            style={{ animationDelay: "0.1s" }}
          />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
            <div
              className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
              style={{ animationDelay: "0.1s" }}
            />
            <div
              className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            />
          </div>
          <span className="text-xs text-emerald-500 dark:text-emerald-400">
            {t("practice.thinking")}
          </span>
        </div>
      </div>
    </div>
  );
}

// Shared error banner for chat-based pages
export function ChatErrorBanner({ error }: { error: string }) {
  return (
    <div className="flex justify-center px-4 animate-message-in">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 max-w-md">
        <div className="flex items-start gap-3">
          <span className="text-red-500 mt-0.5">⚠</span>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    </div>
  );
}

// Shared Suspense fallback with bouncing dots
export function SuspenseFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex gap-2">
        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
      </div>
    </div>
  );
}

// Shared feedback loading indicator
export function FeedbackLoadingIndicator() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-1.5">
        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
        <div
          className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce"
          style={{ animationDelay: "0.15s" }}
        />
        <div
          className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {t("practice.generating")}
      </p>
    </div>
  );
}
