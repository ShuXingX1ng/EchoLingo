import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { apiPost, apiPostForm } from "@/lib/api-client"
import { blobToWav } from "@/lib/wav-encoder"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { synthesizeStimulus } from "@/lib/tts"
import { getTasksByType, saveTask } from "@/lib/unified-task-history"
import type { PracticeTask, TaskFeedback } from "@/types"
import { usePracticeTaskRun, type PracticeTaskRunOptions } from "./usePracticeTaskRun"

vi.mock("@/lib/stimulus-loader", () => ({ loadStimulusText: vi.fn() }))
vi.mock("@/lib/api-client", () => ({ apiPost: vi.fn(), apiPostForm: vi.fn() }))
vi.mock("@/lib/tts", () => ({ synthesizeStimulus: vi.fn() }))
vi.mock("@/lib/unified-task-history", () => ({ saveTask: vi.fn(), getTasksByType: vi.fn() }))
vi.mock("@/lib/wav-encoder", () => ({ blobToWav: vi.fn(async (blob: Blob) => blob) }))

// The recorder is replaced by a stand-in the tests drive directly: `start`
// records that recording began, and `finish` plays the part of the recording
// ending with a given browser transcript.
const recorder = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  options: null as null | {
    totalSeconds: number
    minSeconds?: number
    onComplete: (audio: Blob, transcript: string, startedAt: string) => void
    onError?: (message: string) => void
  },
}))
vi.mock("@/hooks/useRecordingSession", () => ({
  useRecordingSession: (options: NonNullable<typeof recorder.options>) => {
    recorder.options = options
    return { recSeconds: options.totalSeconds, canStop: true, start: recorder.start, stop: recorder.stop }
  },
}))

class FakeAudio {
  static instances: FakeAudio[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  pause = vi.fn()
  static playResult: () => Promise<void> = () => Promise.resolve()
  play = vi.fn(() => FakeAudio.playResult())
  constructor(public src: string) {
    FakeAudio.instances.push(this)
  }
}

const FEEDBACK: TaskFeedback = {
  summary: "Good attempt.",
  strengths: ["clear"],
  weaknesses: [],
  suggestions: [],
}

const mocked = {
  loadStimulusText: vi.mocked(loadStimulusText),
  apiPost: vi.mocked(apiPost),
  apiPostForm: vi.mocked(apiPostForm),
  synthesizeStimulus: vi.mocked(synthesizeStimulus),
  saveTask: vi.mocked(saveTask),
  getTasksByType: vi.mocked(getTasksByType),
}

async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

async function advance(seconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(seconds * 1000) })
}

async function startRun(taskType: Parameters<typeof usePracticeTaskRun>[0], options?: PracticeTaskRunOptions) {
  const hook = renderHook(() => usePracticeTaskRun(taskType, options))
  await flush()
  return hook
}

async function endAudio() {
  const audio = FakeAudio.instances.at(-1)!
  await act(async () => { audio.onended?.() })
  await flush()
}

async function finishRecording(transcript: string) {
  await act(async () => {
    recorder.options!.onComplete(new Blob(["audio"]), transcript, new Date().toISOString())
  })
  await flush()
}

