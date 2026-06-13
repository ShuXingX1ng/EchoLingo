"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import MicrophoneMonitor from "@/components/MicrophoneMonitor"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { saveTask } from "@/lib/unified-task-history"
import { blobToWav } from "@/lib/wav-encoder"
import { getStimulusFromBank, addStimulusToBank } from "@/lib/task-bank"
import { parsePracticeModeFromUrl, buildStimulusExtras } from "@/lib/practice-mode"
import { apiPost, apiPostBlob, apiPostForm } from "@/lib/api-client"
import type { TaskFeedback, PronunciationAssessmentResult } from "@/types"
import { useTranslation } from "@/lib/i18n"

const RECORD_TIME = 15
const MIN_REC_SECONDS = 5

type Phase = "idle" | "generating" | "ready" | "recording" | "processing" | "done" | "error"

function CountdownRing({ seconds, total, size = 64 }: { seconds: number; total: number; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (seconds / total)
  const urgent = seconds <= 5
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={urgent ? "stroke-red-500" : "stroke-emerald-500"}
          style={{ transition: "stroke-dasharray 0.9s linear" }} />
      </svg>
      <span className={`absolute text-lg font-bold tabular-nums ${urgent ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]"}`}>{seconds}</span>
    </div>
  )
}

export default function RepeatSentencePage() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("idle")
  const [sentence, setSentence] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [error, setError] = useState("")
  const [recSec, setRecSec] = useState(RECORD_TIME)
  const [transcript, setTranscript] = useState("")

  const startedAtRef = useRef("")
  const sentenceRef = useRef("")
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null)
  const txRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const generate = useCallback(async () => {
    setPhase("generating")
    setError(""); setFeedback(null); setTranscript("")
    txRef.current = ""
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    try {
      const { mode, topic } = parsePracticeModeFromUrl(window.location.search)
      const extras = buildStimulusExtras(mode, topic)
      const isSeeded = mode !== "random"
      let text: string
      const cached = isSeeded ? null : getStimulusFromBank("repeat_sentence")
      if (cached) {
        text = cached
      } else {
        const stimData = await apiPost<{ text: string }>("/api/pte/stimulus", { taskType: "repeat_sentence", ...extras })
        text = stimData.text
        if (!isSeeded) addStimulusToBank("repeat_sentence", text)
      }
      setSentence(text)
      sentenceRef.current = text

      // TTS synthesis
      const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.9 })
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setRecSec(RECORD_TIME)
      setPhase("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : t('practiceTask.repeat-sentence.errorGenerate'))
      setPhase("error")
    }
  }, [audioUrl, t])

  const playAudio = useCallback(() => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.play().catch(() => { /* ignore autoplay policy */ })
  }, [audioUrl])

  const startRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase("recording")
    startedAtRef.current = new Date().toISOString()
    chunksRef.current = []
    txRef.current = ""
    setRecSec(RECORD_TIME)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mrRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(250)
    } catch {
      setError(t('practiceTask.common.micDeniedShort'))
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
      rec.onerror = () => { /* ignore */ }
      srRef.current = rec
      try { rec.start() } catch { /* ignore */ }
    }

    timerRef.current = setInterval(() => {
      setRecSec(s => {
        if (s <= 1) { clearInterval(timerRef.current!); stopRecording(); return 0 }
        return s - 1
      })
    }, 1000)
  }, [t]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    srRef.current?.stop(); srRef.current = null
    const mr = mrRef.current
    if (!mr || mr.state === "inactive") { processAudio(new Blob([], { type: "audio/webm" })); return }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" })
      streamRef.current?.getTracks().forEach(t => t.stop())
      processAudio(blob)
    }
    mr.stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const processAudio = useCallback(async (blob: Blob) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000)
    const tx = txRef.current.trim() || "[transcript not captured]"
    setTranscript(tx)

    let wavBlob: Blob | null = null
    if (blob.size > 0) { try { wavBlob = await blobToWav(blob) } catch { /* optional */ } }

    const azurePromise: Promise<PronunciationAssessmentResult | null> = wavBlob
      ? (async () => {
          try {
            const form = new FormData()
            form.append("audio", wavBlob!, "recording.wav")
            form.append("referenceText", sentenceRef.current)
            return await apiPostForm<PronunciationAssessmentResult>("/api/pronunciation", form)
          } catch { return null }
        })()
      : Promise.resolve(null)

    const feedbackPromise: Promise<TaskFeedback | null> = (async () => {
      try {
        return await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "repeat_sentence", stimulus: sentenceRef.current, response: tx })
      } catch { return null }
    })()

    const [pronunciationResult, feedbackResult] = await Promise.all([azurePromise, feedbackPromise])

    const fb: TaskFeedback = feedbackResult ?? { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    if (pronunciationResult) {
      fb.pronunciationAssessment = pronunciationResult
      if (tx === "[transcript not captured]" && pronunciationResult.words.length > 0) {
        setTranscript(pronunciationResult.words.map(w => w.word).join(" "))
      }
    }

    setFeedback(fb)
    setPhase("done")

    saveTask({
      taskType: "repeat_sentence",
      stimulus: { kind: "audio", content: sentenceRef.current },
      response: { kind: "audio", content: tx },
      feedback: fb,
      durationSeconds,
      createdAt: startedAtRef.current,
      endedAt,
    }).catch(e => console.warn("saveTask failed:", e))
  }, [])

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Link href="/practice" className="hover:text-[var(--foreground)]">{t('nav.practice')}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium">Repeat Sentence</span>
        </div>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">{t('practiceTask.common.pteSpeaking')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Repeat Sentence</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('practiceTask.repeat-sentence.desc', { recordTime: String(RECORD_TIME) })}
          </p>
          <div className="mt-3">
            <MicrophoneMonitor />
          </div>
        </div>

        {phase === "idle" && (
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              {t('practiceTask.repeat-sentence.idleDesc')}
            </p>
            <button onClick={generate} className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {t('practiceTask.repeat-sentence.generateSentence')}
            </button>
          </div>
        )}

        {phase === "generating" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.repeat-sentence.generating')}</p>
          </div>
        )}

        {phase === "ready" && audioUrl && (
          <div className="space-y-6">
            <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center shadow-[6px_6px_0_rgba(15,23,42,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">{t('practiceTask.repeat-sentence.listenFirst')}</p>
              <button onClick={playAudio}
                className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 mb-6">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
                {t('practiceTask.repeat-sentence.playSentence')}
              </button>
              <p className="text-xs text-slate-400 mb-6">{t('practiceTask.repeat-sentence.playThenRecord')}</p>
              <button onClick={startRecording}
                className="rounded-xl border-2 border-emerald-500 px-8 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                {t('practiceTask.repeat-sentence.recordMyAnswer')}
              </button>
            </div>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-6">
            <div className="border-2 border-red-400 bg-[var(--surface)] p-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">{t('practiceTask.repeat-sentence.recordingRepeat')}</p>
              </div>
              <CountdownRing seconds={recSec} total={RECORD_TIME} size={80} />
            </div>
            <div className="text-center">
              <button onClick={stopRecording}
                disabled={recSec > RECORD_TIME - MIN_REC_SECONDS}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent">
                {recSec > RECORD_TIME - MIN_REC_SECONDS
                  ? t('practiceTask.common.holdOn', { sec: String(recSec - (RECORD_TIME - MIN_REC_SECONDS)) })
                  : t('practiceTask.common.stopRecording')}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">{t('practiceTask.repeat-sentence.analyzing')}</p>
          </div>
        )}

        {phase === "done" && feedback && (
          <div className="space-y-6">
            <TaskFeedbackDisplay feedback={feedback} stimulus={sentence} stimulusLabel={t('practiceTask.repeat-sentence.originalSentence')}
              responseText={transcript !== "[transcript not captured]" ? transcript : undefined} responseLabel={t('practiceTask.repeat-sentence.yourRepetition')} />
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
            <button onClick={generate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">{t('practiceTask.common.tryAgain')}</button>
          </div>
        )}
      </main>
    </div>
  )
}
