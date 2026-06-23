"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  Sparkles,
  Target,
  Mic,
  PenLine,
  BookOpen,
  Headphones,
  Timer,
  ArrowRight,
  X,
  BookMarked,
  HelpCircle,
  User,
  LayoutGrid,
  AudioLines,
  FileText,
  ListChecks,
  AlignLeft,
  Shuffle,
  CheckSquare,
  Repeat2,
  Keyboard,
  Clock,
} from "lucide-react"
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

const TASK_ICONS: Record<string, React.ElementType> = {
  "read-aloud": BookOpen,
  "repeat-sentence": Repeat2,
  "answer-short-question": HelpCircle,
  "personal-intro": User,
  "describe-image": LayoutGrid,
  "re-tell-lecture": AudioLines,
  "summarize-written-text": FileText,
  "write-essay": PenLine,
  "write-from-dictation": Keyboard,
  "summarize-spoken-text": Headphones,
  "fill-in-the-blanks-listening": ListChecks,
  "highlight-correct-summary": BookMarked,
  "fill-in-the-blanks": AlignLeft,
  "re-order-paragraphs": Shuffle,
  "multiple-choice": CheckSquare,
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  Speaking: Mic,
  Writing: PenLine,
  Reading: BookOpen,
  Listening: Headphones,
}

