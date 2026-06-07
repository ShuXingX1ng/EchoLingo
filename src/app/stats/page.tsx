"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import { BarChart, LineChart } from "@/components/Chart"
import { getTasks } from "@/lib/unified-task-history"
import { deriveTaskTypeWeakness, rankWeaknesses, ALL_TASK_TYPES } from "@/lib/task-weakness"
import type { PracticeTask, PteTaskType, TaskTypeWeakness, DimensionWeakness } from "@/types"

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
  fill_in_the_blanks_reading: "FIB",
  re_order_paragraphs: "ROP",
  multiple_choice_reading: "MCR",
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
  fill_in_the_blanks_reading: "Fill in the Blanks",
  re_order_paragraphs: "Re-order Paragraphs",
  multiple_choice_reading: "Multiple Choice",
}

const SPEAKING_SCORED_TASKS = new Set<PteTaskType>([
  "read_aloud", "repeat_sentence", "answer_short_question", "describe_image", "re_tell_lecture",
])

const WRITING_SCORED_TASKS = new Set<PteTaskType>(["summarize_written_text", "write_essay"])

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDim(dims: DimensionWeakness[], name: string): number | null {
  return dims.find((d) => d.dimension === name)?.score ?? null
}

function aggregateProfileScores(
  weaknesses: TaskTypeWeakness[],
  taskSet: Set<PteTaskType>,
  dimNames: string[],
): Array<{ label: string; score: number }> | null {
  const totals = Object.fromEntries(dimNames.map((d) => [d, { sum: 0, count: 0 }]))
  for (const w of weaknesses) {
    if (!taskSet.has(w.taskType) || !w.dimensions || w.recentCount === 0) continue
    for (const dim of dimNames) {
      const score = getDim(w.dimensions, dim)
      if (score !== null) {
        totals[dim].sum += score
        totals[dim].count++
      }
    }
  }
  const hasAny = dimNames.some((d) => totals[d].count > 0)
  if (!hasAny) return null
  return dimNames.map((d) => ({
    label: d.charAt(0).toUpperCase() + d.slice(1),
    score: totals[d].count > 0 ? Math.round(totals[d].sum / totals[d].count) : 0,
  }))
}

// Overall score for a single task — uses dimension scores when available, otherwise heuristic
function taskOverallScore(task: PracticeTask): number | null {
  if (!task.feedback) return null
  const ds = task.feedback.dimensionScores
  if (ds) {
    if (ds.section === "speaking") return Math.round((ds.fluency + ds.pronunciation + ds.content) / 3)
    if (ds.section === "writing") return Math.round((ds.grammar + ds.vocabulary + ds.form + ds.content) / 4)
    if (ds.section === "reading") return Math.round((ds.vocabulary + ds.comprehension) / 2)
  }
  const s = task.feedback.strengths.length
  const w = task.feedback.weaknesses.length
  const t = s + w
  return t === 0 ? 50 : Math.round((s / t) * 100)
}

function getWeekLabel(date: Date): string {
  const m = date.toLocaleDateString("en-US", { month: "short" })
  return `${m} ${date.getDate()}`
}

// ── Data types ────────────────────────────────────────────────────────────────

type DimProfile = Array<{ label: string; score: number }>

type PteStats = {
  totalTasks: number
  thisWeekTasks: number
  practiceDays: number
  weaknesses: TaskTypeWeakness[]
  weeklyActivity: Array<{ week: string; count: number }>
  taskTypeBreakdown: Array<{ taskType: PteTaskType; count: number }>
  speakingProfile: DimProfile | null
  writingProfile: DimProfile | null
  weeklyScores: Map<PteTaskType, Array<{ week: string; avgScore: number | null }>>
}