function feedbackRequest() {
  const call = mocked.apiPost.mock.calls.find(([path]) => path === "/api/pte/feedback")
  expect(call, "no feedback request was sent").toBeDefined()
  return { body: call![1] as Record<string, unknown>, options: call![2] }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  FakeAudio.instances = []
  FakeAudio.playResult = () => Promise.resolve()
  vi.stubGlobal("Audio", FakeAudio)
  URL.createObjectURL = vi.fn(() => "blob:stimulus")
  URL.revokeObjectURL = vi.fn()

  vi.clearAllMocks()
  mocked.loadStimulusText.mockResolvedValue("A passage about cities.")
  mocked.synthesizeStimulus.mockResolvedValue(new Blob(["speech"]))
  mocked.apiPost.mockResolvedValue({ ...FEEDBACK })
  mocked.apiPostForm.mockResolvedValue({ transcript: "", feedback: { ...FEEDBACK }, speechEvaluation: null })
  mocked.getTasksByType.mockResolvedValue([])
  mocked.saveTask.mockImplementation(async (task) => ({ id: "stored-1", ...task }) as PracticeTask)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("written Response to a text Stimulus (Write Essay)", () => {
  it("loads the Stimulus and starts the catalogue time limit", async () => {
    const { result } = await startRun("write_essay")

    expect(mocked.loadStimulusText).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: "write_essay" })
    )
    expect(result.current.phase).toBe("writing")
    expect(result.current.stimulus).toBe("A passage about cities.")
    expect(result.current.seconds).toBe(1200)

    await advance(10)
    expect(result.current.seconds).toBe(1190)
  })

  it("sends the Response for feedback and saves the Practice Task", async () => {
    const { result } = await startRun("write_essay")
    await advance(30)

    act(() => result.current.setText("  Cities are growing.  "))
    await act(async () => { await result.current.submit() })
    await flush()

    const { body, options } = feedbackRequest()
    expect(body).toEqual({
      taskType: "write_essay",
      stimulus: "A passage about cities.",
      response: "Cities are growing.",
    })
    expect(options).toEqual({ timeoutMs: 90000 })

    expect(result.current.phase).toBe("done")
    expect(result.current.feedback?.summary).toBe("Good attempt.")
    expect(mocked.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: "write_essay",
        stimulus: { kind: "text", content: "A passage about cities." },
        response: { kind: "text", content: "Cities are growing." },
        durationSeconds: 30,
      })
    )
    expect(result.current.savedTask?.id).toBe("stored-1")
  })

  it("ignores a manual submit with nothing written and keeps the clock running", async () => {
    const { result } = await startRun("write_essay")

    await act(async () => { await result.current.submit() })
    await advance(5)

    expect(result.current.phase).toBe("writing")
    expect(result.current.seconds).toBe(1195)
    expect(mocked.apiPost).not.toHaveBeenCalled()
  })

  it("submits what is written when the time limit runs out", async () => {
    const { result } = await startRun("write_essay")
    act(() => result.current.setText("Half an essay"))

    await advance(1200)
    await flush()

    expect(feedbackRequest().body.response).toBe("Half an essay")
    expect(result.current.phase).toBe("done")
  })

  it("does not record an unanswered Task Practice attempt when time runs out", async () => {
    const { result } = await startRun("write_essay")

    await advance(1200)
    await flush()

    expect(mocked.apiPost).not.toHaveBeenCalled()
    expect(mocked.saveTask).not.toHaveBeenCalled()
    expect(result.current.phase).toBe("writing")
  })

  it("records an empty Response when time runs out in a Mock Exam", async () => {
    const { result } = await startRun("write_essay", { mode: "mock" })

    await advance(1200)
    await flush()

    expect(feedbackRequest().body.response).toBe("(no response)")
    expect(result.current.phase).toBe("done")
  })

  it("saves the Practice Task even when the learner leaves before the Feedback arrives", async () => {
    let deliver!: (feedback: TaskFeedback) => void
    mocked.apiPost.mockReturnValue(new Promise((resolve) => { deliver = resolve }))
    const { result, unmount } = await startRun("write_essay")

    act(() => result.current.setText("Technology helps."))
    act(() => { void result.current.submit() })
    await flush()
    unmount()
    await act(async () => { deliver({ ...FEEDBACK }) })
    await flush()

    expect(mocked.saveTask).toHaveBeenCalledWith(expect.objectContaining({
      taskType: "write_essay",
      response: { kind: "text", content: "Technology helps." },
    }))
  })

  it("still saves the Practice Task when the feedback request fails", async () => {
    mocked.apiPost.mockRejectedValue(new Error("502"))
    const { result } = await startRun("write_essay")
    act(() => result.current.setText("An essay"))

    await act(async () => { await result.current.submit() })
    await flush()

    expect(result.current.phase).toBe("done")
    expect(result.current.feedback?.summary).toBe("Feedback unavailable.")
    expect(mocked.saveTask).toHaveBeenCalled()
  })

  it("sends recent dimension averages for this Task Type with the feedback request", async () => {
    mocked.getTasksByType.mockResolvedValue([
      { feedback: { dimensionScores: { section: "writing", grammar: 60, vocabulary: 70, form: 80, content: 90 } } },
      { feedback: { dimensionScores: { section: "writing", grammar: 80, vocabulary: 70, form: 60, content: 50 } } },
      { feedback: { summary: "no scores" } },
    ] as unknown as PracticeTask[])
    const { result } = await startRun("write_essay")
    act(() => result.current.setText("An essay"))

    await act(async () => { await result.current.submit() })
    await flush()

    expect(feedbackRequest().body.historicalWeaknesses).toEqual({
      grammar: 70, vocabulary: 70, form: 70, content: 70,
    })
  })
})

