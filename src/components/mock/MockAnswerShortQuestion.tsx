"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost } from "@/lib/api-client"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
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
  const questionRef = useRef("")
  const correctAnswerRef = useRef("")
  const processResponseRef = useRef<(tx: string) => void>(() => {})

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    srRef.current?.stop()
  }, [])

  const processResponse = useCallback(async (tx: string) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)
    const stimulusWithAnswer = `Question: ${questionRef.current}\nCorrect answer: ${correctAnswerRef.current}`

    let fb: TaskFeedback | null = null
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "answer_short_question", stimulus: stimulusWithAnswer, response: tx })
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "answer_short_question",
        stimulus: { kind: "text", content: questionRef.current },
        response: { kind: "audio", content: tx },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "answer_short_question",
        stimulus: { kind: "text", content: questionRef.current },
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

  useEffect(() => { processResponseRef.current = processResponse }, [processResponse])

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    srRef.current?.stop(); srRef.current = null
    const mr = mrRef.current
    if (!mr || mr.state === "inactive") {
      processResponseRef.current(txRef.current || "[no answer detected]")
      return
    }
    mr.onstop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      processResponseRef.current(txRef.current || "[no answer detected]")
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

  // Auto-generate on mount
  useEffect(() => {
    const generate = async () => {
      try {
        let text: string
        const cached = getStimulusFromBank("answer_short_question")
        if (cached) {
          text = cached
        } else {
          const res = await fetch("/api/pte/stimulus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskType: "answer_short_question" }),
          })
          if (!res.ok) throw new Error("Failed to generate question")
          text = ((await res.json()) as { text: string }).text
          addStimulusToBank("answer_short_question", text)
        }

        const [q, a] = text.split("\n")
        const qText = q?.trim() ?? text
        const aText = a?.trim() ?? ""
        questionRef.current = qText
        correctAnswerRef.current = aText
        setQuestion(qText)
        setCorrectAnswer(aText)
        setCountSec(PAUSE_TIME)
        setPhase("countdown")

        timerRef.current = setInterval(() => {
          setCountSec(s => {
            if (s <= 1) { clearInterval(timerRef.current!); startRecording(); return 0 }
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
            <CountdownRing seconds={recSec} total={RECORD_TIME} size={72} />
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
