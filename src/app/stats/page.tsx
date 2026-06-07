"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import { BarChart } from "@/components/Chart"
import { getTasks } from "@/lib/unified-task-history"
import { deriveTaskTypeWeakness, rankWeaknesses, ALL_TASK_TYPES } from "@/lib/task-weakness"
import type { PracticeTask, PteTaskType, TaskTypeWeakness } from "@/types"

// ── Labels ────────────────────────────────────────────────────────────────────

const TASK_SHORT: Record<PteTaskType, string> = {
  read_aloud: "RA",
  repeat_sentence: "RS",
  answer_short_question: "ASQ",
  summarize_written_text: "SWT",
  write_essay: "WE",
  personal_intro: "PI",
  write_from_dictation: "WFD",
  describe_image: "DI",
  re_tell_lecture: "RTL",
}

const TASK_LABELS: Record<PteTaskType, string> = {
  read_aloud: "Read Aloud",
  repeat_sentence: "Repeat Sentence",
  answer_short_question: "Answer Short Question",
  summarize_written_text: "Summarize Written Text",
  write_essay: "Write Essay",
  personal_intro: "Personal Intro",
  write_from_dictation: "Write from Dictation",
  describe_image: "Describe Image",
  re_tell_lecture: "Re-tell Lecture",
}

// ── Data computation ──────────────────────────────────────────────────────────

type PteStats = {
  totalTasks: number
  thisWeekTasks: number
  practiceDays: number
  weaknesses: TaskTypeWeakness[]
  weeklyActivity: Array<{ week: string; count: number }>
  taskTypeBreakdown: Array<{ taskType: PteTaskType; count: number }>
}

function getWeekLabel(date: Date): string {
  const m = date.toLocaleDateString("en-US", { month: "short" })
  const d = date.getDate()
  return `${m} ${d}`
}

function computeStats(tasks: PracticeTask[]): PteStats {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const thisWeekTasks = tasks.filter((t) => new Date(t.createdAt) >= weekStart).length

  const practiceDays = new Set(
    tasks.map((t) => new Date(t.createdAt).toLocaleDateString())
  ).size

  const weaknesses = rankWeaknesses(deriveTaskTypeWeakness(tasks))

  // Last 8 weeks of activity
  const weeklyActivity: Array<{ week: string; count: number }> = []
  for (let i = 7; i >= 0; i--) {
    const wStart = new Date(weekStart)
    wStart.setDate(weekStart.getDate() - i * 7)
    const wEnd = new Date(wStart)
    wEnd.setDate(wStart.getDate() + 7)
    const count = tasks.filter((t) => {
      const d = new Date(t.createdAt)
      return d >= wStart && d < wEnd
    }).length
    weeklyActivity.push({ week: getWeekLabel(wStart), count })
  }

  const typeCount = new Map<PteTaskType, number>()
  for (const taskType of ALL_TASK_TYPES) typeCount.set(taskType, 0)
  for (const task of tasks) typeCount.set(task.taskType, (typeCount.get(task.taskType) ?? 0) + 1)
  const taskTypeBreakdown = ALL_TASK_TYPES.map((tt) => ({ taskType: tt, count: typeCount.get(tt) ?? 0 }))

  return { totalTasks: tasks.length, thisWeekTasks, practiceDays, weaknesses, weeklyActivity, taskTypeBreakdown }
}

// ── Small components ──────────────────────────────────────────────────────────

function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

function WeaknessBar({ weakness }: { weakness: TaskTypeWeakness }) {
  const score = weakness.score
  const barColor =
    score < 40 ? "bg-red-500" : score < 65 ? "bg-amber-400" : "bg-emerald-500"
  const labelColor =
    score < 40
      ? "text-red-700 dark:text-red-400"
      : score < 65
      ? "text-amber-700 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400"

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-700 dark:text-slate-200 font-medium">
          {TASK_LABELS[weakness.taskType]}
        </span>
        <div className="flex items-center gap-2">
          {weakness.recentCount === 0 && (
            <span className="text-slate-400 dark:text-slate-500 italic">no data</span>
          )}
          <span className={`font-semibold tabular-nums ${labelColor}`}>
            {weakness.recentCount > 0 ? score : "—"}
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        {weakness.recentCount > 0 && (
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${score}%` }}
          />
        )}
      </div>
      {weakness.recentCount > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {weakness.recentCount} task{weakness.recentCount !== 1 ? "s" : ""}
          {weakness.lastPracticed
            ? ` · last: ${new Date(weakness.lastPracticed).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : ""}
        </p>
      )}
    </div>
  )
}

