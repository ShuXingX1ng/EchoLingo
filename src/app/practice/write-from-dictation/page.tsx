"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { TaskFeedback } from "@/types"

type Phase = "idle" | "generating" | "ready" | "typing" | "processing" | "done" | "error"

export default function WriteFromDictationPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [sentence, setSentence] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [userText, setUserText] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [hasPlayed, setHasPlayed] = useState(false)

  const startedAtRef = useRef("")
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const generate = useCallback(async () => {
    setPhase("generating")
    setError(""); setFeedback(null); setUserText(""); setHasPlayed(false)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

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
  }, [audioUrl])

  const playAudio = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.onended = () => {
      setHasPlayed(true)
      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setPhase("typing")
    }
    audio.play().catch(() => { setHasPlayed(true); setPhase("typing") })
  }, [audioUrl])

  const handleSubmit = useCallback(async () => {
    if (!userText.trim()) return
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current || endedAt).getTime()) / 1000)

    let result: TaskFeedback | null = null
    try {
      const res = await fetch("/api/pte/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "write_from_dictation", stimulus: sentence, response: userText }),
      })
      if (res.ok) result = await res.json() as TaskFeedback
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "write_from_dictation",
        stimulus: { kind: "audio", content: sentence },
        response: { kind: "text", content: userText },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current || new Date().toISOString(),
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [sentence, userText])

  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/practice" className="hover:text-slate-700 dark:hover:text-slate-200">Practice</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">Write from Dictation</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">PTE Listening</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Write from Dictation</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Listen to the sentence, then type exactly what you heard. Every word counts.
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-8 max-w-sm mx-auto">
              An AI-generated sentence will be read aloud. Type exactly what you hear — word for word.
            </p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              Get Sentence
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Generating sentence and audio…</p>
          </div>
        )}

        {phase === "ready" && (
          <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              Listen carefully — you can only play once
            </p>
            <button onClick={playAudio}
              className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play Sentence
            </button>
            <p className="mt-4 text-xs text-slate-400">Typing will begin automatically after the sentence plays.</p>
          </div>
        )}

        {phase === "typing" && (
          <div className="space-y-5">
            <div className="border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300 mb-1">Type what you heard</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Do not replay. Type every word exactly as spoken.</p>
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
              <p className="mt-1 text-xs text-slate-400">Press Enter or click Submit when done.</p>
            </div>
            <div className="flex justify-between items-center">
              <button onClick={playAudio} disabled={hasPlayed}
                className="text-xs text-slate-400 disabled:opacity-40 hover:text-slate-600 dark:hover:text-slate-200 disabled:cursor-not-allowed">
                {hasPlayed ? "Replay disabled" : "Replay once"}
              </button>
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

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay feedback={feedback} stimulus={sentence} stimulusLabel="Dictated Sentence"
              responseText={userText} responseLabel="Your Transcription" />
            <div className="flex gap-3 justify-center">
              <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                Try Another
              </button>
              <Link href="/practice" className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:border-slate-900 dark:border-white/20 dark:text-slate-300">
                Back to Practice
              </Link>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">Try Again</button>
          </div>
        )}
      </main>
    </div>
  )
}
