"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost } from "@/lib/api-client"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import type { PracticeTask, TaskFeedback } from "@/types"
import CountdownRing from "./CountdownRing"

const PREP_TIME = 25
const RECORD_TIME = 30
const PROMPT =
  "Please introduce yourself. Tell us about your background, studies or work, " +
  "your English learning experience, and your goals. Speak naturally and clearly."

type Phase = "prep" | "recording" | "processing" | "done" | "error"

export default function MockPersonalIntro({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("prep")
  const [prepSec, setPrepSec] = useState(PREP_TIME)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const processAudio = useCallback(async (audioBlob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )

    let fb: TaskFeedback | null = null
    try {
      if (audioBlob.size > 0) {
        fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "personal_intro", stimulus: PROMPT, response: tx })
      }
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? {
      summary: "Warm-up complete. No score for Personal Introduction.",
      strengths: [], weaknesses: [], suggestions: [],
    }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "personal_intro",
        stimulus: { kind: "text", content: PROMPT },
        response: { kind: "audio", content: tx },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "personal_intro",
        stimulus: { kind: "text", content: PROMPT },
        response: { kind: "audio", content: tx },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [])

  const recording = useRecordingSession({
    totalSeconds: RECORD_TIME,
    onComplete: processAudio,
    onError: () => { setPhase("error") },
  })

  useEffect(() => () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
  }, [])

  // Auto-start prep timer on mount
  useEffect(() => {
    prepTimerRef.current = setInterval(() => {
      setPrepSec(s => {
        if (s <= 1) {
          clearInterval(prepTimerRef.current!)
          setPhase("recording")
          recording.start()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (prepTimerRef.current) clearInterval(prepTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipTask = () => {
    const emptyTask: PracticeTask = {
      id: `mock_${Date.now()}`,
      taskType: "personal_intro",
      stimulus: { kind: "text", content: PROMPT },
      response: { kind: "audio", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    }
    onComplete(emptyTask)
  }

  return (
    <div className="space-y-5">
      <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2">Task Prompt</p>
        <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{PROMPT}</p>
      </div>

      {phase === "prep" && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-4">Preparation Time</p>
          <CountdownRing seconds={prepSec} total={PREP_TIME} size={80} />
          <p className="mt-4 text-xs text-slate-400">Recording begins automatically when time is up</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="border-2 border-red-400 bg-white p-8 dark:bg-slate-900 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
              Recording — Introduce yourself now
            </p>
          </div>
          <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} size={80} />
          <p className="mt-4 text-xs text-slate-400">Recording stops automatically when time is up</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Processing your introduction…</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-3">Feedback</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
            {(doneTask.feedback?.strengths.length ?? 0) > 0 && (
              <div className="mt-3 border-t border-slate-100 dark:border-white/10 pt-3">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">Strengths</p>
                <ul className="space-y-1">
                  {doneTask.feedback!.strengths.map((s, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span className="text-emerald-500 shrink-0">+</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              Continue to Next Task →
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">Microphone access failed.</p>
          <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            Skip this task
          </button>
        </div>
      )}
    </div>
  )
}
