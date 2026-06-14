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

const TIME_LIMIT = 180 // 3 minutes

type Paragraph = { label: string; text: string }
type ParsedStimulus = { paragraphs: Paragraph[] }
type Phase = "idle" | "generating" | "ready" | "processing" | "done" | "error"

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as { paragraphs?: unknown }
    if (!Array.isArray(parsed.paragraphs) || parsed.paragraphs.length < 2) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildStimulusForFeedback(correctOrder: Paragraph[]): string {
  return (
    "Paragraphs in correct order:\n" +
    correctOrder.map((p) => `[${p.label}] ${p.text}`).join("\n\n")
  )
}

function buildResponseForFeedback(userOrder: Paragraph[], correctOrder: Paragraph[]): string {
  const userLabels = userOrder.map((p) => p.label).join(" → ")
  const correctLabels = correctOrder.map((p) => p.label).join(" → ")
  const correctCount = userOrder.filter((p, i) => p.label === correctOrder[i].label).length
  return (
    `Submitted order: ${userLabels}\n` +
    `Correct order:   ${correctLabels}\n` +
    `${correctCount} of ${correctOrder.length} paragraphs in the correct position.`
  )
}

export default function ReOrderParagraphsPage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [correctOrder, setCorrectOrder] = useState<Paragraph[]>([])
  const [displayOrder, setDisplayOrder] = useState<Paragraph[]>([])
  const [rawStimulus, setRawStimulus] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

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
    setError(""); setFeedback(null); setSeconds(TIME_LIMIT)
    try {
      const { mode, topic } = parsePracticeModeFromUrl(window.location.search)
      const extras = buildStimulusExtras(mode, topic)
      const isSeeded = mode !== "random"
      let raw: string
      const cached = isSeeded ? null : getStimulusFromBank("re_order_paragraphs")
      if (cached) {
        raw = cached
      } else {
        const data = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType: "re_order_paragraphs", ...extras })
        raw = data.text
        if (!isSeeded) addStimulusToBank("re_order_paragraphs", raw)
      }
      const p = parseStimulus(raw)
      if (!p) throw new Error("Invalid stimulus format from server")
      setRawStimulus(raw)
      setCorrectOrder(p.paragraphs)
      setDisplayOrder(shuffleArray(p.paragraphs))
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
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000,
    )

    const stimulusForFeedback = buildStimulusForFeedback(correctOrder)
    const responseForFeedback = buildResponseForFeedback(displayOrder, correctOrder)

    let result: TaskFeedback | null = null
    try {
      result = await apiPost<TaskFeedback>("/api/pte/feedback", {
        taskType: "re_order_paragraphs",
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
        taskType: "re_order_paragraphs",
        stimulus: { kind: "text", content: rawStimulus },
        response: { kind: "text", content: responseForFeedback },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [correctOrder, displayOrder, rawStimulus])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  const moveUp = (idx: number) => {
    if (idx === 0) return
    const next = [...displayOrder]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setDisplayOrder(next)
  }

  const moveDown = (idx: number) => {
    if (idx === displayOrder.length - 1) return
    const next = [...displayOrder]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setDisplayOrder(next)
  }

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    const next = [...displayOrder]
    const [removed] = next.splice(dragIdx, 1)
    next.splice(targetIdx, 0, removed)
    setDisplayOrder(next)
    setDragIdx(null)
    setDragOverIdx(null)
  }

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 30

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Re-order Paragraphs</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteReading')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Re-order Paragraphs</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.re-order-paragraphs.desc')}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">
              {t('practiceTask.re-order-paragraphs.idleDesc')}
            </p>
            <button
              onClick={generate}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {t('practiceTask.re-order-paragraphs.getParagraphs')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.re-order-paragraphs.generating')}</p>
          </div>
        )}

        {phase === "ready" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('practiceTask.re-order-paragraphs.dragToReorder')}
              </p>
              <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                {timeStr}
              </span>
            </div>

            <div className="space-y-3">
              {displayOrder.map((para, idx) => (
                <div
                  key={para.label}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(idx) }}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  className={`group flex items-start gap-3 border bg-[var(--surface)] p-4 cursor-grab active:cursor-grabbing transition-all ${
                    dragOverIdx === idx && dragIdx !== idx
                      ? "border-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.3)]"
                      : "border-[var(--border)]"
                  } ${dragIdx === idx ? "opacity-50" : ""}`}
                >
                  <span className="mt-0.5 shrink-0 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-xs font-mono font-semibold text-[var(--text-secondary)]">
                    {idx + 1}
                  </span>
                  <p className="flex-1 text-sm leading-7 text-[var(--foreground)]">{para.text}</p>
                  <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      aria-label="Move up"
                      className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] disabled:opacity-20"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === displayOrder.length - 1}
                      aria-label="Move down"
                      className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] disabled:opacity-20"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                {t('practiceTask.re-order-paragraphs.submitOrder')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.re-order-paragraphs.evaluating')}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={buildStimulusForFeedback(correctOrder)}
              stimulusLabel={t('practiceTask.re-order-paragraphs.correctOrder')}
              responseText={buildResponseForFeedback(displayOrder, correctOrder)}
              responseLabel={t('practiceTask.re-order-paragraphs.yourOrder')}
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
