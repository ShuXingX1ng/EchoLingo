"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import type { PracticeTask, PteTaskType } from "@/types"

const SESSION_KEY = "echo_mock_session"

const TASK_LABELS: Record<PteTaskType, string> = {
  personal_intro: "Personal Introduction",
  read_aloud: "Read Aloud",
  repeat_sentence: "Repeat Sentence",
  answer_short_question: "Answer Short Question",
  summarize_written_text: "Summarize Written Text",
  write_essay: "Write Essay",
  write_from_dictation: "Write from Dictation",
  describe_image: "Describe Image",
  re_tell_lecture: "Re-tell Lecture",
  fill_in_the_blanks_reading: "Fill in the Blanks (Reading)",
  re_order_paragraphs: "Re-order Paragraphs",
  multiple_choice_reading: "Multiple Choice (Reading)",
  summarize_spoken_text: "Summarize Spoken Text",
  fill_in_the_blanks_listening: "Fill in the Blanks (Listening)",
  highlight_correct_summary: "Highlight Correct Summary",
}

const TASK_PRACTICE_PATHS: Record<PteTaskType, string> = {
  personal_intro: "/practice/personal-intro",
  read_aloud: "/practice/read-aloud",
  repeat_sentence: "/practice/repeat-sentence",
  answer_short_question: "/practice/answer-short-question",
  summarize_written_text: "/practice/summarize-written-text",
  write_essay: "/practice/write-essay",
  write_from_dictation: "/practice/write-from-dictation",
  describe_image: "/practice/describe-image",
  re_tell_lecture: "/practice/re-tell-lecture",
  fill_in_the_blanks_reading: "/practice/fill-in-the-blanks",
  re_order_paragraphs: "/practice/re-order-paragraphs",
  multiple_choice_reading: "/practice/multiple-choice",
  summarize_spoken_text: "/practice/summarize-spoken-text",
  fill_in_the_blanks_listening: "/practice/fill-in-the-blanks-listening",
  highlight_correct_summary: "/practice/highlight-correct-summary",
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500"
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-2`} />
}

interface MockSession {
  tasks: PracticeTask[]
  startedAt: string
  completedAt: string
}

export default function MockSummaryPage() {
  const [session, setSession] = useState<MockSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) setSession(JSON.parse(raw) as MockSession)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <DesktopNav active="practice" maxWidth="4xl" />
        <main className="mx-auto max-w-3xl px-4 py-12 text-center">
          <p className="text-slate-600 dark:text-slate-300 mb-6">No mock exam session found.</p>
          <Link href="/mock"
            className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            Start a Mock Exam
          </Link>
        </main>
      </div>
    )
  }

  const { tasks, startedAt, completedAt } = session
  const totalDuration = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
  )

  // Compute overall weakness from weaknesses lists
  const weaknessCounts: Record<string, number> = {}
  tasks.forEach(t => {
    t.feedback?.weaknesses.forEach(w => {
      const key = w.toLowerCase().slice(0, 60)
      weaknessCounts[key] = (weaknessCounts[key] ?? 0) + 1
    })
  })
  const topWeaknesses = Object.entries(weaknessCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)

  const scoredTasks = tasks.filter(t => t.feedback?.pronunciationAssessment)
  const avgPronunciationScore = scoredTasks.length > 0
    ? Math.round(scoredTasks.reduce((sum, t) => sum + (t.feedback!.pronunciationAssessment!.score), 0) / scoredTasks.length)
    : null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="4xl" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/mock" className="hover:text-slate-700 dark:hover:text-slate-200">Mock Exam</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">Summary</span>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            PTE Academic
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Exam Complete</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {formatDate(startedAt)} · {tasks.length} tasks · {formatDuration(totalDuration)} total
          </p>
        </div>

        {/* Overview stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 text-center">
            <p className="text-2xl font-bold text-slate-950 dark:text-white">{tasks.length}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tasks Completed</p>
          </div>
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 text-center">
            <p className="text-2xl font-bold text-slate-950 dark:text-white">{formatDuration(totalDuration)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Total Time</p>
          </div>
          {avgPronunciationScore !== null && (
            <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 text-center">
              <p className={`text-2xl font-bold ${avgPronunciationScore >= 80 ? "text-emerald-600 dark:text-emerald-400" : avgPronunciationScore >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                {avgPronunciationScore}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Avg. Pronunciation</p>
            </div>
          )}
        </div>

        {/* Top weaknesses */}
        {topWeaknesses.length > 0 && (
          <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)] mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-4">
              Key Areas to Improve
            </p>
            <ul className="space-y-2">
              {topWeaknesses.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <span className="text-red-400 shrink-0">–</span>
                  <span className="capitalize">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Per-task breakdown */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-4">Task Breakdown</p>
          <div className="space-y-3">
            {tasks.map((task, i) => (
              <div key={task.id} className="border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="flex-shrink-0 w-6 h-6 mt-0.5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {TASK_LABELS[task.taskType]}
                        </p>
                        {task.feedback?.pronunciationAssessment && (
                          <div className="flex items-center gap-3 mt-1">
                            <ScoreDot score={task.feedback.pronunciationAssessment.score} />
                            <span className="text-xs text-slate-500">
                              Pronunciation: {task.feedback.pronunciationAssessment.score}
                            </span>
                          </div>
                        )}
                        {task.feedback?.summary && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {task.feedback.summary}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-slate-400">{formatDuration(task.durationSeconds)}</span>
                    </div>
                  </div>
                </div>
                {(task.feedback?.weaknesses.length ?? 0) > 0 && (
                  <div className="border-t border-slate-100 dark:border-white/10 px-4 py-3">
                    <ul className="space-y-1">
                      {task.feedback!.weaknesses.slice(0, 2).map((w, wi) => (
                        <li key={wi} className="flex gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="text-red-400 shrink-0">–</span>{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="border-t border-slate-100 dark:border-white/10 px-4 py-2">
                  <Link href={TASK_PRACTICE_PATHS[task.taskType]}
                    className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline">
                    Practice {TASK_LABELS[task.taskType]} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Link href="/mock"
            className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
            Take Another Mock Exam
          </Link>
          <Link href="/practice"
            className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:border-slate-900 dark:border-white/20 dark:text-slate-300 dark:hover:border-white">
            Practice Individual Tasks
          </Link>
          <Link href="/stats"
            className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:border-slate-900 dark:border-white/20 dark:text-slate-300 dark:hover:border-white">
            View Progress
          </Link>
        </div>
      </main>
    </div>
  )
}
