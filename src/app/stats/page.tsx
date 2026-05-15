"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  calculateStats,
  getBandColor,
  getBandBgColor,
  getBandLabel,
  type PracticeStats,
} from "@/lib/stats";
import { LineChart, BarChart, DonutChart } from "@/components/Chart";

export default function StatsPage() {
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStats(calculateStats());
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
        <nav className="w-full px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <Link
              href="/"
              className="text-lg font-bold text-gray-900 dark:text-white"
            >
              EchoLingo
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/practice"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Practice
              </Link>
              <Link
                href="/history"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                History
              </Link>
              <Link
                href="/stats"
                className="text-sm text-blue-600 dark:text-blue-400 font-medium"
              >
                Stats
              </Link>
              <Link
                href="/settings"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-1 flex items-center justify-center">
          <div className="flex gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
          </div>
        </main>
      </div>
    );
  }

  if (!stats || stats.totalSessions === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
        <nav className="w-full px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <Link
              href="/"
              className="text-lg font-bold text-gray-900 dark:text-white"
            >
              EchoLingo
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/practice"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Practice
              </Link>
              <Link
                href="/history"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                History
              </Link>
              <Link
                href="/stats"
                className="text-sm text-blue-600 dark:text-blue-400 font-medium"
              >
                Stats
              </Link>
              <Link
                href="/settings"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="text-center animate-fade-in">
            <div className="text-6xl mb-6">📊</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              No Practice Data Yet
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
              Complete your first practice session to see your progress
              statistics and performance trends.
            </p>
            <Link
              href="/practice"
              className="inline-flex items-center justify-center h-12 px-8 rounded-lg bg-blue-600 text-white font-medium transition-all hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Practicing
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
      <nav className="w-full px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold text-gray-900 dark:text-white"
          >
            EchoLingo
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/practice"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Practice
            </Link>
            <Link
              href="/history"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              History
            </Link>
            <Link
              href="/stats"
              className="text-sm text-blue-600 dark:text-blue-400 font-medium"
            >
              Stats
            </Link>
            <Link
              href="/settings"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Settings
            </Link>
          </div>
        </div>
      </nav>

      <main id="main-content" className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 animate-fade-in">
            Practice Statistics
          </h1>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-card-in">
            <StatCard
              label="Total Sessions"
              value={stats.totalSessions}
              icon="🎯"
            />
            <StatCard
              label="This Week"
              value={stats.thisWeekSessions}
              icon="📅"
            />
            <StatCard
              label="This Month"
              value={stats.thisMonthSessions}
              icon="📈"
            />
            <StatCard
              label="Average Band"
              value={stats.averageBand}
              icon="⭐"
              isDecimal
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 animate-card-in">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Highest Band
              </div>
              <div
                className={`text-3xl font-bold ${getBandColor(stats.highestBand)}`}
              >
                {stats.highestBand}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {getBandLabel(stats.highestBand)}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Lowest Band
              </div>
              <div
                className={`text-3xl font-bold ${getBandColor(stats.lowestBand)}`}
              >
                {stats.lowestBand}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {getBandLabel(stats.lowestBand)}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Average Band
              </div>
              <div
                className={`text-3xl font-bold ${getBandColor(stats.averageBand)}`}
              >
                {stats.averageBand}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {getBandLabel(stats.averageBand)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-card-in">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Band Score Trend
              </h2>
              <LineChart
                data={stats.bandHistory.map((h) => ({
                  label: h.date.split("-").slice(1).join("/"),
                  value: h.band,
                }))}
                height={180}
                color="rgb(59, 130, 246)"
              />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Weekly Activity
              </h2>
              <BarChart
                data={stats.weeklyTrend.map((w) => ({
                  label: w.week,
                  value: w.count,
                  color: "rgb(59, 130, 246)",
                }))}
                height={180}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-8 animate-card-in">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Practice Distribution
            </h2>
            <DonutChart
              data={[
                {
                  label: "Part 1",
                  value: stats.part1Count,
                  color: "rgb(59, 130, 246)",
                },
                {
                  label: "Part 2",
                  value: stats.part2Count,
                  color: "rgb(16, 185, 129)",
                },
                {
                  label: "Part 3",
                  value: stats.part3Count,
                  color: "rgb(245, 158, 11)",
                },
              ]}
            />
          </div>

          {stats.recentSessions.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 animate-card-in">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Recent Sessions
                </h2>
                <Link
                  href="/history"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View All
                </Link>
              </div>
              <div className="space-y-3">
                {stats.recentSessions.slice(0, 5).map((session) => (
                  <Link
                    key={session.id}
                    href={`/history?id=${session.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatMode(session.mode)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(session.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getBandBgColor(session.feedback.estimatedBand)} ${getBandColor(session.feedback.estimatedBand)}`}
                    >
                      {session.feedback.estimatedBand}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800">
        <p>EchoLingo - AI-powered IELTS Speaking practice</p>
      </footer>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  isDecimal = false,
}: {
  label: string;
  value: number;
  icon: string;
  isDecimal?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {isDecimal ? value.toFixed(1) : value}
      </div>
    </div>
  );
}

function formatMode(mode: string): string {
  if (mode.includes("part_2")) return "IELTS Part 2";
  if (mode.includes("part_3")) return "IELTS Part 3";
  return "IELTS Part 1";
}
