"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Clock,
  BarChart2,
  ArrowRight,
  CheckCircle2,
  Circle,
  ChevronRight,
} from "lucide-react";
import DesktopNav from "@/components/DesktopNav";
import { useTranslation } from "@/lib/i18n";
import {
  getDaysUntilExam,
  getReminderSettings,
  getStreakDays,
  hasPracticedToday,
  type ReminderSettings,
} from "@/lib/reminders";

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
  const [studyState, setStudyState] = useState<HomeStudyState>(EMPTY_STUDY_STATE);

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

  const { daysUntilExam, practicedToday, streakDays } = studyState;

  function getEncouragement(days: number): string {
    if (days <= 0) return t("reminder.encouragement.today");
    if (days <= 7) return t("reminder.encouragement.urgent");
    if (days <= 30) return t("reminder.encouragement.soon");
    return t("reminder.encouragement.go");
  }

  return (
    <div className="min-h-screen">
      <DesktopNav active="home" maxWidth="7xl" />

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">

        {/* ── Hero Banner ───────────────────────────────── */}
        <section className="animate-enter mb-8 overflow-hidden rounded-[28px] border border-[#dce4ee] shadow-[0_10px_26px_rgba(15,23,42,.055)]">
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="relative flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-10"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,255,255,.97) 0%, rgba(255,255,255,.90) 55%, rgba(246,252,249,.95) 100%)",
            }}
          >
            {/* Decorative grid */}
            <div
              className="pointer-events-none absolute bottom-0 right-0 h-48 w-80 opacity-50"
              aria-hidden="true"
              style={{
                background:
                  "radial-gradient(circle at 68% 40%, rgba(0,122,83,.18), transparent 18%), repeating-linear-gradient(90deg, rgba(0,122,83,.08) 0 12px, transparent 12px 34px)",
                clipPath: "ellipse(62% 40% at 50% 50%)",
              }}
            />

            <div className="relative min-w-0">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                <Sparkles className="h-4 w-4" strokeWidth={2} />
                PTE Academic · AI Practice
              </p>
              <h1 className="font-display mt-4 text-4xl leading-tight tracking-tight text-slate-900 dark:text-white sm:text-5xl">
                {t("home.dailyPlanDesc")}
              </h1>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-500 dark:text-slate-400">
                {t("home.description")}
              </p>
            </div>

            {/* Metrics card */}
            <div
              className="relative shrink-0 overflow-hidden rounded-[18px] border border-[#c8d3df] shadow-[0_18px_36px_rgba(15,23,42,.08)] dark:border-white/10"
              style={{ background: "rgba(255,255,255,.82)", backdropFilter: "blur(8px)" }}
            >
              <div className="flex divide-x divide-[#dce4ee] dark:divide-white/10">
                {daysUntilExam !== null && (
                  <div className="flex flex-col items-center gap-1.5 px-6 py-4">
                    <span className="text-[32px] font-bold tabular-nums leading-none text-emerald-600">
                      {daysUntilExam}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">
                      {t("reminder.daysUntilExam")}
                    </span>
                  </div>
                )}
                <div className="flex flex-col items-center gap-1.5 px-6 py-4">
                  <span className="text-[32px] font-bold tabular-nums leading-none text-slate-800 dark:text-white">
                    {streakDays}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    {t("reminder.streak")}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 px-6 py-4">
                  {practicedToday ? (
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" strokeWidth={2} />
                  ) : (
                    <Circle className="h-8 w-8 text-slate-300" strokeWidth={2} />
                  )}
                  <span className="text-[11px] font-medium text-slate-500">
                    {practicedToday ? t("reminder.practiced") : t("reminder.notPracticed")}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 px-6 py-4">
                  <span className="text-[32px] font-bold leading-none text-slate-800 dark:text-white">
                    7.0
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    {t("home.currentTarget")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {daysUntilExam !== null && (
            <div className="border-t border-[#dce4ee] bg-emerald-50/60 px-7 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 sm:px-10">
              {getEncouragement(daysUntilExam)}
            </div>
          )}
        </section>

        {/* ── Feature Cards ─────────────────────────────── */}
        <section className="mb-8" aria-label="Features">
          <h2 className="sr-only">{t("home.dailyPlan")}</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">

            {/* Practice — primary, double width */}
            <Link
              href="/practice"
              className="animate-enter-1 group relative col-span-1 flex flex-col justify-between overflow-hidden rounded-[28px] p-8 text-white transition-all hover:-translate-y-0.5 sm:col-span-2 lg:col-span-2"
              style={{
                background:
                  "radial-gradient(circle at 82% 14%, rgba(62, 207, 142, .22), transparent 24%), radial-gradient(circle at 78% 78%, rgba(255,255,255,.11), transparent 20%), linear-gradient(145deg, #006846 0%, #005744 44%, #003d35 100%)",
                boxShadow: "0 24px 54px rgba(0, 84, 62, .22)",
                border: "1px solid rgba(255,255,255,.16)",
              }}
            >
              {/* Decorative dot grid */}
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                aria-hidden="true"
                style={{
                  background:
                    "repeating-radial-gradient(ellipse at center, rgba(255,255,255,.11) 0 1px, transparent 2px 18px)",
                }}
              />
              <div className="relative">
                <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  {t("home.practiceCardEyebrow")}
                </span>
                <h3 className="font-display mt-5 text-4xl leading-tight text-white">
                  {t("home.practiceCardTitle")}
                </h3>
                <p className="mt-3 max-w-sm text-base leading-relaxed text-white/80">
                  {t("home.practiceCardDesc")}
                </p>
              </div>
              <div className="relative mt-8 flex items-center justify-between">
                <span
                  className="inline-flex h-12 items-center gap-3 rounded-[13px] border border-white/20 bg-white px-6 text-sm font-bold text-emerald-800 shadow-[0_12px_22px_rgba(0,0,0,.14)] transition-shadow group-hover:shadow-[0_16px_28px_rgba(0,0,0,.2)]"
                >
                  {t("home.practiceCardCta")}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/13 border border-white/18 backdrop-blur-sm">
                  <ArrowRight className="h-5 w-5" strokeWidth={2} />
                </span>
              </div>
            </Link>

            {/* Mock Exam */}
            <Link
              href="/mock"
              className="animate-enter-2 group flex flex-col justify-between rounded-[22px] border border-[#d8e0e9] bg-white p-7 shadow-[0_10px_26px_rgba(15,23,42,.055)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,.085)] dark:border-white/10 dark:bg-slate-900"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-[15px] border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  <Clock className="h-5 w-5" strokeWidth={2} />
                </div>
                <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.17em] text-slate-400">
                  {t("home.timedProtocol")}
                </p>
                <h3 className="font-display mt-3 text-2xl leading-tight text-slate-900 dark:text-white">
                  {t("home.mockExam")}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {t("home.mockExamCardDesc")}
                </p>
              </div>
              <span className="mt-6 inline-flex h-11 min-w-[11rem] items-center justify-center gap-2 rounded-xl border border-[#c8d3df] bg-white text-sm font-bold text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,.045)] transition-shadow group-hover:shadow-[0_8px_22px_rgba(15,23,42,.08)] dark:bg-slate-800 dark:text-white dark:border-white/10">
                {t("home.beginExamCta")}
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </span>
            </Link>

            {/* Stats */}
            <Link
              href="/stats"
              className="animate-enter-3 group flex flex-col justify-between rounded-[22px] border border-[#d8e0e9] bg-white p-7 shadow-[0_10px_26px_rgba(15,23,42,.055)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,.085)] dark:border-white/10 dark:bg-slate-900"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-[15px] border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  <BarChart2 className="h-5 w-5" strokeWidth={2} />
                </div>
                <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.17em] text-slate-400">
                  {t("home.archive")}
                </p>
                <h3 className="font-display mt-3 text-2xl leading-tight text-slate-900 dark:text-white">
                  {t("home.reviewProgress")}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {t("home.reviewProgressDesc")}
                </p>
              </div>
              <span className="mt-6 inline-flex h-11 min-w-[11rem] items-center justify-center gap-2 rounded-xl border border-[#c8d3df] bg-white text-sm font-bold text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,.045)] transition-shadow group-hover:shadow-[0_8px_22px_rgba(15,23,42,.08)] dark:bg-slate-800 dark:text-white dark:border-white/10">
                {t("home.viewStatsCta")}
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </span>
            </Link>

          </div>
        </section>

        {/* ── Practice History + Skill Focus ──────────────── */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">

          {/* Practice History */}
          <div className="animate-enter-4">
            <article
              className="flex flex-col justify-between gap-6 overflow-hidden rounded-[22px] border border-[#dce4ee] bg-white p-8 shadow-[0_10px_26px_rgba(15,23,42,.055)] dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:p-10"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">
                  {t("home.practiceHistory")}
                </p>
                <h2 className="font-display mt-3 text-2xl leading-tight text-slate-900 dark:text-white sm:text-3xl">
                  {t("home.archiveDesc")}
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {t("home.archiveDetailDesc")}
                </p>
                <Link
                  href="/history"
                  className="mt-6 inline-flex h-11 items-center gap-2.5 rounded-xl border border-indigo-200 bg-white px-5 text-sm font-bold text-indigo-600 shadow-[0_6px_16px_rgba(99,102,241,.06)] transition-all hover:shadow-[0_8px_22px_rgba(99,102,241,.12)] dark:bg-slate-800 dark:border-indigo-800 dark:text-indigo-400"
                >
                  {t("home.openArchive")}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
              </div>

              {/* Mock illustration */}
              <div
                className="relative h-44 w-full shrink-0 overflow-hidden rounded-[24px] border border-indigo-100 sm:w-64 dark:border-indigo-900/40"
                style={{
                  background:
                    "radial-gradient(circle at 82% 70%, rgba(109,94,252,.28), transparent 16%), linear-gradient(145deg, #f1f1ff, #fbfdff)",
                }}
                aria-hidden="true"
              >
                {/* Window chrome */}
                <div
                  className="absolute left-8 top-7 w-36 rounded-[18px] border border-indigo-100 bg-white/80 p-4 shadow-[0_20px_45px_rgba(109,94,252,.12)]"
                  style={{ backdropFilter: "blur(4px)" }}
                >
                  <div className="mb-3 h-2 w-14 rounded-full bg-indigo-200" />
                  <div className="h-2 w-full rounded-full bg-indigo-100 mb-3" />
                  <div className="h-2 w-4/5 rounded-full bg-indigo-100" />
                </div>
                <div className="absolute bottom-8 right-6 flex h-14 w-14 items-center justify-center rounded-full border border-indigo-100 bg-white text-lg font-black text-indigo-600 shadow-[0_18px_34px_rgba(109,94,252,.22)]">
                  87
                </div>
              </div>
            </article>
          </div>

          {/* Skill Focus */}
          <aside className="animate-enter-5">
            <div className="rounded-[22px] border border-[#dce4ee] bg-white p-6 shadow-[0_10px_26px_rgba(15,23,42,.055)] dark:border-white/10 dark:bg-slate-900 sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                    {t("home.skillFocus")}
                  </p>
                  <h2 className="font-display mt-2 text-xl leading-tight text-slate-900 dark:text-white">
                    {t("home.skillFocusDesc")}
                  </h2>
                </div>
                <Link
                  href="/stats"
                  className="shrink-0 rounded-xl border border-[#c8d3df] bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,.045)] transition-shadow hover:shadow-[0_6px_16px_rgba(15,23,42,.07)] dark:bg-slate-800 dark:border-white/10 dark:text-white"
                >
                  {t("home.review")}
                </Link>
              </div>

              <ol className="border-t border-[#dce4ee] dark:border-white/10">
                {rubricRows.map((row, index) => (
                  <li
                    key={row.labelKey}
                    className="flex items-center gap-3.5 border-b border-[#dce4ee] py-4 last:border-b-0 dark:border-white/10"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">
                        {t(row.labelKey)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {t(row.valueKey)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" strokeWidth={2} />
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
