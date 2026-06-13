"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost } from "@/lib/api-client"
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
  const [recSec, setRecSec] = useState(RECORD_TIME)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)

  const startedAtRef = useRef("")
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null)
  const txRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const processAudioRef = useRef<(b: Blob) => void>(() => {})

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    srRef.current?.stop()
  }, [])

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)
    const tx = txRef.current.trim() || "[transcript not captured]"

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
        createdAt: startedAtRef.current,
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
        createdAt: startedAtRef.current,
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [])  

  useEffect(() => { processAudioRef.current = processAudio }, [processAudio])

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    srRef.current?.stop(); srRef.current = null
    const mr = mrRef.current
    if (!mr || mr.state === "inactive") {
      processAudioRef.current(new Blob([], { type: "audio/webm" }))
      return
    }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" })
      streamRef.current?.getTracks().forEach(t => t.stop())
      processAudioRef.current(blob)
    }
    mr.stop()
  }, [])  

  const startRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("recording")
    startedAtRef.current = new Date().toISOString()
    chunksRef.current = []; txRef.current = ""
    setRecSec(RECORD_TIME)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mrRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(250)
    } catch {
      setPhase("error")
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : null
    if (SR) {
      const rec = new SR()
      rec.continuous = true; rec.interimResults = false; rec.lang = "en-US"
      rec.onresult = (e: { results: SpeechRecognitionResultList; resultIndex: number }) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) txRef.current += (txRef.current ? " " : "") + e.results[i][0].transcript
        }
      }
      rec.onerror = () => {}
      srRef.current = rec
      try { rec.start() } catch {}
    }

    timerRef.current = setInterval(() => {
      setRecSec(s => {
        if (s <= 1) { clearInterval(timerRef.current!); stopRecording(); return 0 }
        return s - 1
      })
    }, 1000)
  }, [stopRecording])

  // Auto-start prep timer on mount
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setPrepSec(s => {
        if (s <= 1) { clearInterval(timerRef.current!); startRecording(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
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
          <CountdownRing seconds={recSec} total={RECORD_TIME} size={80} />
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
