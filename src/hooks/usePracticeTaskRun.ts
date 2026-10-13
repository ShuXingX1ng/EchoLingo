"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import { apiPost, apiPostForm } from "@/lib/api-client"
import { getRandomImage, type ImageStimulus } from "@/lib/image-bank"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { isValidStructuredStimulus, spokenStimulusText } from "@/lib/structured-stimulus"
import { TASK_TYPE_REGISTRY, dimensionEntries } from "@/lib/task-type-registry"
import { synthesizeStimulus } from "@/lib/tts"
import { getTasksByType, saveTask } from "@/lib/unified-task-history"
import { blobToWav } from "@/lib/wav-encoder"
import type {
  PracticeTask,
  SpokenFeedbackResponse,
  PteTaskType,
  TaskFeedback,
  TaskStimulus,
} from "@/types"

// The Practice Task run: one attempt at a Task Type, from loading the Stimulus
// to the saved Practice Task. Every Task Type goes through the same stages —
//
//   generating → [ready → listening] → [prep] → recording | writing
//              → processing → done
//
// — and which stages apply comes from the Task Type catalogue: a spoken
// Stimulus adds ready/listening, a speaking Task Type records (after an
// optional prep countdown), every other Task Type takes a written or selected
// Response against an optional time limit. Task Practice pages and Mock Exam
// screens only render the phase they are given.

export type RunPhase =
  | "idle"
  | "generating"
  /** A spoken Stimulus is loaded and waiting for the learner to play it. */
  | "ready"
  /** The spoken Stimulus is playing. */
  | "listening"
  /** Countdown before recording starts. */
  | "prep"
  | "recording"
  /** A written or selected Response is in progress. */
  | "writing"
  | "processing"
  | "done"
  | "error"

export interface Submission {
  /** What the feedback request is told the learner answered; also what is saved. */
  feedbackResponse: string
  /** Replaces the Stimulus text sent with the feedback request. */
  feedbackStimulus?: string
}

export interface PracticeTaskRunOptions {
  /** A Mock Exam uses the catalogue's mock-only time limit where one exists. */
  mode?: "practice" | "mock"
  /**
   * For Responses the page owns (dropdowns, ordering, a selected option):
   * builds the submission from the page's current state. Called on a manual
   * submit and when the time limit runs out. Return null when there is
   * nothing to submit yet.
   */
  buildSubmission?: () => Submission | null
  /**
   * A Stimulus that is already loaded, used instead of asking for one. The
   * onboarding diagnostic gets all of its Stimuli in a single request.
   */
  stimulus?: string
  /**
   * The Stimulus can be answered from what is on screen, so a failed speech
   * synthesis skips the audio instead of ending the run in an error.
   */
  audioOptional?: boolean
  /** Replaces the catalogue's time limit: the recording length for a speaking Task Type. */
  timeLimitSeconds?: number
  /**
   * Hands the Response to the caller instead of requesting Feedback and saving
   * a Practice Task. The run still ends in "done". Used where Responses are
   * evaluated together afterwards.
   */
  onResponse?: (collected: CollectedResponse) => void
}

export interface CollectedResponse {
  /** The Stimulus as a feedback request would be given it. */
  stimulus: string
  response: string
}

export interface PracticeTaskRun {
  phase: RunPhase
  /** Stimulus content: text, raw JSON for structured Task Types, or an image URL. */
  stimulus: string
  /** The image, for an image Stimulus. */
  image: ImageStimulus | null
  /** The expected answer, when the Stimulus carries one (Answer Short Question). */
  answer: string
  /** Remaining seconds of the current prep or writing countdown. */
  seconds: number
  /** The countdown lengths this run uses, for progress rings. */
  timer: { prepSeconds: number; recordSeconds: number; minRecSeconds: number; taskSeconds?: number }
  error: string
  feedback: TaskFeedback | null
  /** The Practice Task once phase is "done": a local copy at first, then the stored one. */
  savedTask: PracticeTask | null
  userText: string
  setText: (value: string) => void
  /** Best available transcript of the recorded Response. */
  transcript: string
  recSeconds: number
  canStop: boolean
  stopRecording: () => void
  /** Whether the spoken Stimulus has been played to the end at least once. */
  hasPlayed: boolean
  /** Play the spoken Stimulus; the run moves on by itself when it ends. */
  play: () => void
  /** Play the spoken Stimulus without leaving the current phase. */
  previewStimulus: () => void
  /** Skip what is left of the wait and start recording now. */
  startNow: () => void
  /** Submit a written or selected Response. No-op when there is nothing to submit. */
  submit: () => Promise<void>
  /** Load a new Stimulus and start over. */
  generate: () => Promise<void>
  /** The Practice Task to record when this task is skipped (Mock Exam). */
  emptyTask: () => PracticeTask
}

