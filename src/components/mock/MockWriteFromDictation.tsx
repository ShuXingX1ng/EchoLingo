"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { PracticeTask, TaskFeedback } from "@/types"

const TYPING_TIME = 180 // 3 min

type Phase = "generating" | "ready" | "typing" | "processing" | "done" | "error"

export default function MockWriteFromDictation({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [sentence, setSentence] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [userText, setUserText] = useState("")
  const [seconds, setSeconds] = useState(TYPING_TIME)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [error, setError] = useState("")

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const sentenceRef = useRef("")
  const userTextRef = useRef("")
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    audioRef.current?.pause()
  }, [])

  useEffect(() => {
    if (phase !== "typing") return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); submitRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  const handleSubmit = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    const text = userTextRef.current.trim()
    const stim = sentenceRef.current
    if (!text) { setError("Please type what you heard before submitting."); return }
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current || endedAt).getTime()) / 1000)

    let fb: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "write_from_dictation", stimulus: stim, response: text }),
      })
      if (res.ok) fb = await res.json() as TaskFeedback
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "write_from_dictation",
        stimulus: { kind: "audio", content: stim },
        response: { kind: "text", content: text },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAtRef.current || new Date().toISOString(),
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "write_from_dictation",
        stimulus: { kind: "audio", content: stim },
        response: { kind: "text", content: text },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAtRef.current || new Date().toISOString(),
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [])  

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])
  useEffect(() => { userTextRef.current = userText }, [userText])

  const playAudio = useCallback((url: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => {

      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setSeconds(TYPING_TIME)
      setPhase("typing")
    }
    audio.onerror = () => {

      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setSeconds(TYPING_TIME)
      setPhase("typing")
    }
    audio.play().catch(() => {

      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setSeconds(TYPING_TIME)
      setPhase("typing")
    })
  }, [])

  // Auto-generate on mount
  useEffect(() => {
    const generate = async () => {
      try {
        let text: string
        const cached = getStimulusFromBank("write_from_dictation")
        if (cached) {
          text = cached
        } else {
          const stimRes = await fetch("/api/pte/stimulus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskType: "write_from_dictation" }),
          })
          if (!stimRes.ok) throw new Error("Failed to generate sentence")
          text = ((await stimRes.json()) as { text: string }).text
          addStimulusToBank("write_from_dictation", text)
        }
        sentenceRef.current = text
        setSentence(text)

        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "en-US-AriaNeural", rate: 0.85 }),
        })
        if (!ttsRes.ok) throw new Error("TTS synthesis failed")
        const blob = await ttsRes.blob()
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
  const timeUrgent = seconds <= 30
  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length

  const skipTask = () => {
    const emptyTask: PracticeTask = {
      id: `mock_${Date.now()}`,
      taskType: "write_from_dictation",
      stimulus: { kind: "audio", content: sentence },
      response: { kind: "text", content: "" },
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
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating sentence and audio…</p>
        </div>
      )}

      {phase === "ready" && audioUrl && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
            Listen carefully — you can only play once
          </p>
          <button onClick={() => playAudio(audioUrl)}
            className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
            Play Sentence
          </button>
          <p className="mt-4 text-xs text-slate-400">Typing area opens after the sentence plays</p>
        </div>
      )}

      {phase === "typing" && (
        <div className="space-y-4">
          <div className="border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300 mb-1">
                  Type what you heard
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Do not replay. Type every word exactly as spoken.</p>
              </div>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
                {timeStr}
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your Transcription</p>
              <span className="text-xs text-slate-400 tabular-nums">{wordCount} words</span>
            </div>
            <textarea
              value={userText}
              onChange={e => setUserText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
              placeholder="Type the sentence here…"
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white p-4 text-sm leading-7 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 resize-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <button onClick={handleSubmit} disabled={!userText.trim()}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">
              Submit
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Checking your transcription…</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">AI Feedback</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
            {(doneTask.feedback?.strengths.length ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">Strengths</p>
                <ul className="space-y-1">{doneTask.feedback!.strengths.map((s, i) => <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="text-emerald-500 shrink-0">+</span>{s}</li>)}</ul>
              </div>
            )}
            {(doneTask.feedback?.weaknesses.length ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">Areas to Improve</p>
                <ul className="space-y-1">{doneTask.feedback!.weaknesses.map((w, i) => <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="text-red-400 shrink-0">–</span>{w}</li>)}</ul>
              </div>
            )}
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
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            Skip this task
          </button>
        </div>
      )}
    </div>
  )
}
