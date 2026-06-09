"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import { saveTask } from "@/lib/unified-task-history"
import { getRandomImage } from "@/lib/image-bank"
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
  const [recSec, setRecSec] = useState(RECORD_TIME)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const startedAtRef = useRef("")
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null)
  const txRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const imageRef = useRef(image)
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
    const img = imageRef.current
    const stimulusText = `Image type: ${img.topic}\n\nImage content: ${img.description}`

    let fb: TaskFeedback
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "describe_image", stimulus: stimulusText, response: tx }),
      })
      fb = res.ok
        ? (await res.json()) as TaskFeedback
        : { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    } catch {
      fb = { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "describe_image",
        stimulus: { kind: "image", content: img.url },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "describe_image",
        stimulus: { kind: "image", content: img.url },
        response: { kind: "audio", content: tx },
        feedback: fb,
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
      setErrorMsg("Microphone access denied.")
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
              <CountdownRing seconds={recSec} total={RECORD_TIME} size={64} />
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
