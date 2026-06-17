"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost } from "@/lib/api-client"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import type { PracticeTask, TaskFeedback } from "@/types"
import CountdownRing from "./CountdownRing"

const PAUSE_TIME = 3
const RECORD_TIME = 10

type Phase = "generating" | "countdown" | "recording" | "processing" | "done" | "error"

export default function MockAnswerShortQuestion({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [question, setQuestion] = useState("")
  const [correctAnswer, setCorrectAnswer] = useState("")
  const [countSec, setCountSec] = useState(PAUSE_TIME)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const processResponse = useCallback(async (_blob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )
    const stimulusWithAnswer = `Question: ${question}\nCorrect answer: ${correctAnswer}`

    let fb: TaskFeedback | null = null
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "answer_short_question", stimulus: stimulusWithAnswer, response: tx })
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "answer_short_question",
        stimulus: { kind: "text", content: question },
        response: { kind: "audio", content: tx },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "answer_short_question",
        stimulus: { kind: "text", content: question },
        response: { kind: "audio", content: tx },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [question, correctAnswer])

  const recording = useRecordingSession({
    totalSeconds: RECORD_TIME,
    onComplete: processResponse,
    onError: msg => { setErrorMsg(msg); setPhase("error") },
  })

  useEffect(() => () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
  }, [])

  // Auto-generate on mount
  useEffect(() => {
    const generate = async () => {
      try {
        const text = await loadStimulusText({ taskType: "answer_short_question" })
        const [q, a] = text.split("\n")
        const qText = q?.trim() ?? text
        const aText = a?.trim() ?? ""
        setQuestion(qText)
        setCorrectAnswer(aText)
        setCountSec(PAUSE_TIME)
        setPhase("countdown")

        prepTimerRef.current = setInterval(() => {
          setCountSec(s => {
            if (s <= 1) {
              clearInterval(prepTimerRef.current!)
              setPhase("recording")
              recording.start()
              return 0
            }
            return s - 1
          })
        }, 1000)
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to generate question")
        setPhase("error")
      }
    }
    generate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipTask = () => {
    const emptyTask: PracticeTask = {
      id: `mock_${Date.now()}`,
      taskType: "answer_short_question",
      stimulus: { kind: "text", content: question },
      response: { kind: "audio", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    }
    onComplete(emptyTask)
  }

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating question…</p>
        </div>
      )}

      {phase === "countdown" && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-4">Question</p>
          <p className="text-lg font-medium text-slate-900 dark:text-white mb-6">{question}</p>
          <CountdownRing seconds={countSec} total={PAUSE_TIME} size={64} />
          <p className="mt-4 text-xs text-slate-400">Recording starts automatically</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{question}</p>
          </div>
          <div className="border-2 border-red-400 bg-white p-8 dark:bg-slate-900 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                Recording — Answer the question now
              </p>
            </div>
            <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} size={72} />
            <p className="mt-4 text-xs text-slate-400">Recording stops automatically when time is up</p>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your answer…</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">Question</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{question}</p>
            {correctAnswer && (
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/10">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400 mb-1">Correct Answer</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 italic">{correctAnswer}</p>
              </div>
            )}
          </div>
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">Feedback</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              Continue to Next Task →
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{errorMsg}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            Skip this task
          </button>
        </div>
      )}
    </div>
  )
}