const SECTION_STYLE: Record<string, {
  iconTile: string
  heading: string
  line: string
  cardGlow: string
}> = {
  Speaking: {
    iconTile: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
    heading: "text-emerald-700 dark:text-emerald-400",
    line: "from-emerald-200 dark:from-emerald-800",
    cardGlow: "bg-emerald-100/60 dark:bg-emerald-900/20",
  },
  Writing: {
    iconTile: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800",
    heading: "text-violet-700 dark:text-violet-400",
    line: "from-violet-200 dark:from-violet-800",
    cardGlow: "bg-violet-100/60 dark:bg-violet-900/20",
  },
  Reading: {
    iconTile: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
    heading: "text-blue-700 dark:text-blue-400",
    line: "from-blue-200 dark:from-blue-800",
    cardGlow: "bg-blue-100/60 dark:bg-blue-900/20",
  },
  Listening: {
    iconTile: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    heading: "text-amber-700 dark:text-amber-400",
    line: "from-amber-200 dark:from-amber-800",
    cardGlow: "bg-amber-100/60 dark:bg-amber-900/20",
  },
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
    <div className="min-h-screen">
      <DesktopNav active="practice" maxWidth="5xl" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">

        {/* ── Header Hero Card ─────────────────────────────── */}
        <section className="mb-6 overflow-hidden rounded-[28px] border border-[#dce4ee] shadow-[0_10px_26px_rgba(15,23,42,.055)]">
          <div
            className="relative px-8 py-9 sm:px-10 sm:py-11"
            style={{
              background:
                "radial-gradient(circle at 82% 44%, rgba(0,122,83,.12), transparent 18%), linear-gradient(120deg, rgba(255,255,255,.97), rgba(255,255,255,.84))",
            }}
          >
            {/* Decorative dot pattern */}
            <div
              className="pointer-events-none absolute right-0 top-0 h-full w-72 opacity-40"
              aria-hidden="true"
              style={{
                background:
                  "repeating-radial-gradient(ellipse at center, rgba(0,122,83,.22) 0 1px, transparent 1px 11px)",
                clipPath: "ellipse(72% 42% at 50% 50%)",
                transform: "rotate(13deg) translateX(40px) translateY(-50px)",
              }}
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                {t("practiceHub.eyebrow")}
              </p>
              <h1 className="font-display mt-2.5 text-5xl leading-tight tracking-tight text-slate-900 dark:text-white sm:text-6xl">
                {t("practiceHub.title")}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-500 dark:text-slate-400">
                {t("practiceHub.subtitle")}
              </p>
            </div>
          </div>
        </section>

        {/* ── Theme Practice Card ──────────────────────────── */}
        <div className="mb-6 rounded-[22px] border border-emerald-200/80 bg-gradient-to-b from-white to-[#f8fdfb] p-6 shadow-[0_10px_26px_rgba(15,23,42,.055)] dark:border-emerald-900/60 dark:from-slate-900 dark:to-slate-900">
          <div className="grid grid-cols-[64px_1fr] gap-5">
            {/* Big icon */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
              <Sparkles className="h-7 w-7" strokeWidth={2} />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                {t("practiceHub.theme.eyebrow")}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("practiceHub.theme.desc")}
              </p>

              <div className="relative mt-4">
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
                  className="h-12 w-full rounded-[14px] border border-[#c8d3df] bg-white px-4 pr-20 text-sm text-slate-800 placeholder:text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,.9)] transition-shadow focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-600 dark:focus:ring-emerald-900/30"
                />
                {activeTheme && (
                  <button
                    onClick={() => { setThemeTopic(""); inputRef.current?.focus() }}
                    className="absolute inset-y-0 right-3 flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                    aria-label={t("practiceHub.theme.clear")}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                    {t("practiceHub.theme.clear")}
                  </button>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {THEME_CHIPS.map((chip) => {
                  const label = t(`practiceHub.theme.chip.${chip}`) === chip ? chip : t(`practiceHub.theme.chip.${chip}`)
                  const isActive = activeTheme.toLowerCase() === chip || activeTheme === label
                  return (
                    <button
                      key={chip}
                      onClick={() => setThemeTopic(label)}
                      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition-all ${
                        isActive
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "border-[#c8d3df] bg-white text-slate-600 shadow-[0_5px_12px_rgba(15,23,42,.035)] hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {activeTheme && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-black dark:bg-emerald-800">✓</span>
                  {t("practiceHub.theme.active", { topic: activeTheme })} — {t("practiceHub.theme.activeHint")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Targeted Practice Card ───────────────────────── */}
        <div className="mb-10 rounded-[22px] border border-blue-200/80 bg-gradient-to-b from-white to-[#f7faff] p-5 shadow-[0_10px_26px_rgba(15,23,42,.055)] dark:border-blue-900/60 dark:from-slate-900 dark:to-slate-900 sm:p-6">
          <div className="flex items-start gap-4 sm:items-center">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-400">
              <Target className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-400">
                {t("practiceHub.targeted.eyebrow")}
              </p>
              {recLoading ? (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t("practiceHub.targeted.loading")}
                </p>
              ) : weaknesses.length === 0 ? (
                <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                  {t("practiceHub.targeted.noHistory")}
                </p>
              ) : (
                <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                  {weaknesses.map((w) => (
                    <Link
                      key={w.taskType}
                      href={targetedHref(w.taskType)}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-white px-4 py-3 shadow-[0_4px_12px_rgba(183,121,31,.05)] transition-all hover:border-amber-300 hover:shadow-[0_6px_18px_rgba(183,121,31,.10)] dark:border-amber-800/60 dark:bg-slate-800"
                    >
                      <div className="min-w-0">
                        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          {t("practiceHub.targeted.badge")}
                        </span>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-amber-800 dark:text-white dark:group-hover:text-amber-300">
                          {w.label}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                          {w.recentCount === 0 ? t("practiceHub.targeted.notTried") : t("practiceHub.targeted.score", { score: w.score })}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-amber-500" strokeWidth={2} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {recLoading && (
              <div className="h-9 w-9 shrink-0 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            )}
          </div>
        </div>

        {/* ── Task Sections ─────────────────────────────────── */}
        <div ref={taskSectionRef} />
        {SECTIONS.map(section => {
          const cards = TASK_CARDS.filter(c => c.section === section)
          const style = SECTION_STYLE[section]
          const SectionIconComponent = SECTION_ICONS[section]
          return (
            <div key={section} className="mb-10">
              {/* Section header */}
              <div className="mb-4 flex items-center gap-3">
                <SectionIconComponent className={`h-4 w-4 ${style.heading}`} strokeWidth={2} />
                <h2 className={`text-xs font-bold uppercase tracking-[0.19em] ${style.heading}`}>
                  {t(`practiceHub.section.${section}`)}
                </h2>
                <div className={`h-px flex-1 bg-gradient-to-r ${style.line} to-transparent`} />
              </div>

              {/* Task card grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(card => {
                  const slug = slugOf(card.href)
                  const TaskIconComponent = TASK_ICONS[slug] ?? BookOpen

                  return (
                    <Link
                      key={card.href}
                      href={cardHref(card.href)}
                      className="group relative grid grid-cols-[52px_1fr_auto] items-start gap-4 overflow-hidden rounded-[22px] border border-[#dce4ee] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,.052)] transition-all hover:-translate-y-0.5 hover:border-[#b8c7d8] hover:shadow-[0_18px_40px_rgba(15,23,42,.09)] dark:border-white/10 dark:bg-slate-900"
                    >
                      {/* Bottom-right ambient glow */}
                      <div
                        className={`pointer-events-none absolute -bottom-6 -right-6 h-20 w-20 rounded-full opacity-50 ${style.cardGlow}`}
                        aria-hidden="true"
                      />

                      {/* Icon tile */}
                      <div className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] border ${style.iconTile}`}>
                        <TaskIconComponent className="h-5 w-5" strokeWidth={2} />
                      </div>

                      {/* Body */}
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
                          {card.title}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                          {t(`practiceHub.desc.${slug}`)}
                        </p>
                        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                          <Timer className="h-3.5 w-3.5" strokeWidth={2} />
                          {card.timer}
                        </div>
                      </div>

                      {/* Tags (absolutely positioned top-right) */}
                      {(card.azure || activeTheme) && (
                        <div className="absolute right-4 top-4 flex gap-1.5">
                          {activeTheme && (
                            <span className="inline-flex h-7 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                              {t("practiceHub.theme.eyebrow")}
                            </span>
                          )}
                          {card.azure && !activeTheme && (
                            <span className="inline-flex h-7 items-center rounded-lg border border-blue-200 bg-blue-50 px-2 text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              Azure
                            </span>
                          )}
                        </div>
                      )}

                      {/* Start button */}
                      <span className="relative z-10 self-end justify-self-end inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 text-sm font-bold text-emerald-700 shadow-[0_6px_14px_rgba(0,122,83,.06)] transition-all group-hover:border-emerald-300 group-hover:shadow-[0_8px_18px_rgba(0,122,83,.12)] dark:bg-slate-800 dark:border-emerald-800 dark:text-emerald-400">
                        {t("practiceHub.start")}
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* ── Mock Exam CTA ─────────────────────────────────── */}
        <div className="mt-4 flex flex-col gap-4 rounded-[22px] border border-[#dce4ee] bg-white p-6 shadow-[0_10px_26px_rgba(15,23,42,.055)] dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <Clock className="h-4 w-4 text-slate-600 dark:text-slate-400" strokeWidth={2} />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                {t("practiceHub.mockEyebrow")}
              </p>
            </div>
            <p className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
              {t("practiceHub.mockTitle")}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("practiceHub.mockDesc")}
            </p>
          </div>
          <Link
            href="/mock"
            className="shrink-0 inline-flex h-11 items-center gap-2.5 rounded-xl bg-slate-900 px-6 text-sm font-bold text-white shadow-[0_6px_18px_rgba(15,23,42,.14)] transition-all hover:bg-slate-800 hover:shadow-[0_8px_24px_rgba(15,23,42,.2)] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            {t("practiceHub.mockCta")}
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </div>

      </main>
    </div>
  )
}