const PERSONAL_INTRO_PROMPT =
  "Please introduce yourself. Tell us about your background, studies or work, " +
  "your English learning experience, and your goals. Speak naturally and clearly."

const NO_RESPONSE = "(no response)"

// Task Types whose spoken Stimulus starts playing as soon as it is loaded. The
// question is also on screen, so these can go on without the audio.
const AUTO_PLAY = new Set<PteTaskType>(["answer_short_question"])

interface LoadedStimulus {
  /** Shown to the learner and saved with the Practice Task. */
  content: string
  /** Sent with the feedback request when it differs from `content`. */
  feedbackStimulus?: string
  /** Read out before the learner responds. */
  spokenText?: string
  image?: ImageStimulus
  answer?: string
}

async function loadStimulus(
  taskType: PteTaskType,
  previousImageUrl?: string,
  supplied?: string,
): Promise<LoadedStimulus> {
  const meta = TASK_TYPE_REGISTRY[taskType]

  if (meta.stimulusFormat === "none") return { content: PERSONAL_INTRO_PROMPT }

  if (meta.stimulusFormat === "image") {
    const image = getRandomImage(previousImageUrl)
    return {
      content: image.url,
      image,
      feedbackStimulus: `Image type: ${image.topic}\n\nImage content: ${image.description}`,
    }
  }

  const raw = supplied ?? await loadStimulusText({
    taskType,
    timeoutMs: meta.stimulusFormat === "json" ? 60000 : 45000,
  })
  if (meta.stimulusFormat === "json" && !isValidStructuredStimulus(taskType, raw)) {
    throw new Error("Invalid stimulus format from server")
  }

  if (taskType === "answer_short_question") {
    // "<question>\n<expected answer>": only the question is shown and spoken.
    const [firstLine, secondLine] = raw.split("\n")
    const question = firstLine?.trim() || raw
    const answer = secondLine?.trim() ?? ""
    return {
      content: question,
      answer,
      spokenText: question,
      feedbackStimulus: `Question: ${question}\nCorrect answer: ${answer}`,
    }
  }

  return {
    content: raw,
    spokenText: meta.spokenStimulus ? spokenStimulusText(taskType, raw) : undefined,
  }
}

function stimulusKind(taskType: PteTaskType): TaskStimulus["kind"] {
  const meta = TASK_TYPE_REGISTRY[taskType]
  if (meta.stimulusFormat === "image") return "image"
  return meta.spokenStimulus ? "audio" : "text"
}

/** Mean recent score per dimension for this Task Type, sent to personalise feedback. */
async function computeHistoricalWeaknesses(taskType: PteTaskType): Promise<Record<string, number> | undefined> {
  try {
    const tasks = await getTasksByType(taskType)
    const sums: Record<string, number> = {}
    const counts: Record<string, number> = {}
    for (const task of tasks.slice(-15)) {
      const scores = task.feedback?.dimensionScores
      if (!scores) continue
      for (const [dimension, score] of dimensionEntries(scores)) {
        sums[dimension] = (sums[dimension] ?? 0) + score
        counts[dimension] = (counts[dimension] ?? 0) + 1
      }
    }
    const result: Record<string, number> = {}
    for (const [dimension, sum] of Object.entries(sums)) {
      result[dimension] = Math.round(sum / counts[dimension])
    }
    return Object.keys(result).length > 0 ? result : undefined
  } catch {
    return undefined
  }
}

const FEEDBACK_UNAVAILABLE: TaskFeedback = {
  summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [],
}

/**
 * Speech evaluation and Feedback for a recording, in one request: the backend
 * evaluates the audio first and scores what its provider recognised. Null
 * when the recording cannot be sent at all, so the caller can fall back to
 * Feedback on the browser's transcript.
 */
async function prepareSpokenFeedbackForm(
  audio: Blob,
  fields: Record<string, string>,
): Promise<FormData | null> {
  if (audio.size === 0) return null
  try {
    const wav = await blobToWav(audio)
    const form = new FormData()
    form.append("audio", wav, "recording.wav")
    for (const [name, value] of Object.entries(fields)) form.append(name, value)
    return form
  } catch {
    return null
  }
}

