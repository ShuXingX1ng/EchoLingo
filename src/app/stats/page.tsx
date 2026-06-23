"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { BarChart2, TrendingUp, AlertTriangle, Target } from "lucide-react"
import DesktopNav from "@/components/DesktopNav"
import { BarChart, LineChart } from "@/components/Chart"
import { getTasks } from "@/lib/unified-task-history"
import { deriveTaskTypeWeakness, rankWeaknesses, ALL_TASK_TYPES } from "@/lib/task-weakness"
import { useTranslation } from "@/lib/i18n"
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
  fill_in_the_blanks_reading: "FIB-R",
  re_order_paragraphs: "ROP",
  multiple_choice_reading: "MCR",
  summarize_spoken_text: "SST",
  fill_in_the_blanks_listening: "FIB-L",
  highlight_correct_summary: "HCS",
}

type TFunc = (key: string) => string

function getTaskLabels(t: TFunc): Record<PteTaskType, string> {
  return {
    read_aloud: t("mock.taskLabel.read_aloud"),
    repeat_sentence: t("mock.taskLabel.repeat_sentence"),
    answer_short_question: t("mock.taskLabel.answer_short_question"),
    summarize_written_text: t("mock.taskLabel.summarize_written_text"),
    write_essay: t("mock.taskLabel.write_essay"),
    personal_intro: t("mock.taskLabel.personal_intro"),
    write_from_dictation: t("mock.taskLabel.write_from_dictation"),
    describe_image: t("mock.taskLabel.describe_image"),
    re_tell_lecture: t("mock.taskLabel.re_tell_lecture"),
    fill_in_the_blanks_reading: t("mock.taskLabel.fill_in_the_blanks"),
    re_order_paragraphs: t("mock.taskLabel.re_order_paragraphs"),
    multiple_choice_reading: t("mock.taskLabel.multiple_choice"),
    summarize_spoken_text: t("mock.taskLabel.summarize_spoken_text"),
    fill_in_the_blanks_listening: t("mock.taskLabel.fill_in_the_blanks_listening"),
    highlight_correct_summary: t("mock.taskLabel.highlight_correct_summary"),
  }
}

const SPEAKING_SCORED_TASKS = new Set<PteTaskType>([
  "read_aloud", "repeat_sentence", "answer_short_question", "describe_image", "re_tell_lecture",
])

const WRITING_SCORED_TASKS = new Set<PteTaskType>(["summarize_written_text", "write_essay"])

const LISTENING_SCORED_TASKS = new Set<PteTaskType>([
  "summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary",
])

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
  listeningProfile: DimProfile | null
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
  const listeningProfile = aggregateProfileScores(
    weaknesses,
    LISTENING_SCORED_TASKS,
    ["comprehension", "accuracy"],
  )

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
    listeningProfile,
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

function getDimLabel(t: TFunc, label: string): string {
  const key = `stats.dimension.${label.toLowerCase()}`
  const translated = t(key)
  // If the key is not found (returns the key itself), fall back to the label
  return translated === key ? label : translated
}

function GapAnalysis({ dims, target }: { dims: DimProfile; target: number }) {
  const { t } = useTranslation()
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
              <span className="font-medium text-[var(--text-secondary)]">{getDimLabel(t, label)}</span>
              <span className="tabular-nums">
                <span className="text-slate-500">{score} / 100</span>
                {gap > 0 ? (
                  <span className="ml-2 text-red-500 dark:text-red-400">
                    {t("stats.gapToTarget", { gap: String(gap) })}
                  </span>
                ) : (
                  <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                    {t("stats.aboveTarget", { n: String(Math.abs(gap)) })}
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-[var(--border)] overflow-visible">
              <div className={`h-full rounded-full ${barCls}`} style={{ width: `${score}%` }} />
              <div
                className="absolute top-0 h-full w-px bg-amber-400"
                style={{ left: `${target}%` }}
              />
            </div>
          </div>
        )
      })}
      <p className="text-[11px] text-[var(--text-muted)]">
        {t("stats.gapLegend", { target: String(target) })}
      </p>
    </div>
  )
}

// ── WeaknessBar (with expandable sub-dimensions) ──────────────────────────────