function computeStats(tasks: PracticeTask[]): PteStats {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const thisWeekTasks = tasks.filter((t) => new Date(t.createdAt) >= weekStart).length
  const practiceDays = new Set(tasks.map((t) => new Date(t.createdAt).toLocaleDateString())).size
  const weaknesses = rankWeaknesses(deriveTaskTypeWeakness(tasks))

  const speakingProfile = aggregateProfileScores(
    weaknesses,
    SPEAKING_SCORED_TASKS,
    ["fluency", "pronunciation", "content"],
  )
  const writingProfile = aggregateProfileScores(
    weaknesses,
    WRITING_SCORED_TASKS,
    ["grammar", "vocabulary", "form", "content"],
  )

  // Last 8 week buckets
  const weekStarts: Date[] = []
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(weekStart)
    ws.setDate(weekStart.getDate() - i * 7)
    weekStarts.push(ws)
  }

  const weeklyActivity = weekStarts.map((ws) => {
    const we = new Date(ws)
    we.setDate(ws.getDate() + 7)
    return {
      week: getWeekLabel(ws),
      count: tasks.filter((t) => { const d = new Date(t.createdAt); return d >= ws && d < we }).length,
    }
  })

  const typeCount = new Map<PteTaskType, number>()
  for (const taskType of ALL_TASK_TYPES) typeCount.set(taskType, 0)
  for (const task of tasks) typeCount.set(task.taskType, (typeCount.get(task.taskType) ?? 0) + 1)
  const taskTypeBreakdown = ALL_TASK_TYPES.map((tt) => ({ taskType: tt, count: typeCount.get(tt) ?? 0 }))

  // Weekly average overall score per task type
  const weeklyScores = new Map<PteTaskType, Array<{ week: string; avgScore: number | null }>>()
  for (const taskType of ALL_TASK_TYPES) {
    weeklyScores.set(
      taskType,
      weekStarts.map((ws) => {
        const we = new Date(ws)
        we.setDate(ws.getDate() + 7)
        const scored = tasks
          .filter((t) => { const d = new Date(t.createdAt); return t.taskType === taskType && d >= ws && d < we })
          .map(taskOverallScore)
          .filter((s): s is number => s !== null)
        return {
          week: getWeekLabel(ws),
          avgScore: scored.length > 0 ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
        }
      }),
    )
  }

  return {
    totalTasks: tasks.length,
    thisWeekTasks,
    practiceDays,
    weaknesses,
    weeklyActivity,
    taskTypeBreakdown,
    speakingProfile,
    writingProfile,
    weeklyScores,
  }
}

// ── SVG Radar Chart ───────────────────────────────────────────────────────────

