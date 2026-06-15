"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import type { TaskFeedback } from "@/types"
import { useTranslation } from "@/lib/i18n"

const TIME_LIMIT = 420 // 7 minutes

type BlankDef = { options: string[]; correct: number }
type ParsedStimulus = { passage: string; blanks: BlankDef[] }
type Phase = "idle" | "generating" | "ready" | "listening" | "answering" | "processing" | "done" | "error"

function parseStimulus(raw: string): ParsedStimulus | null {
  try {
    const parsed = JSON.parse(raw) as { passage?: unknown; blanks?: unknown }
    if (typeof parsed.passage !== "string" || !Array.isArray(parsed.blanks)) return null
    return parsed as ParsedStimulus
  } catch {
    return null
  }
}

function splitPassage(passage: string): Array<{ type: "text" | "blank"; value: string }> {
  const parts = passage.split(/(\[BLANK_\d+\])/)
  return parts.map((p) => {
    const m = p.match(/^\[BLANK_(\d+)\]$/)
    return m ? { type: "blank" as const, value: m[1] } : { type: "text" as const, value: p }
  })
}

function buildStimulusForFeedback(parsed: ParsedStimulus): string {
  let passage = parsed.passage
  parsed.blanks.forEach((b, i) => {
    passage = passage.replace(`[BLANK_${i}]`, `[${b.options[b.correct]}]`)
  })
  const answers = parsed.blanks.map((b, i) => `Blank ${i + 1}: "${b.options[b.correct]}"`).join(", ")
  return `Passage (with correct answers):\n${passage}\n\nCorrect answers: ${answers}`
}

function buildResponseForFeedback(parsed: ParsedStimulus, selections: (string | null)[]): string {
  return parsed.blanks
    .map((b, i) => {
      const selected = selections[i] ?? "(no answer)"
      const correct = b.options[b.correct]
      const isCorrect = selected === correct
      return `Blank ${i + 1}: selected "${selected}" (correct: "${correct}") ${isCorrect ? "✓" : "✗"}`
    })
    .join("\n")
}

