"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import { useTranslation } from "@/lib/i18n"
import { getTasks } from "@/lib/unified-task-history"
import { deriveTaskTypeWeakness, rankWeaknesses } from "@/lib/task-weakness"
import { PTE_TASK_LABELS } from "@/lib/recommendations"
import type { PteTaskType } from "@/types"

type TaskCard = {
  href: string
  section: string
  title: string
  timer: string
  azure: boolean
  taskType: PteTaskType
}

const slugOf = (href: string) => href.split("/").pop() ?? ""

const TASK_CARDS: TaskCard[] = [
  { href: "/practice/read-aloud", section: "Speaking", title: "Read Aloud", timer: "35s prep · 40s", azure: true, taskType: "read_aloud" },
  { href: "/practice/repeat-sentence", section: "Speaking", title: "Repeat Sentence", timer: "15s", azure: true, taskType: "repeat_sentence" },
  { href: "/practice/answer-short-question", section: "Speaking", title: "Answer Short Question", timer: "10s", azure: false, taskType: "answer_short_question" },
  { href: "/practice/personal-intro", section: "Speaking", title: "Personal Introduction", timer: "25s prep · 30s", azure: false, taskType: "personal_intro" },
  { href: "/practice/describe-image", section: "Speaking", title: "Describe Image", timer: "25s prep · 40s", azure: false, taskType: "describe_image" },
  { href: "/practice/re-tell-lecture", section: "Speaking", title: "Re-tell Lecture", timer: "~60s listen · 10s prep · 40s", azure: false, taskType: "re_tell_lecture" },
  { href: "/practice/summarize-written-text", section: "Writing", title: "Summarize Written Text", timer: "10 min", azure: false, taskType: "summarize_written_text" },
  { href: "/practice/write-essay", section: "Writing", title: "Write Essay", timer: "20 min", azure: false, taskType: "write_essay" },
  { href: "/practice/write-from-dictation", section: "Listening", title: "Write from Dictation", timer: "~30s", azure: false, taskType: "write_from_dictation" },
  { href: "/practice/summarize-spoken-text", section: "Listening", title: "Summarize Spoken Text", timer: "~60s listen · 10 min write", azure: false, taskType: "summarize_spoken_text" },
  { href: "/practice/fill-in-the-blanks-listening", section: "Listening", title: "Fill in the Blanks", timer: "~60s listen · 7 min", azure: false, taskType: "fill_in_the_blanks_listening" },
  { href: "/practice/highlight-correct-summary", section: "Listening", title: "Highlight Correct Summary", timer: "~60s listen · 5 min", azure: false, taskType: "highlight_correct_summary" },
  { href: "/practice/fill-in-the-blanks", section: "Reading", title: "Fill in the Blanks", timer: "7 min", azure: false, taskType: "fill_in_the_blanks_reading" },
  { href: "/practice/re-order-paragraphs", section: "Reading", title: "Re-order Paragraphs", timer: "3 min", azure: false, taskType: "re_order_paragraphs" },
  { href: "/practice/multiple-choice", section: "Reading", title: "Multiple Choice", timer: "4 min", azure: false, taskType: "multiple_choice_reading" },
]

const THEME_CHIPS = ["education", "environment", "technology", "health", "society", "science"] as const

const SECTIONS = ["Speaking", "Writing", "Reading", "Listening"] as const

const TASK_HREF: Partial<Record<PteTaskType, string>> = Object.fromEntries(
  TASK_CARDS.map((c) => [c.taskType, c.href])
)

type WeaknessCard = {
  taskType: PteTaskType
  label: string
  score: number
  recentCount: number
}