describe("selected Response to a structured Stimulus (Fill in the Blanks, Reading)", () => {
  const RAW = JSON.stringify({ passage: "A [BLANK_0].", blanks: [{ options: ["cat", "dog"], correct: 0 }] })

  it("submits what the page builds and stores the raw Stimulus", async () => {
    mocked.loadStimulusText.mockResolvedValue(RAW)
    const buildSubmission = vi.fn(() => ({
      feedbackStimulus: "Passage (with correct answers):\nA [cat].",
      feedbackResponse: 'Blank 1: selected "cat" (correct: "cat") ✓',
    }))
    const { result } = await startRun("fill_in_the_blanks_reading", { buildSubmission })

    expect(result.current.phase).toBe("writing")
    expect(result.current.seconds).toBe(420)

    await act(async () => { await result.current.submit() })
    await flush()

    expect(feedbackRequest().body).toMatchObject({
      stimulus: "Passage (with correct answers):\nA [cat].",
      response: 'Blank 1: selected "cat" (correct: "cat") ✓',
    })
    expect(mocked.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        stimulus: { kind: "text", content: RAW },
        response: { kind: "text", content: 'Blank 1: selected "cat" (correct: "cat") ✓' },
      })
    )
  })

  it("asks the page for the submission again when the time limit runs out", async () => {
    mocked.loadStimulusText.mockResolvedValue(RAW)
    let selection = "(no answer)"
    const buildSubmission = () => ({ feedbackResponse: `Blank 1: selected "${selection}"` })
    await startRun("fill_in_the_blanks_reading", { buildSubmission })

    selection = "dog"
    await advance(420)
    await flush()

    expect(feedbackRequest().body.response).toBe('Blank 1: selected "dog"')
  })
})

describe("written Response to a spoken Stimulus (Write from Dictation)", () => {
  it("synthesizes the Stimulus and waits for the learner to play it", async () => {
    mocked.loadStimulusText.mockResolvedValue("The library closes at nine.")
    const { result } = await startRun("write_from_dictation")

    expect(mocked.synthesizeStimulus).toHaveBeenCalledWith("The library closes at nine.", undefined)
    expect(result.current.phase).toBe("ready")
    expect(result.current.hasPlayed).toBe(false)
  })

  it("moves from listening to writing when the audio ends, untimed in Task Practice", async () => {
    const { result } = await startRun("write_from_dictation")

    act(() => result.current.play())
    expect(result.current.phase).toBe("listening")
    expect(FakeAudio.instances.at(-1)!.play).toHaveBeenCalled()

    await endAudio()
    expect(result.current.phase).toBe("writing")
    expect(result.current.hasPlayed).toBe(true)

    await advance(600)
    expect(result.current.phase).toBe("writing")
  })

  it("saves the Stimulus as audio and measures time from the end of playback", async () => {
    mocked.loadStimulusText.mockResolvedValue("The library closes at nine.")
    const { result } = await startRun("write_from_dictation")
    await advance(20)
    act(() => result.current.play())
    await endAudio()
    await advance(12)

    act(() => result.current.setText("The library closes at nine"))
    await act(async () => { await result.current.submit() })
    await flush()

    expect(mocked.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        stimulus: { kind: "audio", content: "The library closes at nine." },
        durationSeconds: 12,
      })
    )
  })

  it("is limited to the catalogue's mock-only time in a Mock Exam", async () => {
    const { result } = await startRun("write_from_dictation", { mode: "mock" })
    act(() => result.current.play())
    await endAudio()

    expect(result.current.seconds).toBe(180)
    act(() => result.current.setText("partial"))
    await advance(180)
    await flush()

    expect(feedbackRequest().body.response).toBe("partial")
  })

  it("moves on when the audio cannot be played", async () => {
    const { result } = await startRun("write_from_dictation")
    act(() => result.current.play())

    await act(async () => { FakeAudio.instances.at(-1)!.onerror?.() })
    await flush()

    expect(result.current.phase).toBe("writing")
  })

  it("waits for the learner when the browser refuses to start playback", async () => {
    const { result } = await startRun("write_from_dictation")
    FakeAudio.playResult = () => Promise.reject(new DOMException("blocked", "NotAllowedError"))

    act(() => result.current.play())
    await flush()

    expect(result.current.phase).toBe("ready")
    expect(result.current.hasPlayed).toBe(false)
  })
})

