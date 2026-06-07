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

    Promise.all([
      generateDailyTasks(user.id),
      getRecommendations(user.id),
    ])
      .then(([t, r]) => {
        setTasks(t);
        setRecommendations(r);
      })
      .catch(console.error);
  }, [user]);

  const { daysUntilExam, practicedToday, reminderSettings, streakDays } = studyState;
  const hasReminderPanel =
    daysUntilExam !== null || reminderSettings?.dailyReminderEnabled || streakDays > 0;

  function getEncouragement(days: number): string {
    if (days <= 0) return t("reminder.encouragement.today");
    if (days <= 7) return t("reminder.encouragement.urgent");
    if (days <= 30) return t("reminder.encouragement.soon");
    return t("reminder.encouragement.go");
  }

  return (
    <div className="min-h-screen bg-[#f7f3ea] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(30,41,59,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(30,41,59,0.05)_1px,transparent_1px)] bg-[size:48px_48px] dark:bg-[linear-gradient(rgba(226,232,240,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(226,232,240,0.05)_1px,transparent_1px)]" />

      <DesktopNav active="home" maxWidth="7xl" />

      <main id="main-content" className="relative z-10 mx-auto max-w-7xl px-5 py-8 sm:py-12">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_420px]">
          <div className="border border-slate-900 bg-[#fffdf7] p-6 shadow-[10px_10px_0_rgba(15,23,42,0.10)] dark:border-white/15 dark:bg-slate-900 dark:shadow-[10px_10px_0_rgba(255,255,255,0.05)] sm:p-8 lg:p-10">
            <div className="mb-6 sm:mb-10 grid gap-6 sm:gap-8 lg:grid-cols-[1fr_220px]">
              <div>
                <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-emerald-800 dark:text-emerald-300">
                  {t("home.dailyPlan")}
                </p>
                <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-slate-950 dark:text-white sm:text-5xl">
                  {t("home.dailyPlanDesc")}
                </h1>
                <p className="mt-3 sm:mt-5 max-w-2xl text-sm sm:text-base leading-7 sm:leading-8 text-slate-600 dark:text-slate-300">
                  {t("home.description")}
                </p>
              </div>

              <div className="border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 pl-0 lg:pl-6 dark:border-white/10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {t("home.currentTarget")}
                </p>
                <div className="mt-4 text-5xl font-semibold text-slate-950 dark:text-white">
                  7.0
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {t("home.currentTargetDesc")}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_220px_220px]">
              <Link
                href="/practice"
                className="group border border-slate-900 bg-slate-950 p-5 text-white transition-transform hover:-translate-y-0.5 dark:border-white dark:bg-white dark:text-slate-950"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300 dark:text-emerald-700">
                  PTE Academic · Recommended
                </span>
                <span className="mt-3 block text-2xl font-semibold">
                  Practice Now
                </span>
                <span className="mt-4 block text-sm leading-6 text-slate-300 dark:text-slate-600">
                  Read Aloud, Repeat Sentence, Write Essay, and 4 more task types — all with AI feedback.
                </span>
                <span className="mt-6 inline-block text-sm font-semibold group-hover:underline">
                  Choose task type →
                </span>
              </Link>

              <Link
                href="/mock"
                className="border border-slate-300 bg-white p-5 transition-colors hover:border-slate-900 dark:border-white/10 dark:bg-slate-900/80 dark:hover:border-white/40"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("home.timedProtocol")}
                </span>
                <span className="mt-3 block text-lg font-semibold text-slate-950 dark:text-white">
                  {t("home.mockExam")}
                </span>
                <span className="mt-3 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {t("home.mockExamCardDesc")}
                </span>
              </Link>

              <Link
                href="/history"
                className="border border-slate-300 bg-white p-5 transition-colors hover:border-slate-900 dark:border-white/10 dark:bg-slate-900/80 dark:hover:border-white/40"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("home.practiceHistory")}
                </span>
                <span className="mt-3 block text-lg font-semibold text-slate-950 dark:text-white">
                  {t("home.reviewProgress")}
                </span>
                <span className="mt-3 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {t("home.reviewProgressDesc")}
                </span>
              </Link>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="border border-slate-900 bg-[#fffdf7] p-6 shadow-[8px_8px_0_rgba(15,23,42,0.10)] dark:border-white/15 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("home.skillFocus")}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                    {t("home.skillFocusDesc")}
                  </h2>
                </div>
                <Link href="/stats" className="text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300">
                  {t("home.review")}
                </Link>
              </div>

              <div className="mt-6 space-y-4">
                {rubricRows.map((row, index) => (
                  <div key={row.labelKey} className="grid grid-cols-[32px_1fr] gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
                    <span className="font-mono text-xs text-slate-400">0{index + 1}</span>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{t(row.labelKey)}</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t(row.valueKey)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {hasReminderPanel && (
              <div className="border border-slate-300 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("home.studyRhythm")}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  {daysUntilExam !== null && (
                    <div>
                      <p className="text-3xl font-semibold text-slate-950 dark:text-white">
                        {daysUntilExam}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t("reminder.daysUntilExam")}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-3xl font-semibold text-slate-950 dark:text-white">
                      {streakDays}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("reminder.streak")}
                    </p>
                  </div>
                </div>
                {daysUntilExam !== null && (
                  <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {getEncouragement(daysUntilExam)}
                  </p>
                )}
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  {practicedToday ? t("reminder.practiced") : t("reminder.notPracticed")}
                </p>
              </div>
            )}
          </aside>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            {tasks !== null && <DailyTasks tasks={tasks} />}
            {recommendations !== null && <LearningPath recommendations={recommendations} />}
          </div>

          <div className="border border-slate-300 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {t("home.archive")}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
              {t("home.archiveDesc")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t("home.archiveDetailDesc")}
            </p>
            <Link
              href="/history"
              className="mt-5 inline-flex items-center text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300"
            >
              {t("home.openArchive")}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