export function usePracticeTaskRun(
  taskType: PteTaskType,
  options: PracticeTaskRunOptions = {},
): PracticeTaskRun {
  const meta = TASK_TYPE_REGISTRY[taskType]
  const respondsByVoice = meta.category === "speaking"
  const prepSeconds = meta.timer.prepSeconds ?? 0
  const recordSeconds = (respondsByVoice ? options.timeLimitSeconds : undefined) ?? meta.timer.recordSeconds ?? 40
  const minRecSeconds = meta.timer.minRecSeconds ?? 0
  const taskSeconds =
    options.timeLimitSeconds
    ?? (options.mode === "mock" ? meta.timer.mockTaskSeconds : undefined)
    ?? meta.timer.taskSeconds
  const recordsEmptyResponse = options.mode === "mock"

  const [phase, setPhaseState] = useState<RunPhase>("idle")
  const [stimulus, setStimulus] = useState("")
  const [image, setImage] = useState<ImageStimulus | null>(null)
  const [answer, setAnswer] = useState("")
  const [seconds, setSeconds] = useState(respondsByVoice ? prepSeconds : (taskSeconds ?? 0))
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const [savedTask, setSavedTask] = useState<PracticeTask | null>(null)
  const [userText, setUserText] = useState("")
  const [transcript, setTranscript] = useState("")
  const [hasPlayed, setHasPlayed] = useState(false)

  const phaseRef = useRef<RunPhase>("idle")
  const loadedRef = useRef<LoadedStimulus>({ content: "" })
  const startedAtRef = useRef("")
  const userTextRef = useRef("")
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  // Incremented by every generate() and on unmount, so that work started for
  // an earlier Stimulus (or a dev-mode double mount) never touches this one.
  const runIdRef = useRef(0)
  const buildSubmissionRef = useRef(options.buildSubmission)
  const suppliedStimulusRef = useRef(options.stimulus)
  const audioOptionalRef = useRef(options.audioOptional)
  const onResponseRef = useRef(options.onResponse)
  useEffect(() => {
    buildSubmissionRef.current = options.buildSubmission
    suppliedStimulusRef.current = options.stimulus
    audioOptionalRef.current = options.audioOptional
    onResponseRef.current = options.onResponse
  })

  const setPhase = useCallback((next: RunPhase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  const setText = useCallback((value: string) => {
    userTextRef.current = value
    setUserText(value)
  }, [])

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = null
  }, [])

  const startCountdown = useCallback((from: number, onZero: () => void) => {
    stopCountdown()
    setSeconds(from)
    let remaining = from
    countdownRef.current = setInterval(() => {
      remaining -= 1
      setSeconds(remaining)
      if (remaining <= 0) {
        stopCountdown()
        onZero()
      }
    }, 1000)
  }, [stopCountdown])

  const stopAudio = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.onended = null
    audioRef.current.onerror = null
    audioRef.current.pause()
    audioRef.current = null
  }, [])

  const releaseAudio = useCallback(() => {
    stopAudio()
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = null
  }, [stopAudio])

  // ── Feedback and saving ────────────────────────────────────────────────────

  const complete = useCallback(async (input: {
    runId: number
    responseKind: "audio" | "text"
    /** Saved as the Response. */
    storedResponse: string
    /** Sent to the feedback request as the Response. */
    feedbackResponse: string
    feedbackStimulus?: string
    startedAt: string
    /** The recording, for Task Types whose spoken Response is evaluated by a provider. */
    audio?: Blob
    /** The Stimulus this Response answers; the run may have moved on since. */
    loaded: LoadedStimulus
  }) => {
    const loaded = input.loaded
    const isCurrent = () => input.runId === runIdRef.current
    const collect = onResponseRef.current
    if (collect) {
      if (!isCurrent()) return
      setPhase("done")
      collect({
        stimulus: input.feedbackStimulus ?? loaded.feedbackStimulus ?? loaded.content,
        response: input.feedbackResponse.trim() || NO_RESPONSE,
      })
      return
    }
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(input.startedAt).getTime()) / 1000
    )

    const historicalWeaknesses = await computeHistoricalWeaknesses(taskType)
    const feedbackStimulus = input.feedbackStimulus ?? loaded.feedbackStimulus ?? loaded.content
    let result: TaskFeedback | null = null
    const spokenForm = input.audio
      ? await prepareSpokenFeedbackForm(input.audio, {
          taskType,
          stimulus: feedbackStimulus,
          transcript: input.feedbackResponse,
          ...(historicalWeaknesses ? { historicalWeaknesses: JSON.stringify(historicalWeaknesses) } : {}),
        })
      : null
    try {
      if (spokenForm) {
        const spoken = await apiPostForm<SpokenFeedbackResponse>(
          "/api/pte/spoken-feedback", spokenForm, { timeoutMs: 105000 },
        )
        // The provider's recognised text is more reliable than the browser's.
        if (isCurrent() && spoken.transcript) setTranscript(spoken.transcript)
        result = spoken.feedback
          ?? (spoken.speechEvaluation
            ? { ...FEEDBACK_UNAVAILABLE, speechEvaluation: spoken.speechEvaluation }
            : null)
      } else {
        result = await apiPost<TaskFeedback>("/api/pte/feedback", {
          taskType,
          stimulus: feedbackStimulus,
          response: input.feedbackResponse,
          ...(historicalWeaknesses ? { historicalWeaknesses } : {}),
        }, { timeoutMs: 90000 })
      }
    } catch { /* feedback is best-effort; the Practice Task is still saved */ }

    const fb: TaskFeedback = result ?? { ...FEEDBACK_UNAVAILABLE }

    const taskInput = {
      taskType,
      stimulus: { kind: stimulusKind(taskType), content: loaded.content },
      response: { kind: input.responseKind, content: input.storedResponse },
      feedback: fb,
      durationSeconds,
      createdAt: input.startedAt,
      endedAt,
    }
    // A submitted attempt is saved even if the learner has left the page or
    // started another one while the Feedback was on its way; only the screen
    // updates are skipped then.
    const current = isCurrent()
    if (current) {
      setFeedback(fb)
      setSavedTask({ id: `local_${Date.now()}`, ...taskInput })
      setPhase("done")
    }

    saveTask(taskInput)
      .then((task) => { if (isCurrent()) setSavedTask(task) })
      .catch((e) => console.warn("saveTask failed:", e))
  }, [taskType, setPhase])

  // ── Recorded Response ──────────────────────────────────────────────────────

  const processRecording = useCallback(async (audio: Blob, spoken: string, startedAt: string) => {
    const runId = runIdRef.current
    const loaded = loadedRef.current
    setPhase("processing")
    setTranscript(spoken)

    await complete({
      runId,
      responseKind: "audio",
      storedResponse: spoken,
      feedbackResponse: spoken,
      startedAt,
      audio: meta.pronunciationAssessment ? audio : undefined,
      loaded,
    })
  }, [meta.pronunciationAssessment, complete, setPhase])

  const recording = useRecordingSession({
    totalSeconds: recordSeconds,
    minSeconds: minRecSeconds,
    onComplete: processRecording,
    onError: (message) => { setError(message); setPhase("error") },
  })
  const startRecorder = recording.start

  const beginRecording = useCallback(() => {
    stopCountdown()
    stopAudio()
    setPhase("recording")
    void startRecorder()
  }, [stopCountdown, stopAudio, setPhase, startRecorder])

  // ── Written or selected Response ───────────────────────────────────────────

  const submitResponse = useCallback(async (timedOut: boolean) => {
    if (phaseRef.current !== "writing") return
    const built = buildSubmissionRef.current ? buildSubmissionRef.current() : null
    let feedbackResponse = (built?.feedbackResponse ?? userTextRef.current).trim()
    if (!feedbackResponse) {
      // Running out of time with nothing answered counts as an empty Response
      // where the attempt is part of a sequence. In Task Practice it is not
      // recorded: the learner may simply have walked away from the page.
      if (!timedOut || !(recordsEmptyResponse || onResponseRef.current)) return
      feedbackResponse = NO_RESPONSE
    }
    stopCountdown()
    setPhase("processing")
    await complete({
      runId: runIdRef.current,
      responseKind: "text",
      storedResponse: feedbackResponse,
      feedbackResponse,
      feedbackStimulus: built?.feedbackStimulus,
      startedAt: startedAtRef.current,
      loaded: loadedRef.current,
    })
  }, [complete, stopCountdown, setPhase, recordsEmptyResponse])

  const submit = useCallback(() => submitResponse(false), [submitResponse])

  // ── Moving from the Stimulus to the Response ───────────────────────────────

  const beginResponse = useCallback(() => {
    if (respondsByVoice) {
      if (prepSeconds > 0) {
        setPhase("prep")
        startCountdown(prepSeconds, beginRecording)
      } else {
        beginRecording()
      }
      return
    }
    startedAtRef.current = new Date().toISOString()
    setPhase("writing")
    if (taskSeconds) startCountdown(taskSeconds, () => { void submitResponse(true) })
  }, [respondsByVoice, prepSeconds, taskSeconds, setPhase, startCountdown, beginRecording, submitResponse])

  const playAudio = useCallback((onFinished: () => void, onRefused: () => void) => {
    const url = audioUrlRef.current
    if (!url) return false
    stopAudio()
    const runId = runIdRef.current
    const audio = new Audio(url)
    audioRef.current = audio
    let finished = false
    const settle = () => {
      // Not this audio's turn any more: it was stopped or replaced by the run.
      if (finished || runId !== runIdRef.current || audioRef.current !== audio) return false
      finished = true
      audioRef.current = null
      return true
    }
    // Ending and failing to load both move on: a learner must never be
    // stranded on a Stimulus that cannot play.
    const finish = () => {
      if (!settle()) return
      setHasPlayed(true)
      onFinished()
    }
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch((e: unknown) => {
      // The browser declined to start playback (no user gesture yet). The
      // Stimulus has not been heard, so this is not the same as it ending.
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        if (settle()) onRefused()
        return
      }
      finish()
    })
    return true
  }, [stopAudio])

  const play = useCallback(() => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "generating") return
    if (!audioUrlRef.current) return
    setPhase("listening")
    // Refused playback: carry on where the question is on screen anyway,
    // otherwise wait for the learner to press play.
    playAudio(beginResponse, AUTO_PLAY.has(taskType) ? beginResponse : () => setPhase("ready"))
  }, [taskType, playAudio, beginResponse, setPhase])

  const previewStimulus = useCallback(() => {
    playAudio(() => {}, () => {})
  }, [playAudio])

  const startNow = useCallback(() => {
    if (!respondsByVoice) return
    const current = phaseRef.current
    if (current !== "ready" && current !== "listening" && current !== "prep") return
    beginRecording()
  }, [respondsByVoice, beginRecording])

  // ── Loading a Stimulus ─────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    const runId = ++runIdRef.current
    stopCountdown()
    releaseAudio()
    setError("")
    setFeedback(null)
    setSavedTask(null)
    setText("")
    setTranscript("")
    setHasPlayed(false)
    setSeconds(respondsByVoice ? prepSeconds : (taskSeconds ?? 0))
    setPhase("generating")

    try {
      const loaded = await loadStimulus(taskType, loadedRef.current.image?.url, suppliedStimulusRef.current)
      if (runId !== runIdRef.current) return
      loadedRef.current = loaded
      setStimulus(loaded.content)
      setImage(loaded.image ?? null)
      setAnswer(loaded.answer ?? "")

      if (loaded.spokenText === undefined) {
        beginResponse()
        return
      }

      let speech: Blob
      try {
        speech = await synthesizeStimulus(loaded.spokenText, meta.speechRate)
      } catch (e) {
        if (runId !== runIdRef.current) return
        if (!(AUTO_PLAY.has(taskType) || audioOptionalRef.current)) throw e
        beginResponse()
        return
      }
      if (runId !== runIdRef.current) return
      audioUrlRef.current = URL.createObjectURL(speech)
      if (AUTO_PLAY.has(taskType)) {
        play()
      } else {
        setPhase("ready")
      }
    } catch (e) {
      if (runId !== runIdRef.current) return
      setError(e instanceof Error ? e.message : "Failed to generate stimulus")
      setPhase("error")
    }
  }, [
    taskType, meta.speechRate, respondsByVoice, prepSeconds, taskSeconds,
    stopCountdown, releaseAudio, setText, setPhase, beginResponse, play,
  ])

  useEffect(() => {
    void generate()
    return () => {
      runIdRef.current += 1
      stopCountdown()
      releaseAudio()
    }
    // Runs once per mount; `generate` is stable for a given Task Type and mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emptyTask = useCallback((): PracticeTask => ({
    id: `mock_${Date.now()}`,
    taskType,
    stimulus: { kind: stimulusKind(taskType), content: loadedRef.current.content },
    response: { kind: respondsByVoice ? "audio" : "text", content: "" },
    durationSeconds: 0,
    createdAt: new Date().toISOString(),
  }), [taskType, respondsByVoice])

  return {
    phase,
    stimulus,
    image,
    answer,
    seconds,
    timer: { prepSeconds, recordSeconds, minRecSeconds, taskSeconds },
    error,
    feedback,
    savedTask,
    userText,
    setText,
    transcript,
    recSeconds: recording.recSeconds,
    canStop: recording.canStop,
    stopRecording: recording.stop,
    hasPlayed,
    play,
    previewStimulus,
    startNow,
    submit,
    generate,
    emptyTask,
  }
}
