"use client"

import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"

type TaskCard = {
  href: string
  section: string
  title: string
  desc: string
  timer: string
  azure: boolean
}

const TASK_CARDS: TaskCard[] = [
  {
    href: "/practice/read-aloud",
    section: "Speaking",
    title: "Read Aloud",
    desc: "Read an AI-generated passage aloud as clearly and naturally as possible.",
    timer: "35s prep · 40s",
    azure: true,
  },
  {
    href: "/practice/repeat-sentence",
    section: "Speaking",
    title: "Repeat Sentence",
    desc: "Listen to a sentence once, then repeat it verbatim.",
    timer: "15s",
    azure: true,
  },
  {
    href: "/practice/answer-short-question",
    section: "Speaking",
    title: "Answer Short Question",
    desc: "Hear a factual question and give a brief spoken answer (1–3 words).",
    timer: "10s",
    azure: false,
  },
  {
    href: "/practice/personal-intro",
    section: "Speaking",
    title: "Personal Introduction",
    desc: "Introduce yourself — background, studies, and goals. Unscored in PTE.",
    timer: "25s prep · 30s",
    azure: false,
  },
  {
    href: "/practice/describe-image",
    section: "Speaking",
    title: "Describe Image",
    desc: "Study a chart, map, or diagram for 25s, then describe it aloud in detail.",
    timer: "25s prep · 40s",
    azure: false,
  },
  {
    href: "/practice/re-tell-lecture",
    section: "Speaking",
    title: "Re-tell Lecture",
    desc: "Listen to a short AI-generated lecture, then re-tell it in your own words.",
    timer: "~60s listen · 10s prep · 40s",
    azure: false,
  },
  {
    href: "/practice/summarize-written-text",
    section: "Writing",
    title: "Summarize Written Text",
    desc: "Read a passage, then write a one-sentence summary (5–75 words).",
    timer: "10 min",
    azure: false,
  },
  {
    href: "/practice/write-essay",
    section: "Writing",
    title: "Write Essay",
    desc: "Write a 200–300 word essay in response to a given question.",
    timer: "20 min",
    azure: false,
  },
  {
    href: "/practice/write-from-dictation",
    section: "Listening",
    title: "Write from Dictation",
    desc: "Listen to a sentence, then type exactly what you heard.",
    timer: "~30s",
    azure: false,
  },
  {
    href: "/practice/summarize-spoken-text",
    section: "Listening",
    title: "Summarize Spoken Text",
    desc: "Listen to an academic passage, then write a 50–70 word summary.",
    timer: "~60s listen · 10 min write",
    azure: false,
  },
  {
    href: "/practice/fill-in-the-blanks-listening",
    section: "Listening",
    title: "Fill in the Blanks",
    desc: "Listen to a passage read aloud, then select the correct word for each blank.",
    timer: "~60s listen · 7 min",
    azure: false,
  },
  {
    href: "/practice/highlight-correct-summary",
    section: "Listening",
    title: "Highlight Correct Summary",
    desc: "Listen to a passage, then choose the summary that best matches what you heard.",
    timer: "~60s listen · 5 min",
    azure: false,
  },
  {
    href: "/practice/fill-in-the-blanks",
    section: "Reading",
    title: "Fill in the Blanks",
    desc: "Read an academic passage and select the correct word from a dropdown for each blank.",
    timer: "7 min",
    azure: false,
  },
  {
    href: "/practice/re-order-paragraphs",
    section: "Reading",
    title: "Re-order Paragraphs",
    desc: "Drag shuffled paragraph tiles into the correct logical order.",
    timer: "3 min",
    azure: false,
  },
  {
    href: "/practice/multiple-choice",
    section: "Reading",
    title: "Multiple Choice",
    desc: "Read a passage and select the one correct answer from five options.",
    timer: "4 min",
    azure: false,
  },
]

const SECTIONS = ["Speaking", "Writing", "Reading", "Listening"] as const

export default function PracticeHubPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="5xl" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            PTE Academic
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Practice</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Choose a task type to start a practice session with AI-generated stimuli and instant feedback.
          </p>
        </div>

        {SECTIONS.map(section => {
          const cards = TASK_CARDS.filter(c => c.section === section)
          return (
            <div key={section} className="mb-10">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {section}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(card => (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="group border border-slate-200 bg-[var(--surface)] p-5 transition-all hover:border-[var(--border-strong)] hover:shadow-[4px_4px_0_rgba(15,23,42,0.08)] dark:border-white/10 "
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-emerald-800 dark:group-hover:text-emerald-300 transition-colors">
                        {card.title}
                      </h3>
                      {card.azure && (
                        <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          Azure
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300 mb-4">{card.desc}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 dark:text-slate-500">⏱ {card.timer}</span>
                      <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                        Start →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}

        {/* Mock Exam CTA */}
        <div className="mt-6 border border-[var(--border-strong)] bg-[var(--surface)] p-6  shadow-[4px_4px_0_rgba(15,23,42,0.08)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400 mb-1">
              Full Mock Exam
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">All 7 tasks in PTE order</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Strict timing enforced — no early stops on speaking tasks.
            </p>
          </div>
          <Link
            href="/mock"
            className="shrink-0 rounded-xl bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-[var(--surface)] dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Start Mock Exam →
          </Link>
        </div>

      </main>
    </div>
  )
}
