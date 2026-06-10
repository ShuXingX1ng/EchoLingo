"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import DailyTasks from "@/components/DailyTasks";
import LearningPath from "@/components/LearningPath";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import {
  getDaysUntilExam,
  getReminderSettings,
  getStreakDays,
  hasPracticedToday,
  type ReminderSettings,
} from "@/lib/reminders";
import { generateDailyTasks, type DailyTask } from "@/lib/learning-plan";
import { getRecommendations, type Recommendation } from "@/lib/recommendations";

type HomeStudyState = {
  reminderSettings: ReminderSettings | null;
  daysUntilExam: number | null;
  practicedToday: boolean;
  streakDays: number;
};

const EMPTY_STUDY_STATE: HomeStudyState = {
  reminderSettings: null,
  daysUntilExam: null,
  practicedToday: false,
  streakDays: 0,
};

const rubricRows = [
  { labelKey: "home.fluency", valueKey: "home.fluencyDesc" },
  { labelKey: "home.lexis", valueKey: "home.lexisDesc" },
  { labelKey: "home.grammar", valueKey: "home.grammarDesc" },
  { labelKey: "home.pronunciation", valueKey: "home.pronunciationDesc" },
];

function StatPill({ value, label, highlight = false }: { value: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 first:pl-0 last:pr-0">
      <span className={`text-2xl font-bold tabular-nums leading-none ${highlight ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--foreground)]"}`}>
        {value}
      </span>
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [studyState, setStudyState] = useState<HomeStudyState>(EMPTY_STUDY_STATE);
  const [tasks, setTasks] = useState<DailyTask[] | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setStudyState({
        reminderSettings: getReminderSettings(),
        daysUntilExam: getDaysUntilExam(),
        practicedToday: hasPracticedToday(),
        streakDays: getStreakDays(),
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!user) {
      setTasks(null);
      setRecommendations(null);
      return;
    }
    Promise.all([generateDailyTasks(user.id), getRecommendations(user.id)])
      .then(([t, r]) => { setTasks(t); setRecommendations(r); })
      .catch(console.error);
  }, [user]);

  const { daysUntilExam, practicedToday, streakDays } = studyState;

  function getEncouragement(days: number): string {
    if (days <= 0) return t("reminder.encouragement.today");
    if (days <= 7) return t("reminder.encouragement.urgent");
    if (days <= 30) return t("reminder.encouragement.soon");
    return t("reminder.encouragement.go");
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <DesktopNav active="home" maxWidth="7xl" />

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">

        {/* ── Hero Banner ───────────────────────────────── */}
        <section className="animate-enter mb-8 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-sm">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                PTE Academic · AI Practice
              </p>
              <h1 className="font-display text-3xl text-[var(--foreground)] sm:text-4xl">
                {t("home.dailyPlanDesc")}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
                {t("home.description")}
              </p>
            </div>

            {/* Stats */}
            <div className="flex shrink-0 divide-x divide-[var(--border)] rounded-xl bg-[var(--background)] px-2 py-1 ring-1 ring-[var(--border)]">
              {daysUntilExam !== null && (
                <StatPill value={daysUntilExam} label={t("reminder.daysUntilExam")} />
              )}
              <StatPill value={streakDays} label={t("reminder.streak")} highlight />
              <StatPill
                value={
                  practicedToday ? (
                    <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-6 w-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  )
                }
                label={practicedToday ? t("reminder.practiced") : t("reminder.notPracticed")}
              />
              <div className="flex flex-col items-center gap-0.5 px-4 py-2 last:pr-0">
                <span className="text-2xl font-bold leading-none text-[var(--foreground)]">7.0</span>
                <span className="text-xs text-[var(--text-muted)]">{t("home.currentTarget")}</span>
              </div>
            </div>
          </div>

          {daysUntilExam !== null && (
            <div className="border-t border-[var(--border)] bg-emerald-50/50 px-6 py-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 sm:px-8">
              {getEncouragement(daysUntilExam)}
            </div>
          )}
        </section>

        {/* ── Feature Cards ─────────────────────────────── */}
        <section className="mb-8" aria-label="Features">
          <h2 className="sr-only">{t("home.dailyPlan")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {/* Practice — primary, double width on lg */}
            <Link
              href="/practice"
              className="animate-enter-1 group relative col-span-1 flex flex-col justify-between overflow-hidden rounded-2xl bg-emerald-600 p-6 text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:col-span-2 lg:col-span-2"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.1),transparent_70%)]" />
              <div className="relative">
                <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-widest text-emerald-100">
                  PTE Academic · Recommended
                </span>
                <h3 className="font-display text-3xl text-white">Practice</h3>
                <p className="mt-2 text-sm leading-relaxed text-emerald-100">
                  Read Aloud, Repeat Sentence, Write Essay, and 4 more task types — all with AI feedback.
                </p>
              </div>
              <div className="relative mt-6 flex items-center justify-between">
                <span className="text-sm font-semibold text-white group-hover:underline">
                  Choose task type →
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
                  </svg>
                </span>
              </div>
            </Link>

            {/* Mock Exam */}
            <Link
              href="/mock"
              className="animate-enter-2 group flex flex-col justify-between rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--border)] shadow-sm transition-all hover:-translate-y-0.5 hover:ring-emerald-400 hover:shadow-md"
            >
              <div>
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  {t("home.timedProtocol")}
                </p>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">{t("home.mockExam")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {t("home.mockExamCardDesc")}
                </p>
              </div>
              <span className="mt-4 text-xs font-semibold text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-emerald-400">
                Begin exam →
              </span>
            </Link>

            {/* Stats */}
            <Link
              href="/stats"
              className="animate-enter-3 group flex flex-col justify-between rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--border)] shadow-sm transition-all hover:-translate-y-0.5 hover:ring-emerald-400 hover:shadow-md"
            >
              <div>
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </span>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  {t("home.archive")}
                </p>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">{t("home.reviewProgress")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {t("home.reviewProgressDesc")}
                </p>
              </div>
              <span className="mt-4 text-xs font-semibold text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-emerald-400">
                View stats →
              </span>
            </Link>

          </div>
        </section>

        {/* ── Daily Tasks + Sidebar ──────────────────────── */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">

          {/* Left: Tasks + Learning Path */}
          <div className="animate-enter-4 space-y-6">
            {tasks !== null && <DailyTasks tasks={tasks} />}
            {recommendations !== null && <LearningPath recommendations={recommendations} />}

            {/* Archive card (shown when no tasks) */}
            {tasks === null && (
              <div className="rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--border)] shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  {t("home.practiceHistory")}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">
                  {t("home.archiveDesc")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {t("home.archiveDetailDesc")}
                </p>
                <Link
                  href="/history"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {t("home.openArchive")}
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
                  </svg>
                </Link>
              </div>
            )}
          </div>

          {/* Right: Skill Rubric */}
          <aside className="animate-enter-5 space-y-4">
            <div className="rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--border)] shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                    {t("home.skillFocus")}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                    {t("home.skillFocusDesc")}
                  </h2>
                </div>
                <Link
                  href="/stats"
                  className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                >
                  {t("home.review")}
                </Link>
              </div>

              <ol className="space-y-0">
                {rubricRows.map((row, index) => (
                  <li
                    key={row.labelKey}
                    className="flex items-start gap-3.5 border-t border-[var(--border)] py-4 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">{t(row.labelKey)}</p>
                      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{t(row.valueKey)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
