"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost, apiPostForm } from "@/lib/api-client"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import { blobToWav } from "@/lib/wav-encoder"
import type { PteTaskType, TaskFeedback, PracticeTask, PronunciationAssessmentResult } from "@/types"

export type TaskPhase =
  | "idle"
  | "generating"
  | "writing"
  | "ready"
  | "recording"
  | "processing"
  | "done"
  | "error"

export interface PracticeTaskRunnerConfig {
  taskType: PteTaskType
  responseKind: "text" | "audio"
  /** Text-response pages: seconds until auto-submit. undefined = no countdown. */
  timeLimit?: number
  /** Audio-response pages: prep countdown before recording starts. 0 = start immediately. */
  prepTime?: number
  /** Total recording window in seconds (audio mode). */
  recordTime?: number
  /** Minimum seconds recorded before the user may stop early (audio mode). */
  minRecSeconds?: number
  /** Run Azure pronunciation assessment alongside the standard feedback call. */
  withPronunciation?: boolean
  /** Legacy stimulus endpoint for random mode (falls back to /api/pte/stimulus). */
  randomEndpoint?: string
  /** Stimulus kind stored in task history. Defaults to "text". */
  stimulusKind?: "text" | "audio" | "image"
  /** Feedback endpoint. Defaults to /api/pte/feedback. */
  feedbackEndpoint?: string
}

export interface PracticeTaskRunnerReturn {
  phase: TaskPhase
  stimulus: string
  /** Countdown seconds: prep/writing timer in text mode, prep timer in audio mode. */
  seconds: number
  error: string
  feedback: TaskFeedback | null
  // Text mode
  userText: string
  setText: (v: string) => void
  // Audio mode
  recSeconds: number
  canStop: boolean
  startRecording: () => Promise<void>
  stopRecording: () => void
  transcript: string
  /** The saved PracticeTask after submission succeeds (available when phase === "done"). */
  savedTask: PracticeTask | null
  // Actions
  /** Manually submit a text-mode response. No-op in audio mode (onComplete drives submission).
   *  Pass overrides to replace the stimulus/response sent to the feedback API (and stored in task
   *  history) — used by JSON-stimulus pages that build human-readable strings before submitting. */
  submit: (overrides?: { feedbackStimulus?: string; feedbackResponse?: string }) => Promise<void>
  /** Re-generate the stimulus and restart the task lifecycle. */
  generate: () => Promise<void>
}

