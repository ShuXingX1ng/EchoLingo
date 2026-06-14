"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { blobToWav } from "@/lib/wav-encoder"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import { apiPost, apiPostForm } from "@/lib/api-client"
import type { PracticeTask, TaskFeedback, PronunciationAssessmentResult } from "@/types"
import CountdownRing from "@/components/CountdownRing"

const PREP_TIME = 35
const RECORD_TIME = 40

type Phase = "generating" | "prep" | "recording" | "processing" | "done" | "error"

export default function MockReadAloud({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [stimulus, setStimulus] = useState("")
  const [prepSec, setPrepSec] = useState(PREP_TIME)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const stimulusRef = useRef("")
  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (prepTimerRef.current) clearInterval(prepTimerRef.current) }, [])

  const processAudio = useCallback(async (audioBlob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )
    const stim = stimulusRef.current

    let wavBlob: Blob | null = null
    if (audioBlob.size > 0) {
      try { wavBlob = await blobToWav(audioBlob) } catch { /* optional */ }
    }

    const azurePromise: Promise<PronunciationAssessmentResult | null> = wavBlob
      ? (async () => {
          try {
            const form = new FormData()
            form.append("audio", wavBlob!, "recording.wav")
            form.append("referenceText", stim)
            return await apiPostForm<PronunciationAssessmentResult>("/api/pronunciation", form)
          } catch { return null }
        })()
      : Promise.resolve(null)

    const feedbackPromise: Promise<TaskFeedback | null> = (async () => {
      try {
        return await apiPost<TaskFeedback>("/api/read-aloud/feedback", { stimulus: stim, transcript: tx })
      } catch { return null }
    })()

    const [pronunciationResult, feedbackResult] = await Promise.all([azurePromise, feedbackPromise])
    const fb: TaskFeedback = feedbackResult ?? {
      summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [],
    }
    if (pronunciationResult) fb.pronunciationAssessment = pronunciationResult

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "read_aloud",
        stimulus: { kind: "text", content: stim },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "read_aloud",
        stimulus: { kind: "text", content: stim },
        response: { kind: "audio", content: tx },
        feedback: fb,
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
    onError: msg => { setErrorMsg(msg); setPhase("error") },
  })

  const startPrepTimer = useCallback(() => {
    setPrepSec(PREP_TIME)
    setPhase("prep")
    prepTimerRef.current = setInterval(() => {
      setPrepSec(s => {
        if (s <= 1) { clearInterval(prepTimerRef.current!); recording.start(); return 0 }
        return s - 1
      })
    }, 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.start])

  useEffect(() => {
    loadStimulusText({ taskType: "read_aloud", randomEndpoint: "/api/read-aloud/stimulus" })
      .then(text => {
        stimulusRef.current = text
        setStimulus(text)
        startPrepTimer()
      })
      .catch(e => {
        setErrorMsg(e instanceof Error ? e.message : "Failed to generate passage")
        setPhase("error")
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipTask = () => {
    onComplete({
      id: `mock_${Date.now()}`,
      taskType: "read_aloud",
      stimulus: { kind: "text", content: stimulus },
      response: { kind: "audio", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating passage…</p>
        </div>
      )}

      {phase === "prep" && (
        <div className="space-y-4">
          <div className="border border-slate-900 bg-white p-6 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preparation</p>
              <CountdownRing seconds={prepSec} total={PREP_TIME} />
            </div>
            <p className="text-base leading-8 text-slate-900 dark:text-white font-serif">{stimulus}</p>
          </div>
          <p className="text-xs text-slate-400 text-center">Recording starts automatically when time is up</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="space-y-4">
          <div className="border-2 border-red-400 bg-white p-6 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Recording</p>
              </div>
              <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} size={64} />
            </div>
            <p className="text-base leading-8 text-slate-900 dark:text-white font-serif">{stimulus}</p>
          </div>
          <p className="text-xs text-slate-400 text-center">Read the passage aloud — recording stops automatically</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Analyzing your reading…</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">Passage</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-300 font-serif">{stimulus}</p>
          </div>
          {doneTask.feedback?.pronunciationAssessment && (
            <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-3">Pronunciation Scores</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Overall", val: doneTask.feedback.pronunciationAssessment.score },
                  { label: "Accuracy", val: doneTask.feedback.pronunciationAssessment.accuracyScore },
                  { label: "Fluency", val: doneTask.feedback.pronunciationAssessment.fluencyScore },
                  { label: "Complete", val: doneTask.feedback.pronunciationAssessment.completenessScore },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <span className={`inline-block rounded border px-2 py-0.5 text-sm font-semibold ${val >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" : val >= 60 ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"}`}>{val}</span>
                    <p className="mt-1 text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
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
