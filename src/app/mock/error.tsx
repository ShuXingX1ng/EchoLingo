"use client";

import { useEffect } from "react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import { useTranslation } from "@/lib/i18n";

export default function MockError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error("Mock exam error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-16 sm:py-24 flex flex-col items-center justify-center text-center">
        <div className="text-5xl mb-6">⚠️</div>
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">
          {t("mock.error.title")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md">
          {error.message || t("mock.error.defaultMessage")}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={reset}
            className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            {t("mock.error.retry")}
          </button>
          <Link
            href="/mock"
            className="rounded-xl border border-[var(--border-strong)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
          >
            {t("mock.error.backToMock")}
          </Link>
        </div>
      </main>
    </div>
  );
}