export function usePracticeTaskRunner({
  taskType,
  responseKind,
  timeLimit,
  prepTime = 0,
  recordTime = 40,
  minRecSeconds = 0,
  withPronunciation = false,
  randomEndpoint,
  stimulusKind = "text",
  feedbackEndpoint = "/api/pte/feedback",
}: PracticeTaskRunnerConfig): PracticeTaskRunnerReturn {
  const [phase, setPhase] = useState<TaskPhase>("idle")
  const [stimulus, setStimulusState] = useState("")
  const [seconds, setSeconds] = useState(timeLimit ?? prepTime ?? 0)
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [savedTask, setSavedTask] = useState<PracticeTask | null>(null)
  const [userText, setUserText] = useState("")
  const [transcript, setTranscript] = useState("")

  const stimulusRef = useRef("")
  const startedAtRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submitRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
  }, [])

  // ── Audio mode: process completed recording ──────────────────────────────

  const processAudio = useCallback(async (audioBlob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    setTranscript(tx)
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )

    let wavBlob: Blob | null = null
    if (withPronunciation && audioBlob.size > 0) {
      try { wavBlob = await blobToWav(audioBlob) } catch {}
    }

    // Step 1: Azure pronunciation first (fast ~5-10s) so its recognized text
    // can be used as the LLM input instead of the less reliable Web Speech transcript.
    let pronunciationResult: PronunciationAssessmentResult | null = null
    if (wavBlob) {
      try {
        const form = new FormData()
        form.append("audio", wavBlob, "recording.wav")
        form.append("referenceText", stimulusRef.current)
        pronunciationResult = await apiPostForm<PronunciationAssessmentResult>("/api/pronunciation", form)
      } catch {}
    }

    const effectiveTranscript = pronunciationResult?.recognizedText || tx
    setTranscript(effectiveTranscript)

    // Step 2: LLM feedback with the best available transcript
    let feedbackResult: TaskFeedback | null = null
    try {
      feedbackResult = await apiPost<TaskFeedback>(feedbackEndpoint, {
        taskType,
        stimulus: stimulusRef.current,
        response: effectiveTranscript,
      }, { timeoutMs: 90000 })
    } catch {}

    const fb: TaskFeedback = feedbackResult ?? {
      summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [],
    }
    if (pronunciationResult) {
      fb.pronunciationAssessment = pronunciationResult
    }

    setFeedback(fb)

    const taskInput = {
      taskType,
      stimulus: { kind: stimulusKind, content: stimulusRef.current },
      response: { kind: "audio" as const, content: tx },
      feedback: fb,
      durationSeconds,
      createdAt: startedAt,
      endedAt,
    }
    const localTask: PracticeTask = { id: `local_${Date.now()}`, ...taskInput }
    setSavedTask(localTask)
    setPhase("done")

    saveTask(taskInput)
      .then(task => setSavedTask(task))
      .catch(e => console.warn("saveTask failed:", e))
  }, [taskType, feedbackEndpoint, stimulusKind, withPronunciation])

  // ── Unconditional hook call (React rules) ─────────────────────────────────

  const recording = useRecordingSession({
    totalSeconds: recordTime,
    minSeconds: minRecSeconds,
    onComplete: responseKind === "audio" ? processAudio : () => {},
    onError: msg => { setError(msg); setPhase("error") },
  })

  // ── Text mode: writing countdown ──────────────────────────────────────────

  useEffect(() => {
    if (responseKind !== "text" || phase !== "writing" || !timeLimit) return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); submitRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase, responseKind, timeLimit])

  // ── Audio mode: prep countdown → auto-start recording ────────────────────

  useEffect(() => {
    if (responseKind !== "audio" || phase !== "ready") return
    if (!prepTime) {
      recording.start()
      return
    }
    prepTimerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          clearInterval(prepTimerRef.current!)
          recording.start()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (prepTimerRef.current) clearInterval(prepTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, responseKind, prepTime])

  // ── Audio mode: sync phase with recording state ───────────────────────────

  useEffect(() => {
    if (responseKind === "audio" && phase === "ready" && recording.recSeconds < recordTime) {
      setPhase("recording")
    }
  }, [phase, responseKind, recording.recSeconds, recordTime])

  // ── Text mode: submit ─────────────────────────────────────────────────────

  const submit = useCallback(async (overrides?: { feedbackStimulus?: string; feedbackResponse?: string }) => {
    if (responseKind !== "text") return
    if (timerRef.current) clearInterval(timerRef.current)
    const effectiveStimulus = overrides?.feedbackStimulus ?? stimulusRef.current
    const effectiveResponse = overrides?.feedbackResponse ?? userText
    if (!effectiveResponse.trim()) return
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000
    )

    let result: TaskFeedback | null = null
    try {
      result = await apiPost<TaskFeedback>(feedbackEndpoint, {
        taskType,
        stimulus: effectiveStimulus,
        response: effectiveResponse,
      }, { timeoutMs: 90000 })
    } catch {}

    const fb: TaskFeedback = result ?? {
      summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [],
    }
    setFeedback(fb)

    const taskInput = {
      taskType,
      stimulus: { kind: stimulusKind, content: stimulusRef.current },
      response: { kind: "text" as const, content: effectiveResponse },
      feedback: fb,
      durationSeconds,
      createdAt: startedAtRef.current,
      endedAt,
    }
    const localTask: PracticeTask = { id: `local_${Date.now()}`, ...taskInput }
    setSavedTask(localTask)
    setPhase("done")

    saveTask(taskInput)
      .then(task => setSavedTask(task))
      .catch(e => console.warn("saveTask failed:", e))
  }, [responseKind, userText, taskType, feedbackEndpoint, stimulusKind])

  useEffect(() => { submitRef.current = submit }, [submit])

  // ── Generate stimulus ─────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    setPhase("generating")
    setError("")
    setFeedback(null)
    setSavedTask(null)
    setUserText("")
    setTranscript("")
    setSeconds(responseKind === "text" ? (timeLimit ?? 0) : (prepTime ?? 0))

    try {
      const text = await loadStimulusText({ taskType, randomEndpoint })
      stimulusRef.current = text
      setStimulusState(text)
      startedAtRef.current = new Date().toISOString()
      setPhase(responseKind === "text" ? "writing" : "ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate stimulus")
      setPhase("error")
    }
  }, [taskType, responseKind, timeLimit, prepTime, randomEndpoint])

  // Auto-generate on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generate() }, [])

  return {
    phase,
    stimulus,
    seconds,
    error,
    feedback,
    savedTask,
    userText,
    setText: setUserText,
    recSeconds: recording.recSeconds,
    canStop: recording.canStop,
    startRecording: recording.start,
    stopRecording: recording.stop,
    transcript,
    submit,
    generate,
  }
}
