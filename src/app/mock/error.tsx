"use client";

import { useEffect } from "react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";

export default function MockError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Mock exam error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-16 sm:py-24 flex flex-col items-center justify-center text-center">
        <div className="text-5xl mb-6">⚠️</div>
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">
          模拟考试加载失败 (Mock exam error)
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md">
          {error.message || "An unexpected error occurred during the mock exam."}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={reset}
            className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            重试 (Try Again)
          </button>
          <Link
            href="/mock"
            className="rounded-xl border border-[var(--border-strong)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
          >
            返回模拟考试首页 (Back to Mock Exam)
          </Link>
        </div>
      </main>
    </div>
  );
}
