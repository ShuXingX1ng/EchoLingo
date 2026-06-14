"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import { parsePracticeModeFromUrl, buildStimulusExtras } from "@/lib/practice-mode"
import { apiPost } from "@/lib/api-client"
import type { TaskFeedback } from "@/types"
import { useTranslation } from "@/lib/i18n"

const TIME_LIMIT = 240 // 4 minutes

type ParsedStimulus = {
  passage: string
  question: string
  options: string[]
  correct: number
}
type Phase = "idle" | "generating" | "ready" | "processing" | "done" | "error"

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as {
      passage?: unknown; question?: unknown; options?: unknown; correct?: unknown
    }
    if (
      typeof parsed.passage !== "string" ||
      typeof parsed.question !== "string" ||
      !Array.isArray(parsed.options) ||
      parsed.options.length !== 5 ||
      typeof parsed.correct !== "number"
    ) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function buildStimulusForFeedback(p: ParsedStimulus): string {
  const opts = p.options.map((o, i) => `${o}${i === p.correct ? " ✓" : ""}`).join("\n")
  return `Passage:\n${p.passage}\n\nQuestion: ${p.question}\n\nOptions:\n${opts}`
}

function buildResponseForFeedback(p: ParsedStimulus, selected: number): string {
  const selectedText = p.options[selected]
  const correctText = p.options[p.correct]
  const isCorrect = selected === p.correct
  if (isCorrect) {
    return `Selected: ${selectedText} ✓ (correct)`
  }
  return `Selected: ${selectedText} ✗ (incorrect — correct answer: ${correctText})`
}

export default function MultipleChoicePage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [rawStimulus, setRawStimulus] = useState("")
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    if (phase !== "ready") return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); submitRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  const generate = useCallback(async () => {
    setPhase("generating")
    setError(""); setFeedback(null); setSelected(null); setSeconds(TIME_LIMIT)
    try {
      const { mode, topic } = parsePracticeModeFromUrl(window.location.search)
      const extras = buildStimulusExtras(mode, topic)
      const isSeeded = mode !== "random"
      let raw: string
      const cached = isSeeded ? null : getStimulusFromBank("multiple_choice_reading")
      if (cached) {
        raw = cached
      } else {
        const data = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType: "multiple_choice_reading", ...extras })
        raw = data.text
        if (!isSeeded) addStimulusToBank("multiple_choice_reading", raw)
      }
      const p = parseStimulus(raw)
      if (!p) throw new Error("Invalid stimulus format from server")
      setRawStimulus(raw)
      setParsed(p)
      startedAtRef.current = new Date().toISOString()
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate")
      setPhase("error")
    }
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generate() }, [])

  const handleSubmit = useCallback(async () => {
    if (parsed === null || selected === null) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000,
    )

    const stimulusForFeedback = buildStimulusForFeedback(parsed)
    const responseForFeedback = buildResponseForFeedback(parsed, selected)

    let result: TaskFeedback | null = null
    try {
      result = await apiPost<TaskFeedback>("/api/pte/feedback", {
        taskType: "multiple_choice_reading",
        stimulus: stimulusForFeedback,
        response: responseForFeedback,
      })
    } catch { /* ignore */ }

    const fb: TaskFeedback = result ?? {
      summary: "Feedback unavailable.",
      strengths: [],
      weaknesses: [],
      suggestions: [],
    }
    setFeedback(fb)

    try {
      await saveTask({
        taskType: "multiple_choice_reading",
        stimulus: { kind: "text", content: rawStimulus },
        response: { kind: "text", content: responseForFeedback },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [parsed, selected, rawStimulus])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Multiple Choice</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteReading')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Multiple Choice</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.multiple-choice.desc')}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">
              {t('practiceTask.multiple-choice.idleDesc')}
            </p>
            <button
              onClick={generate}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {t('practiceTask.multiple-choice.getQuestion')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.multiple-choice.generating')}</p>
          </div>
        )}

        {phase === "ready" && parsed && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.common.passage')}</p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                {timeStr}
              </span>
            </div>
            <div className="border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm leading-8 text-[var(--foreground)]">{parsed.passage}</p>
            </div>

            <div className="border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
              <p className="text-sm font-semibold text-[var(--foreground)] leading-7">{parsed.question}</p>
              <div className="space-y-2">
                {parsed.options.map((opt, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-all ${
                      selected === i
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--foreground)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mc-option"
                      value={i}
                      checked={selected === i}
                      onChange={() => setSelected(i)}
                      className="mt-0.5 shrink-0 accent-emerald-600"
                    />
                    <span className="text-sm text-[var(--foreground)]">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={selected === null}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {t('practiceTask.common.submitAnswer')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.multiple-choice.evaluating')}</p>
          </div>
        )}

        {phase === "done" && feedback && parsed && selected !== null && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={buildStimulusForFeedback(parsed)}
              stimulusLabel={t('practiceTask.multiple-choice.passageQuestion')}
              responseText={buildResponseForFeedback(parsed, selected)}
              responseLabel={t('practiceTask.multiple-choice.yourAnswer')}
            />
            <div className="flex gap-3 justify-center">
              <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                {t('practiceTask.common.tryAnother')}
              </button>
              <Link href="/practice" className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--foreground)]">
                {t('practiceTask.common.backToPractice')}
              </Link>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              {t('practiceTask.common.tryAgain')}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