describe("structured spoken Stimulus (Highlight Correct Summary)", () => {
  it("reads out the passage, not the JSON", async () => {
    mocked.loadStimulusText.mockResolvedValue(
      JSON.stringify({ passage: "Energy matters.", summaries: ["a", "b", "c", "d", "e"], correct: 0 })
    )
    const { result } = await startRun("highlight_correct_summary")

    expect(mocked.synthesizeStimulus).toHaveBeenCalledWith("Energy matters.", undefined)
    expect(result.current.phase).toBe("ready")
  })

  it("reports a malformed Stimulus as an error the learner can retry", async () => {
    mocked.loadStimulusText.mockResolvedValueOnce("not json")
    const { result } = await startRun("highlight_correct_summary")

    expect(result.current.phase).toBe("error")
    expect(result.current.error).toMatch(/invalid stimulus format/i)

    mocked.loadStimulusText.mockResolvedValue(
      JSON.stringify({ passage: "Energy matters.", summaries: ["a", "b", "c", "d", "e"], correct: 0 })
    )
    await act(async () => { await result.current.generate() })
    await flush()
    expect(result.current.phase).toBe("ready")
    expect(result.current.error).toBe("")
  })
})

describe("recorded Response (Read Aloud)", () => {
  it("counts down the preparation time, then starts recording", async () => {
    const { result } = await startRun("read_aloud")

    expect(result.current.phase).toBe("prep")
    expect(result.current.seconds).toBe(35)
    expect(result.current.timer).toMatchObject({ prepSeconds: 35, recordSeconds: 40, minRecSeconds: 5 })
    expect(recorder.options).toMatchObject({ totalSeconds: 40, minSeconds: 5 })

    await advance(34)
    expect(recorder.start).not.toHaveBeenCalled()
    await advance(1)
    expect(result.current.phase).toBe("recording")
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it("lets the learner start recording before the preparation time is up", async () => {
    const { result } = await startRun("read_aloud")

    act(() => result.current.startNow())
    expect(result.current.phase).toBe("recording")

    await advance(60)
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it("sends the recording for evaluation and Feedback in one request", async () => {
    const speechEvaluation = { provider: "azure", overallScore: 80, pronunciation: 78, oralFluency: 82, content: 90 }
    mocked.apiPostForm.mockResolvedValue({
      transcript: "a passage about cities",
      feedback: { ...FEEDBACK, speechEvaluation },
      speechEvaluation,
    })
    const { result } = await startRun("read_aloud")
    act(() => result.current.startNow())

    await finishRecording("a package about cities")

    expect(mocked.apiPostForm).toHaveBeenCalledTimes(1)
    const [path, form] = mocked.apiPostForm.mock.calls[0]
    expect(path).toBe("/api/pte/spoken-feedback")
    expect((form as FormData).get("taskType")).toBe("read_aloud")
    expect((form as FormData).get("stimulus")).toBe("A passage about cities.")
    expect((form as FormData).get("transcript")).toBe("a package about cities")
    expect((form as FormData).get("audio")).toBeInstanceOf(Blob)
    // No separate feedback request: the backend scores what its provider recognised.
    expect(mocked.apiPost).not.toHaveBeenCalled()

    expect(result.current.transcript).toBe("a passage about cities")
    expect(result.current.feedback?.speechEvaluation).toEqual(speechEvaluation)
    expect(mocked.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({ response: { kind: "audio", content: "a package about cities" } })
    )
  })

  it("keeps the Speech Evaluation Result when Feedback could not be generated", async () => {
    const speechEvaluation = { provider: "azure", overallScore: 80, pronunciation: 78, oralFluency: 82, content: 90 }
    mocked.apiPostForm.mockResolvedValue({ transcript: "a passage", feedback: null, speechEvaluation })
    const { result } = await startRun("read_aloud")
    act(() => result.current.startNow())

    await finishRecording("a passage about cities")

    expect(result.current.feedback?.summary).toBe("Feedback unavailable.")
    expect(result.current.feedback?.speechEvaluation).toEqual(speechEvaluation)
  })

  it("saves the Practice Task without Feedback when the spoken request fails", async () => {
    mocked.apiPostForm.mockRejectedValue(new Error("backend down"))
    const { result } = await startRun("read_aloud")
    act(() => result.current.startNow())

    await finishRecording("a passage about cities")

    expect(result.current.feedback?.summary).toBe("Feedback unavailable.")
    expect(result.current.feedback?.speechEvaluation).toBeUndefined()
    expect(result.current.phase).toBe("done")
    expect(mocked.saveTask).toHaveBeenCalledTimes(1)
  })

  it("asks for Feedback on the browser transcript when the recording cannot be encoded", async () => {
    vi.mocked(blobToWav).mockRejectedValueOnce(new Error("decode failed"))
    const { result } = await startRun("read_aloud")
    act(() => result.current.startNow())

    await finishRecording("a passage about cities")

    expect(mocked.apiPostForm).not.toHaveBeenCalled()
    expect(feedbackRequest().body.response).toBe("a passage about cities")
    expect(result.current.phase).toBe("done")
  })

  it("reports a refused microphone as an error", async () => {
    const { result } = await startRun("read_aloud")

    act(() => recorder.options!.onError!("Microphone access denied."))

    expect(result.current.phase).toBe("error")
    expect(result.current.error).toBe("Microphone access denied.")
  })
})

describe("spoken Stimulus with a recorded Response", () => {
  it("Repeat Sentence: records as soon as the sentence ends, with no preparation time", async () => {
    mocked.loadStimulusText.mockResolvedValue("The lecture starts at ten.")
    const { result } = await startRun("repeat_sentence")

    expect(mocked.synthesizeStimulus).toHaveBeenCalledWith("The lecture starts at ten.", 0.9)
    expect(result.current.phase).toBe("ready")

    act(() => result.current.play())
    await endAudio()

    expect(result.current.phase).toBe("recording")
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it("Repeat Sentence: can be previewed and then recorded on the learner's cue", async () => {
    const { result } = await startRun("repeat_sentence")

    act(() => result.current.previewStimulus())
    await endAudio()
    expect(result.current.phase).toBe("ready")
    expect(result.current.hasPlayed).toBe(true)

    act(() => result.current.startNow())
    expect(result.current.phase).toBe("recording")
  })

  it("Re-tell Lecture: listening, then preparation, then recording", async () => {
    const { result } = await startRun("re_tell_lecture")
    act(() => result.current.play())
    await endAudio()

    expect(result.current.phase).toBe("prep")
    expect(result.current.seconds).toBe(10)
    await advance(10)
    expect(result.current.phase).toBe("recording")
  })

  it("Answer Short Question: speaks only the question, straight away, and keeps the answer for feedback", async () => {
    mocked.loadStimulusText.mockResolvedValue("What do bees make?\nhoney")
    const { result } = await startRun("answer_short_question")

    expect(mocked.synthesizeStimulus).toHaveBeenCalledWith("What do bees make?", 0.9)
    expect(result.current.phase).toBe("listening")
    expect(result.current.stimulus).toBe("What do bees make?")
    expect(result.current.answer).toBe("honey")

    await endAudio()
    expect(result.current.phase).toBe("prep")
    await advance(3)
    expect(result.current.phase).toBe("recording")

    await finishRecording("honey")
    expect(feedbackRequest().body).toMatchObject({
      stimulus: "Question: What do bees make?\nCorrect answer: honey",
      response: "honey",
    })
    expect(mocked.apiPostForm).not.toHaveBeenCalled()
  })
})

describe("Stimuli that are not generated text", () => {
  it("Describe Image: shows an image and describes it to the feedback request", async () => {
    const { result } = await startRun("describe_image")

    expect(mocked.loadStimulusText).not.toHaveBeenCalled()
    expect(result.current.image).not.toBeNull()
    expect(result.current.stimulus).toBe(result.current.image!.url)
    expect(result.current.phase).toBe("prep")

    act(() => result.current.startNow())
    await finishRecording("a bar chart")

    expect(feedbackRequest().body.stimulus).toBe(
      `Image type: ${result.current.image!.topic}\n\nImage content: ${result.current.image!.description}`
    )
    expect(mocked.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({ stimulus: { kind: "image", content: result.current.image!.url } })
    )
  })

  it("Personal Introduction: uses the fixed prompt without asking the backend for a Stimulus", async () => {
    const { result } = await startRun("personal_intro")

    expect(mocked.loadStimulusText).not.toHaveBeenCalled()
    expect(result.current.stimulus).toMatch(/introduce yourself/i)
    expect(result.current.phase).toBe("prep")
    expect(result.current.seconds).toBe(25)
  })
})

describe("starting over and skipping", () => {
  it("reports a Stimulus that fails to load, and recovers on the next attempt", async () => {
    mocked.loadStimulusText.mockRejectedValueOnce(new Error("Task Bank is empty"))
    const { result } = await startRun("write_essay")

    expect(result.current.phase).toBe("error")
    expect(result.current.error).toBe("Task Bank is empty")

    await act(async () => { await result.current.generate() })
    await flush()
    expect(result.current.phase).toBe("writing")
  })

  it("clears the previous attempt when a new Stimulus is generated", async () => {
    const { result } = await startRun("write_essay")
    act(() => result.current.setText("An essay"))
    await act(async () => { await result.current.submit() })
    await flush()
    expect(result.current.phase).toBe("done")

    mocked.loadStimulusText.mockResolvedValue("A second passage.")
    await act(async () => { await result.current.generate() })
    await flush()

    expect(result.current.stimulus).toBe("A second passage.")
    expect(result.current.userText).toBe("")
    expect(result.current.feedback).toBeNull()
    expect(result.current.savedTask).toBeNull()
    expect(result.current.seconds).toBe(1200)
  })

  it("stops its countdown when the page goes away", async () => {
    const { unmount } = await startRun("write_essay")
    unmount()

    await advance(1200)

    expect(mocked.apiPost).not.toHaveBeenCalled()
  })

  it("describes a skipped task as a Practice Task with an empty Response", async () => {
    mocked.loadStimulusText.mockResolvedValue("The library closes at nine.")
    const { result } = await startRun("write_from_dictation", { mode: "mock" })

    expect(result.current.emptyTask()).toMatchObject({
      taskType: "write_from_dictation",
      stimulus: { kind: "audio", content: "The library closes at nine." },
      response: { kind: "text", content: "" },
      durationSeconds: 0,
    })
  })
})

describe("collecting Responses for a later evaluation (onboarding diagnostic)", () => {
  it("uses the supplied Stimulus and time limit without asking the backend", async () => {
    const { result } = await startRun("summarize_written_text", {
      stimulus: "A supplied passage.", timeLimitSeconds: 60, onResponse: vi.fn(),
    })

    expect(mocked.loadStimulusText).not.toHaveBeenCalled()
    expect(result.current.stimulus).toBe("A supplied passage.")
    expect(result.current.phase).toBe("writing")
    expect(result.current.seconds).toBe(60)
  })

  it("hands over the Response instead of requesting Feedback or saving", async () => {
    const onResponse = vi.fn()
    const { result } = await startRun("summarize_written_text", { stimulus: "A supplied passage.", onResponse })

    act(() => result.current.setText("  Cities grow.  "))
    await act(async () => { await result.current.submit() })

    expect(onResponse).toHaveBeenCalledWith({ stimulus: "A supplied passage.", response: "Cities grow." })
    expect(result.current.phase).toBe("done")
    expect(mocked.apiPost).not.toHaveBeenCalled()
    expect(mocked.saveTask).not.toHaveBeenCalled()
  })

  it("hands over what the page builds for a structured Stimulus", async () => {
    const onResponse = vi.fn()
    const stimulus = JSON.stringify({
      passage: "P", question: "Q", options: ["A", "B", "C", "D", "E"], correct: 1,
    })
    const { result } = await startRun("multiple_choice_reading", {
      stimulus, onResponse,
      buildSubmission: () => ({ feedbackStimulus: "Passage and options", feedbackResponse: "Selected: B ✓ (correct)" }),
    })

    await act(async () => { await result.current.submit() })

    expect(onResponse).toHaveBeenCalledWith({ stimulus: "Passage and options", response: "Selected: B ✓ (correct)" })
  })

  it("hands over the browser transcript of a recording, limited to the given length, with no Pronunciation Assessment", async () => {
    const onResponse = vi.fn()
    const { result } = await startRun("read_aloud", { stimulus: "Read this.", timeLimitSeconds: 30, onResponse })

    expect(recorder.options!.totalSeconds).toBe(30)
    act(() => result.current.startNow())
    await finishRecording("read this")

    expect(onResponse).toHaveBeenCalledWith({ stimulus: "Read this.", response: "read this" })
    expect(mocked.apiPostForm).not.toHaveBeenCalled()
  })

  it("never hands over an empty Response", async () => {
    const onResponse = vi.fn()
    const { result } = await startRun("read_aloud", { stimulus: "Read this.", onResponse })

    act(() => result.current.startNow())
    await finishRecording("")

    expect(onResponse).toHaveBeenCalledWith({ stimulus: "Read this.", response: "(no response)" })
  })
})

describe("review regressions", () => {
  it("does not restart the run when a learner starts recording before playback has begun", async () => {
    mocked.loadStimulusText.mockResolvedValue("A lecture about rivers.")
    let rejectPlay!: (reason: unknown) => void
    FakeAudio.playResult = () => new Promise<void>((_, reject) => { rejectPlay = reject })
    const { result } = await startRun("re_tell_lecture")

    act(() => result.current.play())
    act(() => result.current.startNow())
    // Pausing an audio whose play() is still pending rejects it.
    await act(async () => { rejectPlay(new DOMException("interrupted", "AbortError")) })
    await flush()

    expect(result.current.phase).toBe("recording")
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it("Answer Short Question: goes on with the question on screen when speech synthesis fails", async () => {
    mocked.loadStimulusText.mockResolvedValue("What do bees make?\nHoney")
    mocked.synthesizeStimulus.mockRejectedValue(new Error("tts down"))
    const { result } = await startRun("answer_short_question")

    expect(result.current.phase).toBe("prep")
    expect(result.current.stimulus).toBe("What do bees make?")
  })

  it("skips the audio of an audio-optional Stimulus when speech synthesis fails", async () => {
    mocked.synthesizeStimulus.mockRejectedValue(new Error("tts down"))
    const stimulus = JSON.stringify({ passage: "A [BLANK_0].", blanks: [{ options: ["cat", "dog"], correct: 0 }] })
    const { result } = await startRun("fill_in_the_blanks_listening", {
      stimulus, audioOptional: true, onResponse: vi.fn(),
    })

    expect(result.current.phase).toBe("writing")
  })

  it("still reports a failed speech synthesis where the audio is the Stimulus", async () => {
    mocked.synthesizeStimulus.mockRejectedValue(new Error("tts down"))
    const { result } = await startRun("write_from_dictation")

    expect(result.current.phase).toBe("error")
  })

  it("reports a structured reading Stimulus of the wrong shape instead of showing an empty task", async () => {
    mocked.loadStimulusText.mockResolvedValue(JSON.stringify({ passage: "P", question: "Q", options: ["A"], correct: 0 }))
    const { result } = await startRun("multiple_choice_reading")

    expect(result.current.phase).toBe("error")
    expect(result.current.error).toMatch(/invalid stimulus/i)
  })
})
