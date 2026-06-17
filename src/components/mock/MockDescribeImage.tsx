"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost } from "@/lib/api-client"
import { getRandomImage } from "@/lib/image-bank"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import type { ImageStimulus } from "@/lib/image-bank"
import type { PracticeTask, TaskFeedback } from "@/types"
import CountdownRing from "./CountdownRing"

const PREP_TIME = 25
const RECORD_TIME = 40

type Phase = "prep" | "recording" | "processing" | "done" | "error"

export default function MockDescribeImage({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("prep")
  const [image] = useState<ImageStimulus>(() => getRandomImage())
  const [imageError, setImageError] = useState(false)
  const [prepSec, setPrepSec] = useState(PREP_TIME)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const processAudio = useCallback(async (_blob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )
    const stimulusText = `Image type: ${image.topic}\n\nImage content: ${image.description}`

    let fb: TaskFeedback
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "describe_image", stimulus: stimulusText, response: tx })
    } catch {
      fb = { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "describe_image",
        stimulus: { kind: "image", content: image.url },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "describe_image",
        stimulus: { kind: "image", content: image.url },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [image])

  const recording = useRecordingSession({
    totalSeconds: RECORD_TIME,
    onComplete: processAudio,
    onError: msg => { setErrorMsg(msg); setPhase("error") },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipTask = () => {
    const emptyTask: PracticeTask = {
      id: `mock_${Date.now()}`,
      taskType: "describe_image",
      stimulus: { kind: "image", content: image.url },
      response: { kind: "audio", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    }
    onComplete(emptyTask)
  }

  return (
    <div className="space-y-5">
      {phase === "prep" && (
        <div className="space-y-4">
          <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preparation</p>
              <CountdownRing seconds={prepSec} total={PREP_TIME} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{image.topic}</p>
            {imageError ? (
              <div className="flex items-center justify-center h-48 bg-slate-100 dark:bg-slate-800 text-sm text-slate-500">
                Image failed to load
              </div>
            ) : (
              <div className="relative w-full" style={{ minHeight: 200 }}>
                <Image src={image.url} alt={image.topic} width={640} height={400}
                  className="w-full h-auto object-contain" onError={() => setImageError(true)} unoptimized />
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 text-center">Recording starts automatically when time is up</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="space-y-4">
          <div className="border-2 border-red-400 bg-white p-5 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Recording</p>
              </div>
              <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} size={64} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{image.topic}</p>
            {imageError ? (
              <div className="flex items-center justify-center h-48 bg-slate-100 dark:bg-slate-800 text-sm text-slate-500">
                Image failed to load
              </div>
            ) : (
              <div className="relative w-full" style={{ minHeight: 200 }}>
                <Image src={image.url} alt={image.topic} width={640} height={400}
                  className="w-full h-auto object-contain" onError={() => setImageError(true)} unoptimized />
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 text-center">Describe what you see — recording stops automatically</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Analyzing your description…</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">Image</p>
            <p className="text-xs text-slate-500 mb-2">{image.topic}</p>
            {!imageError && (
              <div className="relative w-full">
                <Image src={image.url} alt={image.topic} width={400} height={250}
                  className="w-full h-auto object-contain max-h-40" unoptimized />
              </div>
            )}
          </div>
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">AI Feedback</p>
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