function WeaknessBar({ weakness }: { weakness: TaskTypeWeakness }) {
  const { t } = useTranslation()
  const TASK_LABELS = getTaskLabels(t)
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
        <span className="text-[var(--text-secondary)] font-medium">
          {TASK_LABELS[weakness.taskType]}
        </span>
        <div className="flex items-center gap-2">
          {weakness.recentCount === 0 && (
            <span className="text-[var(--text-muted)] italic">{t("stats.noData")}</span>
          )}
          <span className={`font-semibold tabular-nums ${labelColor}`}>
            {weakness.recentCount > 0 ? score : "—"}
          </span>
          {hasDims && (
            <span className="text-[var(--text-muted)] text-[10px]">
              {expanded ? "▲" : "▼"}
            </span>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
        {weakness.recentCount > 0 && (
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
        )}
      </div>
      {weakness.recentCount > 0 && (
        <p className="text-[11px] text-[var(--text-muted)]">
          {(() => {
            const dateStr = weakness.lastPracticed
              ? new Date(weakness.lastPracticed).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : ""
            return weakness.recentCount === 1
              ? t("stats.taskCountSingle", { date: dateStr })
              : t("stats.taskCount", { count: String(weakness.recentCount), date: dateStr })
          })()}
        </p>
      )}

      {/* Expandable per-dimension breakdown */}
      {expanded && weakness.dimensions && (
        <div className="mt-2 ml-3 pl-3 border-l-2 border-[var(--border)] space-y-1.5">
          {weakness.dimensions.map((d) => {
            const dimBar = d.score < 40 ? "bg-red-400" : d.score < 65 ? "bg-amber-400" : "bg-emerald-400"
            return (
              <div key={d.dimension} className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="capitalize text-[var(--text-secondary)]">{d.dimension}</span>
                  <span className="tabular-nums text-[var(--text-secondary)]">{d.score}</span>
                </div>
                <div className="h-1 rounded-full bg-[var(--border)] overflow-hidden">
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
    slate: "hover:border-[var(--brand)] hover:bg-[var(--background)]",
  }
  return (
    <Link href={href}
      className={`block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 transition ${colorClasses[color]}`}>
      <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{desc}</p>
    </Link>
  )
}

function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold text-[var(--foreground)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const { t } = useTranslation()
  const TASK_LABELS = getTaskLabels(t)
  const [stats, setStats] = useState<PteStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [targetScore, setTargetScore] = useState(75)
  const [selectedProgressTask, setSelectedProgressTask] = useState<PteTaskType | null>(null)
  const [profileTab, setProfileTab] = useState<"speaking" | "writing" | "listening">("speaking")

  useEffect(() => {
    let mounted = true
    const timer = setTimeout(async () => {
      try {
        const tasks = await getTasks()
        if (mounted) {
          const s = computeStats(tasks)
          setStats(s)
          const practiced = s.weaknesses.find((w) => w.recentCount > 0)
          if (practiced) setSelectedProgressTask(practiced.taskType)
          if (!s.speakingProfile) {
            if (s.writingProfile) setProfileTab("writing")
            else if (s.listeningProfile) setProfileTab("listening")
          }
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
      <div className="flex flex-col min-h-screen">
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
      <div className="flex flex-col min-h-screen">
        <DesktopNav active="stats" />
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="text-center animate-fade-in">
            <div className="h-16 w-16 rounded-[20px] border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center justify-center mx-auto mb-6">
              <BarChart2 className="w-8 h-8" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{t("stats.emptyTitle")}</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md">{t("stats.emptyDesc")}</p>
            <Link href="/practice"
              className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-[var(--brand)] text-white font-medium transition-all hover:bg-[var(--brand-hover)] hover:shadow-lg">
              {t("stats.emptyCta")}
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const topWeaknesses = stats.weaknesses.filter((w) => w.recentCount > 0 && w.score < 65).slice(0, 3)
  const activeProfile = profileTab === "speaking" ? stats.speakingProfile
    : profileTab === "writing" ? stats.writingProfile
    : stats.listeningProfile
  const hasDimensionData = !!(stats.speakingProfile || stats.writingProfile || stats.listeningProfile)
  const availableProfileTabs = (["speaking", "writing", "listening"] as const).filter((tab) =>
    tab === "speaking" ? !!stats.speakingProfile
    : tab === "writing" ? !!stats.writingProfile
    : !!stats.listeningProfile,
  )

  const progressData = selectedProgressTask
    ? (stats.weeklyScores.get(selectedProgressTask) ?? [])
        .filter((w) => w.avgScore !== null)
        .map((w) => ({ label: w.week, value: w.avgScore! }))
    : []

  return (
    <div className="flex flex-col min-h-screen">
      <DesktopNav active="stats" />

      <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Page hero */}
          <div className="animate-enter rounded-[28px] border border-[#dce4ee] bg-white dark:bg-slate-900 shadow-[0_10px_26px_rgba(15,23,42,.055)] p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-[15px] border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <BarChart2 className="w-6 h-6" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.19em] text-emerald-700 dark:text-emerald-400">
                  {t("stats.analytics")}
                </p>
                <h1 className="text-xl font-bold text-[var(--foreground)]">{t("stats.yourProgress")}</h1>
              </div>
            </div>
          </div>

          {/* Section 1: Overview */}
          <section className="animate-fade-in">
            <div className="rounded-[22px] border border-[#dce4ee] bg-white dark:bg-slate-900 p-5 shadow-[0_10px_26px_rgba(15,23,42,.055)] sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.19em] text-emerald-700 dark:text-emerald-300">
                {t("stats.practiceOverview")}
              </p>
              <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-5xl font-semibold text-[var(--foreground)]">{stats.totalTasks}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("stats.totalPracticeTasks")}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <QuickStat label={t("stats.thisWeek")} value={stats.thisWeekTasks} />
                  <QuickStat label={t("stats.totalSessions")} value={stats.totalTasks} />
                  <QuickStat label={t("stats.practiceDays")} value={stats.practiceDays} />
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Task-Type Weakness */}
          <section className="animate-card-in">
            <div className="rounded-[22px] border border-[#dce4ee] bg-white dark:bg-slate-900 p-5 shadow-[0_10px_26px_rgba(15,23,42,.055)] sm:p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-[15px] border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.19em] text-amber-700 dark:text-amber-300">
                      {t("stats.taskTypeWeakness")}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {t("stats.weaknessDesc")}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {stats.weaknesses.map((w) => (
                  <WeaknessBar key={w.taskType} weakness={w} />
                ))}
              </div>
            </div>
          </section>

          {/* Section 3: Dimension Profile + Gap Analysis */}
          {hasDimensionData && (
            <section className="animate-card-in">
              <div className="rounded-[22px] border border-[#dce4ee] bg-white dark:bg-slate-900 p-5 shadow-[0_10px_26px_rgba(15,23,42,.055)] sm:p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-[15px] border border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 flex items-center justify-center shrink-0">
                      <Target className="w-5 h-5" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.19em] text-indigo-700 dark:text-indigo-400">
                        {t("stats.learnerProfile")}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {t("stats.profileDesc")}
                      </p>
                    </div>
                  </div>

                  {availableProfileTabs.length >= 2 && (
                    <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
                      {availableProfileTabs.map((tab) => (
                        <button key={tab} onClick={() => setProfileTab(tab)}
                          className={`px-3 py-1.5 capitalize transition ${
                            profileTab === tab
                              ? "bg-[var(--brand)] text-white"
                              : "text-[var(--text-secondary)] hover:bg-[var(--background)]"
                          }`}>
                          {t(`stats.section.${tab}`)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {activeProfile ? (
                  <div className="grid gap-6 sm:grid-cols-2 items-start">
                    <div>
                      <RadarChart dims={activeProfile} target={targetScore} />
                      <p className="text-center text-[11px] text-[var(--text-muted)] -mt-1">
                        {t("stats.radarLegend", { target: String(targetScore) })}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {t("stats.targetScore", { score: String(targetScore) })}
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
                  <p className="text-sm text-[var(--text-muted)]">
                    {t("stats.noProfileData", { section: t(`stats.section.${profileTab}`) })}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Section 4: Focus areas + Recommended actions */}
          <div className="grid gap-4 sm:grid-cols-2 animate-card-in">
            <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-5 shadow-[0_10px_26px_rgba(15,23,42,.055)] dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-[10px] border border-amber-300 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" strokeWidth={2} />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-[0.19em] text-amber-700 dark:text-amber-300">
                  {t("feedback.focusAreas")}
                </h3>
              </div>
              {topWeaknesses.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {topWeaknesses.map((w) => (
                    <li key={w.taskType} className="flex items-center justify-between text-sm">
                      <Link href={`/practice/${w.taskType.replace(/_/g, "-")}`}
                        className="text-amber-900 dark:text-amber-100 hover:underline">
                        {TASK_LABELS[w.taskType]}
                      </Link>
                      <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-medium text-amber-800 shadow-sm dark:text-amber-200">
                        {w.score}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                  {stats.weaknesses.every((w) => w.recentCount === 0)
                    ? t("stats.emptyTitle")
                    : t("stats.noWeakAreas")}
                </p>
              )}
            </div>

            <div className="rounded-[22px] border border-[#dce4ee] bg-white dark:bg-slate-900 p-5 shadow-[0_10px_26px_rgba(15,23,42,.055)]">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-[10px] border border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" strokeWidth={2} />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-[0.19em] text-slate-700 dark:text-slate-300">
                  {t("stats.recommendedActions")}
                </h3>
              </div>
              <div className="space-y-3">
                <ActionLink href="/practice" label={t("stats.actionTaskPractice")} desc={t("stats.actionTaskPracticeDesc")} color="emerald" />
                <ActionLink href="/mock" label={t("stats.actionMockExam")} desc={t("stats.actionMockExamDesc")} color="cyan" />
                <ActionLink href="/history" label={t("stats.actionHistory")} desc={t("stats.actionBrowseHistory")} color="slate" />
              </div>
            </div>
          </div>

          {/* Section 5: Score Trajectory */}
          <section className="animate-card-in">
            <details className="group rounded-[22px] border border-[#dce4ee] bg-white dark:bg-slate-900 shadow-[0_10px_26px_rgba(15,23,42,.055)]">
              <summary className="cursor-pointer list-none p-5 font-semibold text-[var(--foreground)] sm:p-6">
                {t("stats.scoreTrajectory")}
                <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">{t("stats.show")}</span>
                <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">{t("stats.hide")}</span>
              </summary>
              <div className="px-5 pb-5 sm:px-6 sm:pb-6 space-y-4">
                <p className="text-xs text-[var(--text-secondary)]">
                  {t("stats.trajectoryDesc")}
                </p>

                <div className="flex flex-wrap gap-2">
                  {stats.weaknesses.filter((w) => w.recentCount > 0).map((w) => (
                    <button key={w.taskType}
                      onClick={() => setSelectedProgressTask(w.taskType)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                        selectedProgressTask === w.taskType
                          ? "bg-[var(--brand)] text-white"
                          : "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--background)]"
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
                    <p className="text-sm text-[var(--text-muted)] py-4 text-center">
                      {t("stats.notEnoughData", { taskType: TASK_LABELS[selectedProgressTask] })}
                    </p>
                  )
                )}
              </div>
            </details>
          </section>

          {/* Section 6: Practice distribution */}
          <section className="animate-card-in">
            <details className="group rounded-[22px] border border-[#dce4ee] bg-white dark:bg-slate-900 shadow-[0_10px_26px_rgba(15,23,42,.055)]">
              <summary className="cursor-pointer list-none p-5 font-semibold text-[var(--foreground)] sm:p-6">
                {t("stats.distribution")}
                <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">{t("stats.show")}</span>
                <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">{t("stats.hide")}</span>
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
                <div className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 text-xs text-[var(--text-secondary)]">
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
              <details className="group rounded-[22px] border border-[#dce4ee] bg-white dark:bg-slate-900 shadow-[0_10px_26px_rgba(15,23,42,.055)]">
                <summary className="cursor-pointer list-none p-5 font-semibold text-[var(--foreground)] sm:p-6">
                  {t("stats.weeklyActivity")}
                  <span className="float-right text-sm font-normal text-slate-500 group-open:hidden">{t("stats.show")}</span>
                  <span className="float-right hidden text-sm font-normal text-slate-500 group-open:inline">{t("stats.hide")}</span>
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

      <footer className="py-6 text-center text-sm text-[var(--text-secondary)] border-t border-[var(--border)]">
        <p>{t("home.footer")}</p>
      </footer>
    </div>
  )
}
