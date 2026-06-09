"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import MockPersonalIntro from "@/components/mock/MockPersonalIntro"
import MockReadAloud from "@/components/mock/MockReadAloud"
import MockRepeatSentence from "@/components/mock/MockRepeatSentence"
import MockAnswerShortQuestion from "@/components/mock/MockAnswerShortQuestion"
import MockSummarizeWrittenText from "@/components/mock/MockSummarizeWrittenText"
import MockWriteEssay from "@/components/mock/MockWriteEssay"
import MockWriteFromDictation from "@/components/mock/MockWriteFromDictation"
import MockSummarizeSpokenText from "@/components/mock/MockSummarizeSpokenText"
import MockFillInTheBlanksListening from "@/components/mock/MockFillInTheBlanksListening"
import MockHighlightCorrectSummary from "@/components/mock/MockHighlightCorrectSummary"
import MockFillInTheBlanksReading from "@/components/mock/MockFillInTheBlanksReading"
import MockReOrderParagraphs from "@/components/mock/MockReOrderParagraphs"
import MockMultipleChoiceReading from "@/components/mock/MockMultipleChoiceReading"
import type { PracticeTask } from "@/types"

// PTE Academic task order
const TASK_SEQUENCE = [
  { type: "personal_intro" as const, label: "Personal Introduction", section: "Speaking & Writing", description: "Introduce yourself. 25s prep, 30s to speak." },
  { type: "read_aloud" as const, label: "Read Aloud", section: "Speaking & Writing", description: "Read the passage aloud. 35s prep, 40s to read." },
  { type: "repeat_sentence" as const, label: "Repeat Sentence", section: "Speaking & Writing", description: "Listen, then repeat the sentence exactly. 15s to respond." },
  { type: "answer_short_question" as const, label: "Answer Short Question", section: "Speaking & Writing", description: "Answer the question with one or a few words. 10s to respond." },
  { type: "summarize_written_text" as const, label: "Summarize Written Text", section: "Writing", description: "Write a one-sentence summary of the passage. 10 minutes." },
  { type: "write_essay" as const, label: "Write Essay", section: "Writing", description: "Write a 200–300 word essay. 20 minutes." },
  { type: "fill_in_the_blanks_reading" as const, label: "Fill in the Blanks (Reading)", section: "Reading", description: "Read the passage and select the correct word for each blank. 7 minutes." },
  { type: "re_order_paragraphs" as const, label: "Re-order Paragraphs", section: "Reading", description: "Drag the paragraph tiles into the correct logical order. 3 minutes." },
  { type: "multiple_choice_reading" as const, label: "Multiple Choice (Reading)", section: "Reading", description: "Read the passage and select the one correct answer. 4 minutes." },
  { type: "write_from_dictation" as const, label: "Write from Dictation", section: "Listening", description: "Listen to the sentence, then type exactly what you heard." },
  { type: "summarize_spoken_text" as const, label: "Summarize Spoken Text", section: "Listening", description: "Listen to a passage, then write a 50–70 word summary. 10 minutes." },
  { type: "fill_in_the_blanks_listening" as const, label: "Fill in the Blanks (Listening)", section: "Listening", description: "Listen to a passage, then select the missing words. 7 minutes." },
  { type: "highlight_correct_summary" as const, label: "Highlight Correct Summary", section: "Listening", description: "Listen to a passage, then choose the best summary. 5 minutes." },
]

type ExamPhase = "intro" | "running" | "finished"

const SESSION_KEY = "echo_mock_session"

