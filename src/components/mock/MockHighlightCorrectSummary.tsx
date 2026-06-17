"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import type { PracticeTask, TaskFeedback } from "@/types"

const TIME_LIMIT = 300 // 5 min

type ParsedStimulus = {
  passage: string
  summaries: string[]
  correct: number
}
type Phase = "generating" | "ready" | "listening" | "selecting" | "processing" | "done" | "error"

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as { passage?: unknown; summaries?: unknown; correct?: unknown }
    if (
      typeof parsed.passage !== "string" ||
      !Array.isArray(parsed.summaries) ||
      parsed.summaries.length !== 5 ||
      typeof parsed.correct !== "number"
    ) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function buildStimulusForFeedback(parsed: ParsedStimulus): string {
  const options = parsed.summaries
    .map((summary, i) => `${String.fromCharCode(65 + i)}. ${summary}${i === parsed.correct ? " (correct)" : ""}`)
    .join("\n")
  return `Passage:\n${parsed.passage}\n\nSummary options:\n${options}`
}

function buildResponseForFeedback(parsed: ParsedStimulus, selected: number | null): string {
  const correctLetter = String.fromCharCode(65 + parsed.correct)
  if (selected === null) {
    return `Selected: (no answer) (correct answer: ${correctLetter}. ${parsed.summaries[parsed.correct]})`
  }
  const selectedLetter = String.fromCharCode(65 + selected)
  const isCorrect = selected === parsed.correct
  if (isCorrect) {
    return `Selected: ${selectedLetter}. ${parsed.summaries[selected]} (correct)`
  }
  return `Selected: ${selectedLetter}. ${parsed.summaries[selected]} (incorrect; correct answer: ${correctLetter}. ${parsed.summaries[parsed.correct]})`
}

export default function MockHighlightCorrectSummary({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const [phase, setPhase] = useState<Phase>("generating")
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [rawStimulus, setRawStimulus] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [seconds, setSeconds] = useState(TIME_LIMIT)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [error, setError] = useState("")

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const parsedRef = useRef<ParsedStimulus | null>(null)
  const rawStimulusRef = useRef("")
  const selectedRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    audioRef.current?.pause()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  useEffect(() => {
    if (phase !== "selecting") return
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

  useEffect(() => { selectedRef.current = selected }, [selected])

  const handleSubmit = useCallback(async () => {
    const currentParsed = parsedRef.current
    if (!currentParsed) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const startedAt = startedAtRef.current || endedAt
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    const stimulusForFeedback = buildStimulusForFeedback(currentParsed)
    const responseForFeedback = buildResponseForFeedback(currentParsed, selectedRef.current)

    let fb: TaskFeedback | null = null
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", {
        taskType: "highlight_correct_summary",
        stimulus: stimulusForFeedback,
        response: responseForFeedback,
      })
    } catch { /* best-effort */ }

    const finalFb: TaskFeedback = fb ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "highlight_correct_summary",
        stimulus: { kind: "audio", content: rawStimulusRef.current },
        response: { kind: "text", content: responseForFeedback },
        feedback: finalFb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "highlight_correct_summary",
        stimulus: { kind: "audio", content: rawStimulusRef.current },
        response: { kind: "text", content: responseForFeedback },
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
      setPhase("selecting")
    }
    audio.onerror = () => {
      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setSeconds(TIME_LIMIT)
      setPhase("selecting")
    }
    setPhase("listening")
    audio.play().catch(() => {
      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString()
      setSeconds(TIME_LIMIT)
      setPhase("selecting")
    })
  }, [])

  useEffect(() => {
    const generate = async () => {
      try {
        let raw: string
        const cached = getStimulusFromBank("highlight_correct_summary")
        if (cached) {
          raw = cached
        } else {
          const resData = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType: "highlight_correct_summary" }, { timeoutMs: 45000 })
          raw = resData.text
          addStimulusToBank("highlight_correct_summary", raw)
        }
        const nextParsed = parseStimulus(raw)
        if (!nextParsed) throw new Error("Invalid stimulus format")

        const blob = await apiPostBlob("/api/tts", { text: nextParsed.passage, voice: "en-US-AriaNeural", rate: 0.85 }, { timeoutMs: 30000 })

        parsedRef.current = nextParsed
        rawStimulusRef.current = raw
        setParsed(nextParsed)
        setRawStimulus(raw)
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

  const skipTask = () => {
    onComplete({
      id: `mock_${Date.now()}`,
      taskType: "highlight_correct_summary",
      stimulus: { kind: "audio", content: rawStimulus },
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
            className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            Play Passage
          </button>
          <p className="mt-4 text-xs text-slate-400">Summary options open after the passage plays.</p>
        </div>
      )}

      {phase === "listening" && (
        <div className="border border-slate-900 bg-white p-8 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Passage playing...</p>
          <p className="mt-1 text-xs text-slate-400">Focus on the main idea and key details.</p>
        </div>
      )}

      {phase === "selecting" && parsed && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select the correct summary</p>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>{timeStr}</span>
          </div>
          <div className="space-y-3 border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            {parsed.summaries.map((summary, i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all ${
                  selected === i
                    ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-900/20"
                    : "border-slate-200 bg-white hover:border-slate-400 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/30"
                }`}
              >
                <input
                  type="radio"
                  name="mock-highlight-correct-summary"
                  value={i}
                  checked={selected === i}
                  onChange={() => setSelected(i)}
                  className="mt-0.5 shrink-0 accent-emerald-600"
                />
                <span className="text-sm text-slate-800 dark:text-slate-100">
                  <span className="mr-2 font-semibold">{String.fromCharCode(65 + i)}.</span>{summary}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={selected === null}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              Submit Answer
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating your answer...</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">AI Feedback</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
          </div>
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