export default function FillInTheBlanksListeningPage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [parsed, setParsed] = useState<ParsedStimulus | null>(null)
  const [rawStimulus, setRawStimulus] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [selections, setSelections] = useState<(string | null)[]>([])
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(TIME_LIMIT)

  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    if (phase !== "answering") return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); submitRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  const generate = useCallback(async () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPhase("generating")
    setError(""); setFeedback(null); setSelections([]); setSeconds(TIME_LIMIT)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      const raw = await loadStimulusText({ taskType: "fill_in_the_blanks_listening", timeoutMs: 60000 })
      const p = parseStimulus(raw)
      if (!p) throw new Error("Invalid stimulus format from server")

      // Build the full passage text for TTS (with blanks filled)
      let ttsText = p.passage
      p.blanks.forEach((b, i) => {
        ttsText = ttsText.replace(`[BLANK_${i}]`, b.options[b.correct])
      })

      const blob = await apiPostBlob("/api/tts", { text: ttsText, voice: "en-US-AriaNeural", rate: 0.85 }, { timeoutMs: 30000 })
      const url = URL.createObjectURL(blob)

      setRawStimulus(raw)
      setParsed(p)
      setAudioUrl(url)
      setSelections(new Array(p.blanks.length).fill(null))
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate")
      setPhase("error")
    }
  }, [audioUrl])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generate() }, [])

  const playPassage = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.onended = () => {
      setPhase("answering")
      startedAtRef.current = new Date().toISOString()
      setSeconds(TIME_LIMIT)
    }
    setPhase("listening")
    requestAnimationFrame(() => {
      audio.play().catch(() => {
        setPhase("ready")
        audioRef.current = null
      })
    })
  }, [audioUrl])

  const handleSubmit = useCallback(async () => {
    if (!parsed) return
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000,
    )

    const stimulusForFeedback = buildStimulusForFeedback(parsed)
    const responseForFeedback = buildResponseForFeedback(parsed, selections)

    let result: TaskFeedback | null = null
    try {
      result = await apiPost<TaskFeedback>("/api/pte/feedback", {
        taskType: "fill_in_the_blanks_listening",
        stimulus: stimulusForFeedback,
        response: responseForFeedback,
      }, { timeoutMs: 90000 })
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
        taskType: "fill_in_the_blanks_listening",
        stimulus: { kind: "audio", content: rawStimulus },
        response: { kind: "text", content: responseForFeedback },
        feedback: fb,
        durationSeconds,
        createdAt: startedAtRef.current,
        endedAt,
      })
    } catch (e) { console.warn("saveTask failed:", e) }

    setPhase("done")
  }, [parsed, selections, rawStimulus])

  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`
  const timeUrgent = seconds <= 60
  const allAnswered = parsed ? selections.every(s => s !== null) : false
  const segments = parsed ? splitPassage(parsed.passage) : []

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Fill in the Blanks (Listening)</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteListening')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Fill in the Blanks</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.fill-in-the-blanks-listening.desc')}
          </p>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8">
              {t('practiceTask.fill-in-the-blanks-listening.idleDesc')}
            </p>
            <button
              onClick={generate}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {t('practiceTask.fill-in-the-blanks-listening.getPassage')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.fill-in-the-blanks-listening.generating')}</p>
          </div>
        )}

        {phase === "ready" && audioUrl && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
              {t('practiceTask.common.passageReady')}
            </p>
            <button
              onClick={playPassage}
              className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 mb-4"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              {t('practiceTask.common.playPassage')}
            </button>
            <p className="text-xs text-[var(--text-muted)]">
              {t('practiceTask.fill-in-the-blanks-listening.afterPassage')}
            </p>
          </div>
        )}

        {(phase === "listening" || phase === "answering") && parsed && (
          <div className="space-y-5">
            {phase === "listening" && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {[0, 1, 2, 3, 4].map(i => (
                    <span
                      key={i}
                      className="inline-block w-1 rounded-full bg-emerald-500"
                      style={{
                        height: `${16 + (i % 3) * 8}px`,
                        animation: `pulse 0.8s ease-in-out ${i * 0.12}s infinite alternate`,
                      }}
                    />
                  ))}
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 ml-2">{t('practiceTask.common.passagePlaying')}</p>
                </div>
                <p className="text-xs text-[var(--text-muted)]">{t('practiceTask.fill-in-the-blanks-listening.listenTimer')}</p>
                <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
              </div>
            )}
            {phase === "answering" && (
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('practiceTask.fill-in-the-blanks-listening.selectWords')}</p>
                <span className={`text-sm font-mono font-semibold tabular-nums ${timeUrgent ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]"}`}>
                  {timeStr}
                </span>
              </div>
            )}
            <div className="border border-[var(--border)] bg-[var(--surface)] p-6 leading-9 text-sm text-[var(--foreground)]">
              {segments.map((seg, i) => {
                if (seg.type === "text") return <span key={i}>{seg.value}</span>
                const blankIdx = parseInt(seg.value, 10)
                const blank = parsed.blanks[blankIdx]
                return (
                  <select
                    key={i}
                    value={selections[blankIdx] ?? ""}
                    onChange={e => {
                      const newSel = [...selections]
                      newSel[blankIdx] = e.target.value || null
                      setSelections(newSel)
                    }}
                    className="mx-1 inline-block rounded border border-emerald-400 bg-[var(--surface)] px-2 py-0.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">— choose —</option>
                    {blank.options.map((opt, oi) => (
                      <option key={oi} value={opt}>{opt}</option>
                    ))}
                  </select>
                )
              })}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <p className="text-xs text-slate-400">
                  {selections.filter(Boolean).length} / {parsed.blanks.length} answered
                </p>
                {audioUrl && (
                  <button
                    onClick={playPassage}
                    className="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 underline"
                  >
                    {t('practiceTask.highlight-correct-summary.replayPassage')}
                  </button>
                )}
              </div>
              {phase === "answering" && (
                <button
                  onClick={handleSubmit}
                  disabled={!allAnswered}
                  className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
                >
                  {t('practiceTask.common.submitAnswers')}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.fill-in-the-blanks-listening.evaluating')}</p>
          </div>
        )}

        {phase === "done" && feedback && parsed && (
          <div className="space-y-6">
            <TaskFeedbackDisplay
              feedback={feedback}
              stimulus={buildStimulusForFeedback(parsed)}
              stimulusLabel={t('practiceTask.fill-in-the-blanks-listening.passageWithAnswers')}
              responseText={buildResponseForFeedback(parsed, selections)}
              responseLabel={t('practiceTask.fill-in-the-blanks-listening.yourAnswers')}
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
