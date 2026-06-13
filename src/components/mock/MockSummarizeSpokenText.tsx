"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { PracticeTask, TaskFeedback } from "@/types"

const TIME_LIMIT = 600 // 10 min

type Phase = "generating" | "ready" | "listening" | "writing" | "processing" | "done" | "error"

export default function MockSummarizeSpokenText({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [passage, setPassage] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [summary, setSummary] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [error, setError] = useState("")

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const passageRef = useRef("")
  const summaryRef = useRef("")
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    audioRef.current?.pause()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  useEffect(() => {
    if (phase !== "writing") return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          clearInterval(timerRef.current!)
          submitRef.current()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  useEffect(() => { summaryRef.current = summary }, [summary])

  const handleSubmit = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    const text = summaryRef.current.trim() || "(no response)"
    const stim = passageRef.current
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const startedAt = startedAtRef.current || endedAt
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)

    let fb: TaskFeedback | null = null
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "summarize_spoken_text", stimulus: stim, response: text })
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "summarize_spoken_text",
        stimulus: { kind: "audio", content: stim },
        response: { kind: "text", content: text },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "summarize_spoken_text",
        stimulus: { kind: "audio", content: stim },
        response: { kind: "text", content: text },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  const playAudio = useCallback((url: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => {
      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setSeconds(TIME_LIMIT)
      setPhase("writing")
    }
    audio.onerror = () => {
      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setSeconds(TIME_LIMIT)
      setPhase("writing")
    }
    setPhase("listening")
    audio.play().catch(() => {
      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setSeconds(TIME_LIMIT)
      setPhase("writing")
    })
  }, [])

  useEffect(() => {
    const generate = async () => {
      try {
        let text: string
        const cached = getStimulusFromBank("summarize_spoken_text")
        if (cached) {
          text = cached
        } else {
          const res = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType: "summarize_spoken_text" })
          text = res.text
          addStimulusToBank("summarize_spoken_text", text)
        }
        passageRef.current = text
        setPassage(text)

        const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.85 })
        setAudioUrl(URL.createObjectURL(blob))
        setPhase("ready")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed")
        setPhase("error")
      }
    }
    generate()
  }, [])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const wordCount = summary.trim().split(/\s+/).filter(Boolean).length

  const skipTask = () => {
    onComplete({
      id: `mock_${Date.now()}`,
      taskType: "summarize_spoken_text",
      stimulus: { kind: "audio", content: passage },
      response: { kind: "text", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating passage and audio...</p>
        </div>
      )}

      {phase === "ready" && audioUrl && (
        <div className="border border-slate-900 bg-white p-8 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-slate-900">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Listen carefully - you can only play once
          </p>
          <button
            onClick={() => playAudio(audioUrl)}
            className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            Play Passage
          </button>
          <p className="mt-4 text-xs text-slate-400">Writing area opens after the passage plays.</p>
        </div>
      )}

      {phase === "listening" && (
        <div className="border border-slate-900 bg-white p-8 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Passage playing...</p>
          <p className="mt-1 text-xs text-slate-400">The writing timer starts when the passage ends.</p>
        </div>
      )}

      {phase === "writing" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Write your summary</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>{timeStr}</span>
          </div>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="Write a 50-70 word summary of the passage..."
            autoFocus
            rows={6}
            className="w-full resize-none rounded-lg border border-slate-300 bg-white p-4 text-sm leading-7 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
          />
          <div className="flex items-center justify-between">
            <span className={`text-xs tabular-nums ${wordCount < 50 || wordCount > 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {wordCount} words
            </span>
            <button
              onClick={handleSubmit}
              disabled={!summary.trim()}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              Submit Summary
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your summary...</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <FeedbackPreview task={doneTask} />
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              Continue to Next Task
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300">
            Skip this task
          </button>
        </div>
      )}
    </div>
  )
}

function FeedbackPreview({ task }: { task: PracticeTask }) {
  return (
    <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">AI Feedback</p>
      <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{task.feedback?.summary}</p>
      {(task.feedback?.weaknesses.length ?? 0) > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
          <p className="mb-2 text-xs font-semibold text-red-600 dark:text-red-400">Areas to Improve</p>
          <ul className="space-y-1">{task.feedback!.weaknesses.map((w, i) => <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="shrink-0 text-red-400">-</span>{w}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
