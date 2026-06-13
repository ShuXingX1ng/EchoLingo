"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import type { PracticeTask, TaskFeedback } from "@/types"
import CountdownRing from "./CountdownRing"

const PREP_TIME = 10
const RECORD_TIME = 40

type Phase = "generating" | "ready" | "listening" | "prep" | "recording" | "processing" | "done" | "error"

export default function MockReTellLecture({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [lectureText, setLectureText] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lectureTextRef = useRef("")
  const processAudioRef = useRef<(b: Blob) => void>(() => {})

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    srRef.current?.stop()
    audioRef.current?.pause()
  }, [])

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)
    const tx = txRef.current.trim() || "[transcript not captured]"
    const stim = lectureTextRef.current

    let fb: TaskFeedback
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "re_tell_lecture", stimulus: stim, response: tx })
    } catch {
      fb = { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "re_tell_lecture",
        stimulus: { kind: "audio", content: stim },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "re_tell_lecture",
        stimulus: { kind: "audio", content: stim },
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

  const startPrepTimer = useCallback(() => {
    setPrepSec(PREP_TIME)
    setPhase("prep")
    timerRef.current = setInterval(() => {
      setPrepSec(s => {
        if (s <= 1) { clearInterval(timerRef.current!); startRecording(); return 0 }
        return s - 1
      })
    }, 1000)
  }, [startRecording])

  const playLecture = useCallback((url: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => startPrepTimer()
    audio.onerror = () => startPrepTimer()
    setPhase("listening")
    audio.play().catch(() => startPrepTimer())
  }, [startPrepTimer])

  // Auto-generate on mount
  useEffect(() => {
    const generate = async () => {
      try {
        let text: string
        const cached = getStimulusFromBank("re_tell_lecture")
        if (cached) {
          text = cached
        } else {
          const stimData = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType: "re_tell_lecture" })
          text = stimData.text
          addStimulusToBank("re_tell_lecture", text)
        }
        lectureTextRef.current = text
        setLectureText(text)

        const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.85 })
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setPhase("ready")
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to generate lecture")
        setPhase("error")
      }
    }
    generate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipTask = () => {
    const emptyTask: PracticeTask = {
      id: `mock_${Date.now()}`,
      taskType: "re_tell_lecture",
      stimulus: { kind: "audio", content: lectureText },
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
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Generating lecture audio…</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Writing lecture text and synthesizing speech</p>
        </div>
      )}

      {phase === "ready" && audioUrl && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
            Lecture ready — listen carefully
          </p>
          <button onClick={() => playLecture(audioUrl)}
            className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 mb-4">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
            Play Lecture
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            After the lecture ends, you will have {PREP_TIME}s to prepare, then {RECORD_TIME}s to re-tell it.
          </p>
        </div>
      )}

      {phase === "listening" && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-center gap-2 mb-4">
            {[0, 1, 2, 3, 4].map(i => (
              <span key={i} className="inline-block w-1 rounded-full bg-emerald-500"
                style={{ height: `${16 + (i % 3) * 8}px`, animation: `pulse 0.8s ease-in-out ${i * 0.12}s infinite alternate` }} />
            ))}
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Lecture playing…</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Listen carefully. Preparation starts when the lecture ends.</p>
          <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
        </div>
      )}

      {phase === "prep" && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
            Preparation — organise your thoughts
          </p>
          <CountdownRing seconds={prepSec} total={PREP_TIME} size={88} />
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            Recording starts automatically in {prepSec}s
          </p>
        </div>
      )}

      {phase === "recording" && (
        <div className="border-2 border-red-400 bg-white p-8 dark:bg-slate-900 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
              Recording — Re-tell the lecture now
            </p>
          </div>
          <CountdownRing seconds={recSec} total={RECORD_TIME} size={80} />
          <p className="mt-4 text-xs text-slate-400">Recording stops automatically when time is up</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Analyzing your re-tell…</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
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