export default function MockExamPage() {
  const router = useRouter()
  const [examPhase, setExamPhase] = useState<ExamPhase>("intro")
  const [taskIndex, setTaskIndex] = useState(0)
  const [results, setResults] = useState<PracticeTask[]>([])
  const [startedAt] = useState(() => new Date().toISOString())

  const handleTaskComplete = useCallback((task: PracticeTask) => {
    const updatedResults = [...results, task]
    setResults(updatedResults)

    const nextIndex = taskIndex + 1
    if (nextIndex >= TASK_SEQUENCE.length) {
      // All tasks done — save session and navigate to summary
      const session = {
        tasks: updatedResults,
        startedAt,
        completedAt: new Date().toISOString(),
      }
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      } catch { /* ignore storage errors */ }
      setExamPhase("finished")
      router.push("/mock/summary")
    } else {
      setTaskIndex(nextIndex)
    }
   
  }, [results, taskIndex, startedAt, router])

  const currentTask = TASK_SEQUENCE[taskIndex]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="4xl" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">

        {/* ── Intro screen ───────────────────────────────────────────────── */}
        {examPhase === "intro" && (
          <div>
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
                PTE Academic
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Mock Exam</h1>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                This mock exam covers 10 PTE task types in order. Timing is strictly enforced — speaking tasks
                auto-submit when time is up; writing tasks auto-submit if you don&apos;t finish in time.
              </p>
            </div>

            <div className="border border-slate-900 bg-white p-6 dark:border-white/15 dark:bg-slate-900 shadow-[6px_6px_0_rgba(15,23,42,0.08)] mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-4">
                Task Sequence ({TASK_SEQUENCE.length} tasks)
              </p>
              <ol className="space-y-3">
                {TASK_SEQUENCE.map((t, i) => (
                  <li key={t.type} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{t.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                    </div>
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 shrink-0">{t.section}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20 mb-8 text-sm text-amber-700 dark:text-amber-300">
              Allow microphone access when prompted. Have headphones ready for audio tasks.
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setExamPhase("running")}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Start Mock Exam
              </button>
              <Link
                href="/practice"
                className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:border-slate-900 dark:border-white/20 dark:text-slate-300 dark:hover:border-white"
              >
                Back to Practice
              </Link>
            </div>
          </div>
        )}

        {/* ── Running ────────────────────────────────────────────────────── */}
        {examPhase === "running" && (
          <div>
            {/* Progress header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Task {taskIndex + 1} of {TASK_SEQUENCE.length}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {currentTask.label}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{currentTask.section}</p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(taskIndex / TASK_SEQUENCE.length) * 100}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                {TASK_SEQUENCE.map((t, i) => (
                  <div
                    key={t.type}
                    className={`w-2 h-2 rounded-full -mt-3.5 ${i < taskIndex ? "bg-emerald-500" : i === taskIndex ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"}`}
                  />
                ))}
              </div>
            </div>

            {/* Task component — key forces remount on task change */}
            <div key={`task-${taskIndex}`}>
              {currentTask.type === "personal_intro" && <MockPersonalIntro onComplete={handleTaskComplete} />}
              {currentTask.type === "read_aloud" && <MockReadAloud onComplete={handleTaskComplete} />}
              {currentTask.type === "repeat_sentence" && <MockRepeatSentence onComplete={handleTaskComplete} />}
              {currentTask.type === "answer_short_question" && <MockAnswerShortQuestion onComplete={handleTaskComplete} />}
              {currentTask.type === "summarize_written_text" && <MockSummarizeWrittenText onComplete={handleTaskComplete} />}
              {currentTask.type === "write_essay" && <MockWriteEssay onComplete={handleTaskComplete} />}
              {currentTask.type === "fill_in_the_blanks_reading" && <MockFillInTheBlanksReading onComplete={handleTaskComplete} />}
              {currentTask.type === "re_order_paragraphs" && <MockReOrderParagraphs onComplete={handleTaskComplete} />}
              {currentTask.type === "multiple_choice_reading" && <MockMultipleChoiceReading onComplete={handleTaskComplete} />}
              {currentTask.type === "write_from_dictation" && <MockWriteFromDictation onComplete={handleTaskComplete} />}
              {currentTask.type === "summarize_spoken_text" && <MockSummarizeSpokenText onComplete={handleTaskComplete} />}
              {currentTask.type === "fill_in_the_blanks_listening" && <MockFillInTheBlanksListening onComplete={handleTaskComplete} />}
              {currentTask.type === "highlight_correct_summary" && <MockHighlightCorrectSummary onComplete={handleTaskComplete} />}
            </div>
          </div>
        )}

        {/* ── Finished (fallback while redirecting) ─────────────────────── */}
        {examPhase === "finished" && (
          <div className="text-center py-16">
            <div className="inline-block w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-slate-600 dark:text-slate-300">Loading your results…</p>
          </div>
        )}
      </main>
    </div>
  )
}
