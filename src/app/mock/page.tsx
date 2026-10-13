"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import { useTranslation } from "@/lib/i18n"
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
import MockDescribeImage from "@/components/mock/MockDescribeImage"
import MockReTellLecture from "@/components/mock/MockReTellLecture"
import {
  MOCK_EXAM_SEQUENCE,
  TASK_TYPE_REGISTRY,
  taskTypeLabel,
  timingSummary,
  type ExamSection,
} from "@/lib/task-type-registry"
import type { PracticeTask, PteTaskType } from "@/types"

// Intro-screen instruction for each task. Order, Section, label and timings
// come from the Task Type catalogue.
const TASK_INSTRUCTIONS: Record<PteTaskType, string> = {
  personal_intro: "Introduce yourself.",
  read_aloud: "Read the passage aloud.",
  repeat_sentence: "Listen, then repeat the sentence exactly.",
  describe_image: "Study the image, then describe it in detail.",
  re_tell_lecture: "Listen to a short lecture, then re-tell it.",
  answer_short_question: "Answer the question with one or a few words.",
  summarize_written_text: "Write a one-sentence summary of the passage.",
  write_essay: "Write a 200–300 word essay.",
  fill_in_the_blanks_reading: "Read the passage and select the correct word for each blank.",
  re_order_paragraphs: "Drag the paragraph tiles into the correct logical order.",
  multiple_choice_reading: "Read the passage and select the one correct answer.",
  write_from_dictation: "Listen to the sentence, then type exactly what you heard.",
  summarize_spoken_text: "Listen to a passage, then write a 50–70 word summary.",
  fill_in_the_blanks_listening: "Listen to a passage, then select the missing words.",
  highlight_correct_summary: "Listen to a passage, then choose the best summary.",
}

const SECTION_LABEL_KEY: Record<ExamSection, string> = {
  speaking_writing: "mock.section.speakingWriting",
  reading: "mock.section.reading",
  listening: "mock.section.listening",
}

// PTE Academic task order
const TASK_SEQUENCE = MOCK_EXAM_SEQUENCE.map((type) => ({
  type,
  sectionLabelKey: SECTION_LABEL_KEY[TASK_TYPE_REGISTRY[type].section],
  description: `${TASK_INSTRUCTIONS[type]} ${timingSummary(type, "mock")}`,
}))

const MOCK_SCREENS: Record<
  PteTaskType,
  React.ComponentType<{ onComplete: (task: PracticeTask) => void }>
> = {
  personal_intro: MockPersonalIntro,
  read_aloud: MockReadAloud,
  repeat_sentence: MockRepeatSentence,
  describe_image: MockDescribeImage,
  re_tell_lecture: MockReTellLecture,
  answer_short_question: MockAnswerShortQuestion,
  summarize_written_text: MockSummarizeWrittenText,
  write_essay: MockWriteEssay,
  fill_in_the_blanks_reading: MockFillInTheBlanksReading,
  re_order_paragraphs: MockReOrderParagraphs,
  multiple_choice_reading: MockMultipleChoiceReading,
  write_from_dictation: MockWriteFromDictation,
  summarize_spoken_text: MockSummarizeSpokenText,
  fill_in_the_blanks_listening: MockFillInTheBlanksListening,
  highlight_correct_summary: MockHighlightCorrectSummary,
}

type ExamPhase = "intro" | "running" | "finished"

const SESSION_KEY = "echo_mock_session"

export default function MockExamPage() {
  const router = useRouter()
  const { t } = useTranslation()
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
  const CurrentScreen = MOCK_SCREENS[currentTask.type]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="4xl" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">

        {/* ── Intro screen ───────────────────────────────────────────────── */}
        {examPhase === "intro" && (
          <div>
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
                {t("mock.eyebrow")}
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">{t("mock.title")}</h1>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {t("mock.intro.desc")}
              </p>
            </div>

            <div className="border border-slate-900 bg-white p-6 dark:border-white/15 dark:bg-slate-900 shadow-[6px_6px_0_rgba(15,23,42,0.08)] mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-4">
                {t("mock.intro.taskSequence", { count: TASK_SEQUENCE.length })}
              </p>
              <ol className="space-y-3">
                {TASK_SEQUENCE.map((task, i) => (
                  <li key={task.type} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{taskTypeLabel(t, task.type)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{task.description}</p>
                    </div>
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 shrink-0">{t(task.sectionLabelKey)}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20 mb-8 text-sm text-amber-700 dark:text-amber-300">
              {t("mock.intro.warning")}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setExamPhase("running")}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {t("mock.startExam")}
              </button>
              <Link
                href="/practice"
                className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:border-slate-900 dark:border-white/20 dark:text-slate-300 dark:hover:border-white"
              >
                {t("mock.backToPractice")}
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
                    {t("mock.taskProgress", { current: taskIndex + 1, total: TASK_SEQUENCE.length })}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                    {taskTypeLabel(t, currentTask.type)}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t(currentTask.sectionLabelKey)}</p>
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
                {TASK_SEQUENCE.map((task, i) => (
                  <div
                    key={task.type}
                    className={`w-2 h-2 rounded-full -mt-3.5 ${i < taskIndex ? "bg-emerald-500" : i === taskIndex ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"}`}
                  />
                ))}
              </div>
            </div>

            {/* Task component — key forces remount on task change */}
            <div key={`task-${taskIndex}`}>
              <CurrentScreen onComplete={handleTaskComplete} />
            </div>
          </div>
        )}

        {/* ── Finished (fallback while redirecting) ─────────────────────── */}
        {examPhase === "finished" && (
          <div className="text-center py-16">
            <div className="inline-block w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-slate-600 dark:text-slate-300">{t("mock.loadingResults")}</p>
          </div>
        )}
      </main>
    </div>
  )
}