function ActionLink({
  href,
  label,
  desc,
  color,
}: {
  href: string
  label: string
  desc: string
  color: "emerald" | "cyan" | "slate"
}) {
  const colorClasses = {
    emerald: "hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10",
    cyan: "hover:border-cyan-300 hover:bg-cyan-50 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10",
    slate: "hover:border-slate-400 hover:bg-slate-50 dark:hover:border-white/30 dark:hover:bg-white/5",
  }
  return (
    <Link
      href={href}
      className={`block rounded-xl border border-slate-200 bg-white p-3 transition dark:border-white/10 dark:bg-slate-900 ${colorClasses[color]}`}
    >
      <p className="text-sm font-medium text-slate-950 dark:text-white">{label}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{desc}</p>
    </Link>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [stats, setStats] = useState<PteStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const timer = setTimeout(async () => {
      try {
        const tasks = await getTasks()
        if (mounted) setStats(computeStats(tasks))
      } catch {
        if (mounted) setStats(null)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }, 300)
    return () => { mounted = false; clearTimeout(timer) }
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
        <DesktopNav active="stats" />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex gap-2">
            {["-0.3s", "-0.15s", "0s"].map((d, i) => (
              <div key={i} className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce"
                style={{ animationDelay: d }} />
            ))}
          </div>
        </main>
      </div>
    )
  }

  if (!stats || stats.totalTasks === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
        <DesktopNav active="stats" />
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="text-center animate-fade-in">
            <div className="text-6xl mb-6">📊</div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
              No practice data yet
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md">
              Complete a PTE practice task to see your task-type weakness profile and progress trends.
            </p>
            <Link
              href="/practice"
              className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-medium transition-all hover:bg-slate-800 dark:hover:bg-slate-200 hover:shadow-lg"
            >
              Start Practicing
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const topWeaknesses = stats.weaknesses.filter((w) => w.recentCount > 0 && w.score < 65).slice(0, 3)

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="stats" />

      <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Section 1: Overview */}
          <section className="animate-fade-in">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Practice Overview
              </p>
              <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-5xl font-semibold text-slate-950 dark:text-white">
                    {stats.totalTasks}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    total practice tasks
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <QuickStat label="This week" value={stats.thisWeekTasks} />
                  <QuickStat label="Total tasks" value={stats.totalTasks} />
                  <QuickStat label="Practice days" value={stats.practiceDays} />
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Task-Type Weakness */}
          <section className="animate-card-in">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                    Task-Type Weakness
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Score 0–100, lower means weaker. Based on recent practice only.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {stats.weaknesses.map((w) => (
                  <WeaknessBar key={w.taskType} weakness={w} />
                ))}
              </div>
            </div>
          </section>

          {/* Section 3: Focus areas + Recommended actions */}
          <div className="grid gap-4 sm:grid-cols-2 animate-card-in">
            {/* Focus areas */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Focus areas
              </h3>
              {topWeaknesses.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {topWeaknesses.map((w) => (
                    <li key={w.taskType} className="flex items-center justify-between text-sm">
                      <Link
                        href={`/practice/${w.taskType.replace(/_/g, "-")}`}
                        className="text-amber-900 dark:text-amber-100 hover:underline"
                      >
                        {TASK_LABELS[w.taskType]}
                      </Link>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-amber-800 shadow-sm dark:bg-slate-900 dark:text-amber-200">
                        score {w.score}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                  {stats.weaknesses.every((w) => w.recentCount === 0)
                    ? "No tasks practiced yet."
                    : "No weak areas detected. Keep it up!"}
                </p>
              )}
            </div>

            {/* Recommended actions */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white mb-3">
                Recommended next steps
              </h3>
              <div className="space-y-3">
                <ActionLink href="/practice" label="Task Practice" desc="Pick any PTE task type and drill with AI feedback." color="emerald" />
                <ActionLink href="/mock" label="Mock Exam" desc="Sequence all task types under exam conditions." color="cyan" />
                <ActionLink href="/history" label="Review History" desc="Browse past practice tasks and revisit feedback." color="slate" />
              </div>
            </div>
          </div>

          {/* Section 4: Practice distribution */}
          <section className="animate-card-in">
            <details className="group rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
              <summary className="cursor-pointer list-none p-5 font-semibold text-slate-950 dark:text-white sm:p-6">
                Practice distribution
                <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">Show</span>
                <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">Hide</span>
              </summary>
              <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                <BarChart
                  data={stats.taskTypeBreakdown.map((b) => ({
                    label: TASK_SHORT[b.taskType],
                    value: b.count,
                    color: "rgb(16, 185, 129)",
                  }))}
                  height={160}
                />
                <div className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 text-xs text-slate-500 dark:text-slate-400">
                  {stats.taskTypeBreakdown.map((b) => (
                    <div key={b.taskType} className="flex items-center gap-1">
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {TASK_SHORT[b.taskType]}
                      </span>
                      <span>— {TASK_LABELS[b.taskType]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </section>

          {/* Section 5: Weekly activity */}
          {stats.weeklyActivity.some((w) => w.count > 0) && (
            <section className="animate-card-in">
              <details className="group rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
                <summary className="cursor-pointer list-none p-5 font-semibold text-slate-950 dark:text-white sm:p-6">
                  Weekly activity
                  <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">Show</span>
                  <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">Hide</span>
                </summary>
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  <BarChart
                    data={stats.weeklyActivity.map((w) => ({
                      label: w.week,
                      value: w.count,
                      color: "rgb(16, 185, 129)",
                    }))}
                    height={150}
                  />
                </div>
              </details>
            </section>
          )}

        </div>
      </main>

      <footer className="py-6 text-center text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-white/10">
        <p>EchoLingo — PTE Academic practice</p>
      </footer>
    </div>
  )
}