export default function PracticeHubPage() {
  const { t } = useTranslation()
  const [themeTopic, setThemeTopic] = useState("")
  const [weaknesses, setWeaknesses] = useState<WeaknessCard[]>([])
  const [recLoading, setRecLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const taskSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setRecLoading(true)
      try {
        const tasks = await getTasks()
        if (cancelled) return
        const derived = deriveTaskTypeWeakness(tasks)
        const ranked = rankWeaknesses(derived)
        const top3 = ranked.slice(0, 3).map((w) => ({
          taskType: w.taskType,
          label: PTE_TASK_LABELS[w.taskType],
          score: w.score,
          recentCount: w.recentCount,
        }))
        setWeaknesses(top3)
      } catch {
        // silent fail — targeted section simply won't show
      } finally {
        if (!cancelled) setRecLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])

  const activeTheme = themeTopic.trim()

  function cardHref(baseHref: string): string {
    if (!activeTheme) return baseHref
    return `${baseHref}?mode=theme&topic=${encodeURIComponent(activeTheme)}`
  }

  function targetedHref(taskType: PteTaskType): string {
    const base = TASK_HREF[taskType]
    return base ? `${base}?mode=targeted` : "/practice"
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="5xl" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            {t("practiceHub.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">{t("practiceHub.title")}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t("practiceHub.subtitle")}
          </p>
        </div>

        {/* ── Theme Practice ───────────────────────────────────────────────────── */}
        <div className="mb-8 border border-slate-200 bg-[var(--surface)] p-5 sm:p-6 dark:border-white/10">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
                {t("practiceHub.theme.eyebrow")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("practiceHub.theme.desc")}</p>
            </div>
          </div>

          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={themeTopic}
              onChange={(e) => setThemeTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && themeTopic.trim()) {
                  taskSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              }}
              placeholder={t("practiceHub.theme.inputPlaceholder")}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 pr-20 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-600 dark:focus:ring-emerald-900/30"
            />
            {activeTheme && (
              <button
                onClick={() => { setThemeTopic(""); inputRef.current?.focus() }}
                className="absolute inset-y-0 right-3 flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                aria-label={t("practiceHub.theme.clear")}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                {t("practiceHub.theme.clear")}
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {THEME_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setThemeTopic(t(`practiceHub.theme.chip.${chip}`) === chip ? chip : t(`practiceHub.theme.chip.${chip}`))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeTheme.toLowerCase() === chip
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                }`}
              >
                {t(`practiceHub.theme.chip.${chip}`)}
              </button>
            ))}
          </div>

          {activeTheme && (
            <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              ✓ {t("practiceHub.theme.active", { topic: activeTheme })} — {t("practiceHub.start")}ing any task below will generate themed stimuli.
            </p>
          )}
        </div>

        {/* ── Targeted Practice ───────────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {t("practiceHub.targeted.eyebrow")}
            </p>
          </div>
          {recLoading ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">{t("practiceHub.targeted.loading")}</p>
          ) : weaknesses.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">{t("practiceHub.targeted.noHistory")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {weaknesses.map((w) => (
                <Link
                  key={w.taskType}
                  href={targetedHref(w.taskType)}
                  className="group flex items-center justify-between gap-3 border border-slate-200 bg-[var(--surface)] px-4 py-3 transition-all hover:border-amber-300 hover:shadow-sm dark:border-white/10 dark:hover:border-amber-700"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        {t("practiceHub.targeted.badge")}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-amber-800 dark:group-hover:text-amber-300 transition-colors truncate">
                      {w.label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {w.recentCount === 0 ? "Not tried yet" : `Score ${w.score}/100`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-400 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                    {t("practiceHub.targeted.start")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Task sections ────────────────────────────────────────────────────── */}
        <div ref={taskSectionRef} />
        {SECTIONS.map(section => {
          const cards = TASK_CARDS.filter(c => c.section === section)
          return (
            <div key={section} className="mb-10">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {t(`practiceHub.section.${section}`)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(card => (
                  <Link
                    key={card.href}
                    href={cardHref(card.href)}
                    className="group border border-slate-200 bg-[var(--surface)] p-5 transition-all hover:border-[var(--border-strong)] hover:shadow-[4px_4px_0_rgba(15,23,42,0.08)] dark:border-white/10"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-emerald-800 dark:group-hover:text-emerald-300 transition-colors">
                        {card.title}
                      </h3>
                      <div className="flex shrink-0 items-center gap-1">
                        {activeTheme && (
                          <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {t("practiceHub.theme.eyebrow")}
                          </span>
                        )}
                        {card.azure && (
                          <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            Azure
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300 mb-4">
                      {t(`practiceHub.desc.${slugOf(card.href)}`)}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 dark:text-slate-500">⏱ {card.timer}</span>
                      <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                        {t("practiceHub.start")} →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}

        {/* ── Mock Exam CTA ────────────────────────────────────────────────────── */}
        <div className="mt-6 border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_rgba(15,23,42,0.08)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400 mb-1">
              {t("practiceHub.mockEyebrow")}
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{t("practiceHub.mockTitle")}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t("practiceHub.mockDesc")}
            </p>
          </div>
          <Link
            href="/mock"
            className="shrink-0 rounded-xl bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-[var(--surface)] dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {t("practiceHub.mockCta")} →
          </Link>
        </div>

      </main>
    </div>
  )
}
