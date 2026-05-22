"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import {
  calculateStats,
  getBandColor,
  getBandBgColor,
  getBandLabel,
  getDimensionLabel,
  type PracticeStats,
} from "@/lib/stats";
import { calculateGoalProgress, type GoalProgress } from "@/lib/goals";
import { useTranslation } from "@/lib/i18n";
import { LineChart, BarChart, DonutChart } from "@/components/Chart";

export default function StatsPage() {
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [goalProgress, setGoalProgress] = useState<GoalProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      try {
        const loadedStats = await calculateStats();
        if (!isMounted) return;

        setStats(loadedStats);
        setGoalProgress(calculateGoalProgress());
      } catch {
        if (!isMounted) return;

        setStats(null);
        setGoalProgress(calculateGoalProgress());
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    const timer = setTimeout(() => {
      void loadStats();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
        <DesktopNav active="stats" />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
          </div>
        </main>
      </div>
    );
  }

  if (!stats || stats.totalSessions === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
        <DesktopNav active="stats" />
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="text-center animate-fade-in">
            <div className="text-6xl mb-6">📊</div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
              {t("stats.emptyTitle")}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md">
              {t("stats.emptyDesc")}
            </p>
            <Link
              href="/practice/setup"
              className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-medium transition-all hover:bg-slate-800 dark:hover:bg-slate-200 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("stats.emptyCta")}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const trendIcon = stats.trendDirection === "up" ? "↑" : stats.trendDirection === "down" ? "↓" : "→";
  const trendColor = stats.trendDirection === "up"
    ? "text-emerald-600 dark:text-emerald-400"
    : stats.trendDirection === "down"
      ? "text-red-600 dark:text-red-400"
      : "text-slate-500 dark:text-slate-400";

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="stats" />

      <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Section 1: Learning Progress Summary */}
          <section className="animate-fade-in">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                {t("stats.learningProgress")}
              </p>
              <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                {/* Band + Trend */}
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-5xl font-semibold ${getBandColor(stats.averageBand)}`}>
                      {stats.averageBand}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {t("stats.avgBand")}
                    </span>
                    <span className={`text-lg font-medium ${trendColor}`}>
                      {trendIcon}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {getBandLabel(stats.averageBand)} · {t(`stats.trend.${stats.trendDirection}`)}
                  </p>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <QuickStat label={t("stats.thisWeek")} value={stats.thisWeekSessions} />
                  <QuickStat label={t("stats.totalSessions")} value={stats.totalSessions} />
                  <QuickStat label={t("stats.practiceDays")} value={stats.practiceDays} />
                </div>
              </div>

              {/* Goal Progress */}
              {goalProgress && (
                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {t("stats.weeklyGoal")}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {goalProgress.weeklyCompleted}/{goalProgress.weeklyTarget} {t("stats.sessions")}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${goalProgress.weeklyProgress}%` }}
                    />
                  </div>
                  {goalProgress.isWeeklyGoalMet && (
                    <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {t("stats.goalMet")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Section 2: Weakness + Recommended Actions */}
          <div className="grid gap-4 sm:grid-cols-2 animate-card-in">
            {/* Weak Dimensions */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                {t("stats.weakAreas")}
              </h3>
              {stats.weakDimensions.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {stats.weakDimensions.map((dim) => (
                    <li key={dim.name} className="flex items-center justify-between text-sm">
                      <span className="text-amber-900 dark:text-amber-100">
                        {t(`stats.dimension.${dim.name}`) !== `stats.dimension.${dim.name}` ? t(`stats.dimension.${dim.name}`) : getDimensionLabel(dim.name)}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-amber-800 shadow-sm dark:bg-slate-900 dark:text-amber-200">
                        {dim.count}×
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                  {t("stats.noWeakAreas")}
                </p>
              )}
            </div>

            {/* Recommended Actions */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                {t("stats.recommendedActions")}
              </h3>
              <div className="mt-3 space-y-3">
                <ActionLink
                  href="/practice/setup"
                  label={t("stats.actionDrill")}
                  desc={t("stats.actionDrillDesc")}
                  color="emerald"
                />
                <ActionLink
                  href="/practice/shadowing"
                  label={t("stats.actionShadowing")}
                  desc={t("stats.actionShadowingDesc")}
                  color="cyan"
                />
                <ActionLink
                  href="/history"
                  label={t("stats.actionHistory")}
                  desc={t("stats.actionHistoryDesc")}
                  color="slate"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Band Trend (compact) */}
          {stats.bandHistory.length > 1 && (
            <section className="animate-card-in">
              <details className="group rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
                <summary className="cursor-pointer list-none p-5 font-semibold text-slate-950 dark:text-white sm:p-6">
                  {t("stats.bandTrend")}
                  <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">
                    {t("feedback.expand")}
                  </span>
                  <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">
                    {t("feedback.collapse")}
                  </span>
                </summary>
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  <LineChart
                    data={stats.bandHistory.map((h) => ({
                      label: h.date.split("-").slice(1).join("/"),
                      value: h.band,
                    }))}
                    height={180}
                    color="rgb(16, 185, 129)"
                  />
                </div>
              </details>
            </section>
          )}

          {/* Section 4: Detailed Stats (collapsed) */}
          <section className="animate-card-in">
            <details className="group rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
              <summary className="cursor-pointer list-none p-5 font-semibold text-slate-950 dark:text-white sm:p-6">
                {t("stats.detailedStats")}
                <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">
                  {t("feedback.expand")}
                </span>
                <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">
                  {t("feedback.collapse")}
                </span>
              </summary>
              <div className="space-y-6 px-5 pb-5 sm:px-6 sm:pb-6">
                {/* Score Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <ScoreCard label={t("stats.highest")} value={stats.highestBand} />
                  <ScoreCard label={t("stats.average")} value={stats.averageBand} />
                  <ScoreCard label={t("stats.lowest")} value={stats.lowestBand} />
                </div>

                {/* Weekly Activity */}
                <div>
                  <h4 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t("stats.weeklyActivity")}
                  </h4>
                  <BarChart
                    data={stats.weeklyTrend.map((w) => ({
                      label: w.week,
                      value: w.count,
                      color: "rgb(16, 185, 129)",
                    }))}
                    height={150}
                  />
                </div>

                {/* Practice Distribution */}
                <div>
                  <h4 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t("stats.distribution")}
                  </h4>
                  <DonutChart
                    data={[
                      { label: "Part 1", value: stats.part1Count, color: "rgb(59, 130, 246)" },
                      { label: "Part 2", value: stats.part2Count, color: "rgb(16, 185, 129)" },
                      { label: "Part 3", value: stats.part3Count, color: "rgb(245, 158, 11)" },
                    ]}
                  />
                </div>
              </div>
            </details>
          </section>

          {/* Recent Sessions */}
          {stats.recentSessions.length > 0 && (
            <section className="animate-card-in">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-950 dark:text-white">
                    {t("stats.recentSessions")}
                  </h3>
                  <Link
                    href="/history"
                    className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {t("stats.viewAll")}
                  </Link>
                </div>
                <div className="space-y-2">
                  {stats.recentSessions.slice(0, 5).map((session) => (
                    <Link
                      key={session.id}
                      href={`/history?id=${session.id}`}
                      className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {formatMode(session.mode)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div
                        className={`rounded-full px-3 py-1 text-sm font-medium ${getBandBgColor(session.feedback.estimatedBand)} ${getBandColor(session.feedback.estimatedBand)}`}
                      >
                        {session.feedback.estimatedBand}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-white/10">
        <p>{t("home.footer")}</p>
      </footer>
    </div>
  );
}


function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center dark:border-white/5 dark:bg-white/5">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${getBandColor(value)}`}>{value}</p>
    </div>
  );
}

function ActionLink({
  href,
  label,
  desc,
  color,
}: {
  href: string;
  label: string;
  desc: string;
  color: "emerald" | "cyan" | "slate";
}) {
  const colorClasses = {
    emerald: "hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10",
    cyan: "hover:border-cyan-300 hover:bg-cyan-50 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10",
    slate: "hover:border-slate-400 hover:bg-slate-50 dark:hover:border-white/30 dark:hover:bg-white/5",
  };

  return (
    <Link
      href={href}
      className={`block rounded-xl border border-slate-200 bg-white p-3 transition dark:border-white/10 dark:bg-slate-900 ${colorClasses[color]}`}
    >
      <p className="text-sm font-medium text-slate-950 dark:text-white">{label}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{desc}</p>
    </Link>
  );
}

function formatMode(mode: string): string {
  if (mode.includes("part_2")) return "IELTS Part 2";
  if (mode.includes("part_3")) return "IELTS Part 3";
  return "IELTS Part 1";
}
