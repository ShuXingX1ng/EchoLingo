"use client"

import { useEffect } from "react"
import { usePracticeTaskRunner } from "@/hooks/usePracticeTaskRunner"
import type { PracticeTask } from "@/types"

const TIME_LIMIT = 600

export default function MockSummarizeWrittenText({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const {
    phase, stimulus, seconds, error, savedTask,
    userText, setText, submit, generate,
  } = usePracticeTaskRunner({
    taskType: "summarize_written_text",
    responseKind: "text",
    timeLimit: TIME_LIMIT,
  })

  useEffect(() => {
    if (phase === "done" && savedTask) onComplete(savedTask)
  }, [phase, savedTask, onComplete])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length

  const skipTask = () => onComplete({
    id: `mock_${Date.now()}`,
    taskType: "summarize_written_text",
    stimulus: { kind: "text", content: stimulus },
    response: { kind: "text", content: "" },
    durationSeconds: 0,
    createdAt: new Date().toISOString(),
  })

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating passage…</p>
        </div>
      )}

      {phase === "writing" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Passage</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
              {timeStr}
            </span>
          </div>
          <div className="border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <p className="text-sm leading-8 text-slate-800 dark:text-slate-100">{stimulus}</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your Summary</p>
              <span className="text-xs text-slate-400 tabular-nums">{wordCount} words (aim for 1 sentence)</span>
            </div>
            <textarea
              value={userText}
              onChange={e => setText(e.target.value)}
              placeholder="Write a one-sentence summary of the passage…"
              className="w-full rounded-lg border border-slate-300 bg-white p-4 text-sm leading-7 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 resize-none"
              rows={4}
            />
          </div>
          <div className="flex justify-end">
            <button onClick={() => submit()} disabled={!userText.trim()}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">
              Submit Summary
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your summary…</p>
        </div>
      )}

      {/* done: onComplete fires via useEffect */}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Retry
            </button>
            <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
              Skip this task
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