function RadarChart({ dims, target }: { dims: DimProfile; target: number }) {
  const n = dims.length
  const cx = 110
  const cy = 105
  const maxR = 72

  const angle = (i: number) => (i * (2 * Math.PI)) / n - Math.PI / 2

  const toXY = (score: number, i: number) => {
    const r = (score / 100) * maxR
    return { x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) }
  }

  const poly = (scores: number[]) =>
    scores
      .map((s, i) => toXY(s, i))
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ") + " Z"

  const gridPoly = (pct: number) => poly(Array(n).fill(pct))
  const scorePoly = poly(dims.map((d) => d.score))
  const targetPoly = poly(Array(n).fill(target))

  return (
    <svg viewBox="0 0 220 218" className="w-full max-w-[240px] mx-auto">
      {[25, 50, 75, 100].map((p) => (
        <path key={p} d={gridPoly(p)} fill="none" stroke="currentColor" strokeWidth="0.5"
          className="text-slate-200 dark:text-white/10" />
      ))}
      {dims.map((_, i) => {
        const end = toXY(100, i)
        return (
          <line key={i} x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)}
            stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-white/10" />
        )
      })}
      <path d={targetPoly} fill="rgb(234,179,8)" fillOpacity="0.08"
        stroke="rgb(234,179,8)" strokeWidth="1" strokeDasharray="3,2" />
      <path d={scorePoly} fill="rgb(16,185,129)" fillOpacity="0.22"
        stroke="rgb(16,185,129)" strokeWidth="1.5" strokeLinejoin="round" />
      {dims.map((d, i) => {
        const p = toXY(d.score, i)
        return <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3"
          fill="rgb(16,185,129)" stroke="white" strokeWidth="0.8" />
      })}
      {dims.map((d, i) => {
        const r = maxR + 17
        const lx = (cx + r * Math.cos(angle(i))).toFixed(1)
        const ly = (cy + r * Math.sin(angle(i))).toFixed(1)
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
            fontSize="9" className="fill-slate-600 dark:fill-slate-300">
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}

// ── Gap Analysis ──────────────────────────────────────────────────────────────

function GapAnalysis({ dims, target }: { dims: DimProfile; target: number }) {
  return (
    <div className="space-y-3">
      {dims.map(({ label, score }) => {
        const gap = target - score
        const barCls = score >= target
          ? "bg-emerald-500"
          : score >= target - 20
          ? "bg-amber-400"
          : "bg-red-500"
        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
              <span className="tabular-nums">
                <span className="text-slate-500">{score} / 100</span>
                {gap > 0 ? (
                  <span className="ml-2 text-red-500 dark:text-red-400">−{gap} to target</span>
                ) : (
                  <span className="ml-2 text-emerald-600 dark:text-emerald-400">+{Math.abs(gap)} above</span>
                )}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-visible">
              <div className={`h-full rounded-full ${barCls}`} style={{ width: `${score}%` }} />
              <div
                className="absolute top-0 h-full w-px bg-amber-400"
                style={{ left: `${target}%` }}
              />
            </div>
          </div>
        )
      })}
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Yellow line = target ({target}). Scores are 0–100 internal reference values, not official PTE scores.
      </p>
    </div>
  )
}

// ── WeaknessBar (with expandable sub-dimensions) ──────────────────────────────

function WeaknessBar({ weakness }: { weakness: TaskTypeWeakness }) {
  const [expanded, setExpanded] = useState(false)
  const score = weakness.score
  const barColor = score < 40 ? "bg-red-500" : score < 65 ? "bg-amber-400" : "bg-emerald-500"
  const labelColor =
    score < 40
      ? "text-red-700 dark:text-red-400"
      : score < 65
      ? "text-amber-700 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400"
  const hasDims = !!(weakness.dimensions && weakness.dimensions.length > 0 && weakness.recentCount > 0)

  return (
    <div className="space-y-1">
      <div
        className={`flex items-center justify-between text-xs ${hasDims ? "cursor-pointer select-none" : ""}`}
        onClick={() => hasDims && setExpanded((v) => !v)}
      >
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
          {hasDims && (
            <span className="text-slate-400 dark:text-slate-500 text-[10px]">
              {expanded ? "▲" : "▼"}
            </span>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        {weakness.recentCount > 0 && (
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
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

      {/* Expandable per-dimension breakdown */}
      {expanded && weakness.dimensions && (
        <div className="mt-2 ml-3 pl-3 border-l-2 border-slate-100 dark:border-white/10 space-y-1.5">
          {weakness.dimensions.map((d) => {
            const dimBar = d.score < 40 ? "bg-red-400" : d.score < 65 ? "bg-amber-400" : "bg-emerald-400"
            return (
              <div key={d.dimension} className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="capitalize text-slate-500 dark:text-slate-400">{d.dimension}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">{d.score}</span>
                </div>
                <div className="h-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${dimBar}`} style={{ width: `${d.score}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ActionLink ────────────────────────────────────────────────────────────────

function ActionLink({ href, label, desc, color }: {
  href: string; label: string; desc: string; color: "emerald" | "cyan" | "slate"
}) {
  const colorClasses = {
    emerald: "hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10",
    cyan: "hover:border-cyan-300 hover:bg-cyan-50 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10",
    slate: "hover:border-slate-400 hover:bg-slate-50 dark:hover:border-white/30 dark:hover:bg-white/5",
  }
  return (
    <Link href={href}
      className={`block rounded-xl border border-slate-200 bg-white p-3 transition dark:border-white/10 dark:bg-slate-900 ${colorClasses[color]}`}>
      <p className="text-sm font-medium text-slate-950 dark:text-white">{label}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{desc}</p>
    </Link>
  )
}

function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [stats, setStats] = useState<PteStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [targetScore, setTargetScore] = useState(75)
  const [selectedProgressTask, setSelectedProgressTask] = useState<PteTaskType | null>(null)
  const [profileTab, setProfileTab] = useState<"speaking" | "writing">("speaking")

  useEffect(() => {
    let mounted = true
    const timer = setTimeout(async () => {
      try {
        const tasks = await getTasks()
        if (mounted) {
          const s = computeStats(tasks)
          setStats(s)
          // Default progress task to the most-practiced task type
          const practiced = s.weaknesses.find((w) => w.recentCount > 0)
          if (practiced) setSelectedProgressTask(practiced.taskType)
          // Default profile tab to whichever section has data
          if (!s.speakingProfile && s.writingProfile) setProfileTab("writing")
        }
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">No practice data yet</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md">
              Complete a PTE practice task to see your task-type weakness profile and progress trends.
            </p>
            <Link href="/practice"
              className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-medium transition-all hover:bg-slate-800 dark:hover:bg-slate-200 hover:shadow-lg">
              Start Practicing
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const topWeaknesses = stats.weaknesses.filter((w) => w.recentCount > 0 && w.score < 65).slice(0, 3)
  const activeProfile = profileTab === "speaking" ? stats.speakingProfile : stats.writingProfile
  const hasDimensionData = !!(stats.speakingProfile || stats.writingProfile)

  // Progress curve: show weeks that have at least one data point for the selected task
  const progressData = selectedProgressTask
    ? (stats.weeklyScores.get(selectedProgressTask) ?? [])
        .filter((w) => w.avgScore !== null)
        .map((w) => ({ label: w.week, value: w.avgScore! }))
    : []

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
                  <p className="text-5xl font-semibold text-slate-950 dark:text-white">{stats.totalTasks}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">total practice tasks</p>
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
                    Score 0–100, lower means weaker. Tap a row to expand per-dimension breakdown.
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

          {/* Section 3: Dimension Profile + Gap Analysis (shown only when dimension data exists) */}
          {hasDimensionData && (
            <section className="animate-card-in">
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-400">
                      Learner Profile
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Aggregate dimension scores across all practiced task types.
                    </p>
                  </div>

                  {/* Section tab switcher */}
                  {stats.speakingProfile && stats.writingProfile && (
                    <div className="flex rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden text-xs">
                      {(["speaking", "writing"] as const).map((tab) => (
                        <button key={tab} onClick={() => setProfileTab(tab)}
                          className={`px-3 py-1.5 capitalize transition ${
                            profileTab === tab
                              ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                          }`}>
                          {tab}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {activeProfile ? (
                  <div className="grid gap-6 sm:grid-cols-2 items-start">
                    {/* Radar chart */}
                    <div>
                      <RadarChart dims={activeProfile} target={targetScore} />
                      <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 -mt-1">
                        Green = your scores · Dashed = target ({targetScore})
                      </p>
                    </div>

                    {/* Target slider + gap analysis */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Target score: <span className="text-slate-950 dark:text-white font-semibold">{targetScore}</span>
                        </label>
                        <input
                          type="range" min={40} max={95} step={1} value={targetScore}
                          onChange={(e) => setTargetScore(Number(e.target.value))}
                          className="mt-2 w-full accent-amber-400"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                          <span>40</span><span>95</span>
                        </div>
                      </div>
                      <GapAnalysis dims={activeProfile} target={targetScore} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    No {profileTab} dimension data yet. Complete some {profileTab} tasks to see your profile.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Section 4: Focus areas + Recommended actions */}
          <div className="grid gap-4 sm:grid-cols-2 animate-card-in">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">Focus areas</h3>
              {topWeaknesses.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {topWeaknesses.map((w) => (
                    <li key={w.taskType} className="flex items-center justify-between text-sm">
                      <Link href={`/practice/${w.taskType.replace(/_/g, "-")}`}
                        className="text-amber-900 dark:text-amber-100 hover:underline">
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

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white mb-3">Recommended next steps</h3>
              <div className="space-y-3">
                <ActionLink href="/practice" label="Task Practice" desc="Pick any PTE task type and drill with AI feedback." color="emerald" />
                <ActionLink href="/mock" label="Mock Exam" desc="Sequence all task types under exam conditions." color="cyan" />
                <ActionLink href="/history" label="Review History" desc="Browse past practice tasks and revisit feedback." color="slate" />
              </div>
            </div>
          </div>

          {/* Section 5: Score Trajectory */}
          <section className="animate-card-in">
            <details className="group rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
              <summary className="cursor-pointer list-none p-5 font-semibold text-slate-950 dark:text-white sm:p-6">
                Score trajectory by task type
                <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">Show</span>
                <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">Hide</span>
              </summary>
              <div className="px-5 pb-5 sm:px-6 sm:pb-6 space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Weekly average overall score (0–100). Select a task type to view its trend.
                </p>

                {/* Task type pills — only practiced ones */}
                <div className="flex flex-wrap gap-2">
                  {stats.weaknesses.filter((w) => w.recentCount > 0).map((w) => (
                    <button key={w.taskType}
                      onClick={() => setSelectedProgressTask(w.taskType)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                        selectedProgressTask === w.taskType
                          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                          : "border border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                      }`}>
                      {TASK_SHORT[w.taskType]} — {TASK_LABELS[w.taskType]}
                    </button>
                  ))}
                </div>

                {selectedProgressTask && (
                  progressData.length >= 2 ? (
                    <LineChart
                      data={progressData}
                      height={130}
                      color="rgb(99, 102, 241)"
                    />
                  ) : (
                    <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                      Not enough weekly data for {TASK_LABELS[selectedProgressTask]} yet.
                    </p>
                  )
                )}
              </div>
            </details>
          </section>

          {/* Section 6: Practice distribution */}
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
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{TASK_SHORT[b.taskType]}</span>
                      <span>— {TASK_LABELS[b.taskType]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </section>

          {/* Section 7: Weekly activity */}
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
