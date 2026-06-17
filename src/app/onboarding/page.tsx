"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import { apiPost, apiPostBlob, apiRequest } from "@/lib/api-client"

// ─── Shared types ─────────────────────────────────────────────────────────────

interface StimulusItem {
  task_type: string
  label: string
  section: string
  instruction: string
  stimulus: string
  time_limit: number
}

interface SectionScores {
  speaking: number | null
  writing: number | null
  reading: number | null
  listening: number | null
}

interface WeaknessProfile {
  section_scores: SectionScores
  weakest_section: string
  key_weaknesses: string[]
  summary: string
}

interface DayPlan {
  day: number
  tasks: string[]
  focus: string
}

interface LearningPlan {
  recommended_first_task: string
  first_week: DayPlan[]
  study_tips: string[]
}

interface OnboardingResult {
  weaknessProfile: WeaknessProfile
  learningPlan: LearningPlan
}

// ─── FIB Listening helpers (reused from fill-in-the-blanks-listening/page.tsx) ─

type BlankDef = { options: string[]; correct: number }
type FIBParsed = { passage: string; blanks: BlankDef[] }

function parseFIBStimulus(raw: string): FIBParsed | null {
  try {
    const p = JSON.parse(raw) as { passage?: unknown; blanks?: unknown }
    if (typeof p.passage !== "string" || !Array.isArray(p.blanks)) return null
    return p as FIBParsed
  } catch { return null }
}

function splitPassage(passage: string): Array<{ type: "text" | "blank"; value: string }> {
  return passage.split(/(\[BLANK_\d+\])/).map((p) => {
    const m = p.match(/^\[BLANK_(\d+)\]$/)
    return m ? { type: "blank" as const, value: m[1] } : { type: "text" as const, value: p }
  })
}

function fibResponse(parsed: FIBParsed, selections: (string | null)[]): string {
  return parsed.blanks
    .map((b, i) => {
      const sel = selections[i] ?? "(no answer)"
      const ok = sel === b.options[b.correct]
      return `Blank ${i + 1}: selected "${sel}" (correct: "${b.options[b.correct]}") ${ok ? "✓" : "✗"}`
    })
    .join("\n")
}

function fibStimulus(parsed: FIBParsed): string {
  let p = parsed.passage
  parsed.blanks.forEach((b, i) => { p = p.replace(`[BLANK_${i}]`, `[${b.options[b.correct]}]`) })
  return `Passage:\n${p}\n\nCorrect: ${parsed.blanks.map((b, i) => `Blank ${i + 1}: "${b.options[b.correct]}"`).join(", ")}`
}

// ─── Multiple Choice helpers (reused from multiple-choice/page.tsx) ───────────

type MCParsed = { passage: string; question: string; options: string[]; correct: number }

function parseMCStimulus(raw: string): MCParsed | null {
  try {
    const p = JSON.parse(raw) as { passage?: unknown; question?: unknown; options?: unknown; correct?: unknown }
    if (typeof p.passage !== "string" || typeof p.question !== "string" ||
      !Array.isArray(p.options) || typeof p.correct !== "number") return null
    return p as MCParsed
  } catch { return null }
}

function mcResponse(p: MCParsed, selected: number): string {
  const ok = selected === p.correct
  return ok
    ? `Selected: ${p.options[selected]} ✓ (correct)`
    : `Selected: ${p.options[selected]} ✗ (incorrect — correct: ${p.options[p.correct]})`
}

// ─── Task slug → practice path ────────────────────────────────────────────────

const TASK_PATH: Record<string, string> = {
  read_aloud: "/practice/read-aloud",
  repeat_sentence: "/practice/repeat-sentence",
  answer_short_question: "/practice/answer-short-question",
  summarize_written_text: "/practice/summarize-written-text",
  write_essay: "/practice/write-essay",
  describe_image: "/practice/describe-image",
  re_tell_lecture: "/practice/re-tell-lecture",
  fill_in_the_blanks_reading: "/practice/fill-in-the-blanks",
  re_order_paragraphs: "/practice/re-order-paragraphs",
  multiple_choice_reading: "/practice/multiple-choice",
  summarize_spoken_text: "/practice/summarize-spoken-text",
  fill_in_the_blanks_listening: "/practice/fill-in-the-blanks-listening",
  highlight_correct_summary: "/practice/highlight-correct-summary",
  write_from_dictation: "/practice/write-from-dictation",
}

const SECTION_ZH: Record<string, string> = {
  speaking: "口语", writing: "写作", reading: "阅读", listening: "听力",
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-slate-800 animate-spin dark:border-slate-700 dark:border-t-white" />
    </div>
  )
}

function PrimaryBtn({ onClick, disabled, children }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
    >
      {children}
    </button>
  )
}

// ─── Panel 1: Read Aloud (Speaking) ──────────────────────────────────────────

function ReadAloudPanel({ item, onComplete }: {
  item: StimulusItem
  onComplete: (stimulus: string, response: string) => void
}) {
  const [phase, setPhase] = useState<"ready" | "recording" | "done">("ready")
  const [micError, setMicError] = useState("")
  const transcriptRef = useRef("")

  const { recSeconds, canStop, start, stop } = useRecordingSession({
    totalSeconds: item.time_limit,
    minSeconds: 3,
    onComplete: (_blob, transcript) => {
      transcriptRef.current = transcript
      setPhase("done")
    },
    onError: (msg) => {
      setPhase("ready")
      setMicError(msg)
    },
  })

  const handleStart = async () => {
    setPhase("recording")
    await start()
  }

  const handleStop = () => {
    stop()
  }

  const handleSubmit = () => {
    const resp = transcriptRef.current || "[no transcript captured]"
    onComplete(item.stimulus, resp)
  }

  return (
    <div className="space-y-5">
      <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_rgba(15,23,42,0.06)]">
        <p className="text-sm leading-relaxed text-[var(--foreground)]">{item.stimulus}</p>
      </div>

      {phase === "ready" && (
        <div className="text-center">
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Prepare, then press Record and read the passage aloud.
          </p>
          {micError && (
            <p className="mb-3 text-xs text-red-600 dark:text-red-400">{micError} — please allow microphone access and try again.</p>
          )}
          <PrimaryBtn onClick={handleStart}>● Record ({item.time_limit}s)</PrimaryBtn>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-mono font-medium tabular-nums text-[var(--foreground)]">
              {recSeconds}s remaining
            </span>
          </div>
          <PrimaryBtn onClick={handleStop} disabled={!canStop}>■ Stop</PrimaryBtn>
        </div>
      )}

      {phase === "done" && (
        <div className="space-y-3">
          <PrimaryBtn onClick={handleSubmit}>Submit →</PrimaryBtn>
        </div>
      )}
    </div>
  )
}

// ─── Panel 2: FIB Listening ───────────────────────────────────────────────────

function FIBListeningPanel({ item, onComplete }: {
  item: StimulusItem
  onComplete: (stimulus: string, response: string) => void
}) {
  const parsed = parseFIBStimulus(item.stimulus)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioPhase, setAudioPhase] = useState<"loading" | "ready" | "playing" | "answering">("loading")
  const [selections, setSelections] = useState<(string | null)[]>(
    parsed ? new Array(parsed.blanks.length).fill(null) : []
  )
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!parsed) return
    let ttsText = parsed.passage
    parsed.blanks.forEach((b, i) => {
      ttsText = ttsText.replace(`[BLANK_${i}]`, b.options[b.correct])
    })
    apiPostBlob("/api/tts", { text: ttsText, voice: "en-US-AriaNeural", rate: 0.85 }, { timeoutMs: 30000 })
      .then((blob) => {
        setAudioUrl(URL.createObjectURL(blob))
        setAudioPhase("ready")
      })
      .catch(() => setAudioPhase("answering")) // degrade: skip audio, go straight to answering
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    if (audioRef.current) audioRef.current.pause()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const playAudio = () => {
    if (!audioUrl) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.onended = () => setAudioPhase("answering")
    setAudioPhase("playing")
    audio.play().catch(() => setAudioPhase("answering"))
  }

  const handleSubmit = () => {
    if (!parsed) return
    onComplete(fibStimulus(parsed), fibResponse(parsed, selections))
  }

  if (!parsed) {
    return <p className="text-sm text-red-500">Invalid stimulus format.</p>
  }

  const segments = splitPassage(parsed.passage)
  const allAnswered = selections.every(s => s !== null)

  return (
    <div className="space-y-5">
      {audioPhase === "loading" && <Spinner />}

      {audioPhase === "ready" && (
        <div className="text-center">
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Press play to hear the passage, then fill in the blanks.
          </p>
          <PrimaryBtn onClick={playAudio}>▶ Play Passage</PrimaryBtn>
        </div>
      )}

      {(audioPhase === "playing" || audioPhase === "answering") && (
        <div className="space-y-4">
          {audioPhase === "playing" && (
            <div className="flex items-center gap-2 py-2">
              {[0,1,2,3,4].map(i => (
                <span key={i} className="inline-block w-1 rounded-full bg-emerald-500"
                  style={{ height: `${16 + (i % 3) * 8}px`, animation: `pulse 0.8s ease-in-out ${i * 0.12}s infinite alternate` }} />
              ))}
              <span className="ml-2 text-sm text-emerald-700 dark:text-emerald-400">Playing… listen and fill in the blanks below</span>
              <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
            </div>
          )}
          <div className="border border-[var(--border)] bg-[var(--surface)] p-5 leading-9 text-sm text-[var(--foreground)]">
            {segments.map((seg, i) => {
              if (seg.type === "text") return <span key={i}>{seg.value}</span>
              const idx = parseInt(seg.value, 10)
              return (
                <select key={i} value={selections[idx] ?? ""}
                  onChange={e => {
                    const next = [...selections]
                    next[idx] = e.target.value || null
                    setSelections(next)
                  }}
                  className="mx-1 inline-block rounded border border-emerald-400 bg-[var(--surface)] px-2 py-0.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">— choose —</option>
                  {parsed.blanks[idx].options.map((opt, oi) => (
                    <option key={oi} value={opt}>{opt}</option>
                  ))}
                </select>
              )
            })}
          </div>
          <div className="flex items-center justify-between">
            {audioUrl && audioPhase === "answering" && (
              <button onClick={playAudio}
                className="text-xs text-emerald-600 underline hover:text-emerald-800 dark:text-emerald-400">
                Replay
              </button>
            )}
            <PrimaryBtn onClick={handleSubmit} disabled={!allAnswered || audioPhase === "playing"}>Submit →</PrimaryBtn>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Panel 3: Summarize Written Text (Writing) ────────────────────────────────

function SummarizePanel({ item, onComplete }: {
  item: StimulusItem
  onComplete: (stimulus: string, response: string) => void
}) {
  const [text, setText] = useState("")
  const [timer, setTimer] = useState(item.time_limit)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimer(t => { if (t <= 1) { clearInterval(timerRef.current!); return 0 } return t - 1 })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const mins = Math.floor(timer / 60)
  const secs = timer % 60

  return (
    <div className="space-y-4">
      <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[4px_4px_0_rgba(15,23,42,0.06)]">
        <p className="text-sm leading-relaxed text-[var(--foreground)]">{item.stimulus}</p>
      </div>
      <div className="flex justify-between text-xs text-[var(--text-secondary)]">
        <span className={timer > 0 && timer <= 15 ? "text-red-600 dark:text-red-400 font-mono font-medium" : "font-mono"}>
          {timer > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : "Time's up"}
        </span>
        <span>{text.trim().split(/\s+/).filter(Boolean).length} words</span>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Write your one-sentence summary here…"
        rows={4}
        className="w-full resize-none border border-[var(--border-strong)] bg-[var(--surface)] p-4 text-sm text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-slate-400"
      />
      <PrimaryBtn onClick={() => onComplete(item.stimulus, text.trim())} disabled={!text.trim()}>
        Submit →
      </PrimaryBtn>
    </div>
  )
}

// ─── Panel 4: Multiple Choice Reading ────────────────────────────────────────

function MultipleChoicePanel({ item, onComplete }: {
  item: StimulusItem
  onComplete: (stimulus: string, response: string) => void
}) {
  const parsed = parseMCStimulus(item.stimulus)
  const [selected, setSelected] = useState<number | null>(null)

  if (!parsed) return <p className="text-sm text-red-500">Invalid stimulus format.</p>

  const mcStimulusStr = `Passage:\n${parsed.passage}\n\nQuestion: ${parsed.question}\n\nOptions:\n${parsed.options.map((o, i) => `${o}${i === parsed.correct ? " ✓" : ""}`).join("\n")}`

  return (
    <div className="space-y-4">
      <div className="border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[4px_4px_0_rgba(15,23,42,0.06)]">
        <p className="text-sm leading-relaxed text-[var(--foreground)]">{parsed.passage}</p>
      </div>
      <p className="text-sm font-medium text-[var(--foreground)]">{parsed.question}</p>
      <div className="space-y-2">
        {parsed.options.map((opt, i) => (
          <button key={i} onClick={() => setSelected(i)}
            className={`w-full rounded border p-3 text-left text-sm transition-colors ${
              selected === i
                ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-slate-400"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      <PrimaryBtn
        onClick={() => selected !== null && onComplete(mcStimulusStr, mcResponse(parsed, selected))}
        disabled={selected === null}
      >
        Submit →
      </PrimaryBtn>
    </div>
  )
}

// ─── Results section ──────────────────────────────────────────────────────────

function Results({ result, onRetry }: { result: OnboardingResult; onRetry: () => void }) {
  const { weaknessProfile: wp, learningPlan: plan } = result
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
        测评完成
      </p>
      <h1 className="mt-2 font-['DM_Serif_Display'] text-3xl font-normal text-[var(--foreground)] sm:text-4xl">
        你的英语能力诊断
      </h1>
      {wp?.summary && (
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">{wp.summary}</p>
      )}

      {/* Section scores */}
      {wp?.section_scores && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.entries(wp.section_scores) as [string, number | null][]).map(([sec, score]) => (
            <div key={sec}
              className={`border p-4 text-center ${wp.weakest_section === sec ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-[var(--border)] bg-[var(--surface)]"}`}
            >
              <p className="text-xs text-[var(--text-secondary)]">{SECTION_ZH[sec] ?? sec}</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{score ?? "—"}</p>
              {wp.weakest_section === sec && (
                <p className="mt-1 text-[10px] font-medium text-red-600 dark:text-red-400">重点提升</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Key weaknesses */}
      {wp?.key_weaknesses?.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">主要弱项</p>
          <ul className="mt-2 space-y-1">
            {wp.key_weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended first task */}
      {plan?.recommended_first_task && (
        <div className="mt-8 border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            推荐从这里开始
          </p>
          <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
            {plan.recommended_first_task.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </p>
          <Link
            href={TASK_PATH[plan.recommended_first_task] ?? "/practice"}
            className="mt-4 inline-block rounded-xl bg-slate-950 px-8 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            开始练习 →
          </Link>
        </div>
      )}

      {/* Study tips */}
      {plan?.study_tips?.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">学习建议</p>
          <ul className="mt-3 space-y-2">
            {plan.study_tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-3 rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--foreground)]">
                <span className="flex-shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900">
                  {i + 1}
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* First week plan */}
      {plan?.first_week?.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">第一周计划</p>
          <div className="mt-3 space-y-3">
            {plan.first_week.map((day) => (
              <div key={day.day} className="border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-xs font-bold text-[var(--foreground)]">
                    D{day.day}
                  </span>
                  <p className="text-sm font-medium text-[var(--foreground)]">{day.focus}</p>
                </div>
                <div className="ml-10 mt-2 flex flex-wrap gap-1.5">
                  {day.tasks.map((slug) => (
                    <Link key={slug} href={TASK_PATH[slug] ?? "/practice"}
                      className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)] hover:border-slate-400 hover:text-[var(--foreground)]">
                      {slug.replace(/_/g, " ")}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 flex gap-3">
        <Link href="/practice"
          className="rounded-xl border border-[var(--border-strong)] px-6 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface)]">
          去练习广场
        </Link>
        <button onClick={onRetry} className="text-sm text-[var(--text-secondary)] underline hover:text-[var(--foreground)]">
          重新测评
        </button>
      </div>
    </div>
  )
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

type MainStep = "welcome" | "loading-stimuli" | "task" | "analyzing" | "results"

export default function OnboardingPage() {
  const [step, setStep] = useState<MainStep>("welcome")
  const [stimuli, setStimuli] = useState<StimulusItem[]>([])
  const [taskIndex, setTaskIndex] = useState(0)
  const responsesRef = useRef<Array<{ task_type: string; stimulus: string; response: string }>>([])
  const [result, setResult] = useState<OnboardingResult | null>(null)
  const [error, setError] = useState("")

  const handleStart = async () => {
    setStep("loading-stimuli")
    setError("")
    responsesRef.current = []
    try {
      const data = await apiRequest<{ stimuli: StimulusItem[] }>("/api/onboarding/stimuli", { timeoutMs: 60000 })
      setStimuli(data.stimuli)
      setTaskIndex(0)
      setStep("task")
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败，请重试")
      setStep("welcome")
    }
  }

  const handleTaskComplete = useCallback(async (stimulus: string, response: string) => {
    const current = stimuli[taskIndex]
    responsesRef.current = [
      ...responsesRef.current,
      { task_type: current.task_type, stimulus, response },
    ]
    const next = taskIndex + 1
    if (next < stimuli.length) {
      setTaskIndex(next)
    } else {
      setStep("analyzing")
      try {
        const res = await apiPost<OnboardingResult>(
          "/api/onboarding/evaluate",
          { tasks: responsesRef.current },
          { timeoutMs: 120000 }
        )
        setResult(res)
        localStorage.setItem("echolingo_onboarding_done", "1")
        setStep("results")
      } catch (e) {
        setError(e instanceof Error ? e.message : "分析失败，请重试")
        setStep("welcome")
      }
    }
  }, [stimuli, taskIndex])

  const handleRetry = () => {
    setStep("welcome")
    setResult(null)
    setError("")
  }

  const currentTask = stimuli[taskIndex]

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav active="practice" maxWidth="4xl" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">

        {/* Welcome */}
        {(step === "welcome" || step === "loading-stimuli") && (
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">EchoLingo</p>
            <h1 className="mt-3 font-['DM_Serif_Display'] text-4xl font-normal text-[var(--foreground)] sm:text-5xl">
              快速水平测评
            </h1>
            <p className="mt-4 text-base text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              完成 4 道题（口语、听力、写作、阅读各一题），AI 分析你的能力并生成个性化第一周学习计划。
            </p>
            <div className="mt-6 flex justify-center flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
              {["🎤 口语朗读", "🎧 听力填空", "✍️ 写作概括", "📖 阅读选择"].map(tag => (
                <span key={tag} className="rounded-full border border-[var(--border)] px-3 py-1">{tag}</span>
              ))}
            </div>
            {error && <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <PrimaryBtn onClick={handleStart} disabled={step === "loading-stimuli"}>
              {step === "loading-stimuli" ? "加载题目中…" : "开始测评"}
            </PrimaryBtn>
            <p className="mt-4 text-xs text-[var(--text-secondary)]">
              已有进度？<Link href="/practice" className="underline hover:text-[var(--foreground)]">直接去练习</Link>
            </p>
          </div>
        )}

        {/* Task */}
        {step === "task" && currentTask && (
          <div>
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span>测评</span><span>/</span>
                <span className="font-medium text-[var(--foreground)]">
                  第 {taskIndex + 1} 题 / 共 {stimuli.length} 题
                </span>
              </div>
              <div className="flex gap-1.5">
                {stimuli.map((_, i) => (
                  <div key={i} className={`h-2 w-2 rounded-full ${i < taskIndex ? "bg-emerald-500" : i === taskIndex ? "bg-slate-900 dark:bg-white" : "bg-[var(--border)]"}`} />
                ))}
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
              {currentTask.section}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{currentTask.label}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] mb-6">{currentTask.instruction}</p>

            {currentTask.task_type === "read_aloud" && (
              <ReadAloudPanel key={taskIndex} item={currentTask} onComplete={handleTaskComplete} />
            )}
            {currentTask.task_type === "fill_in_the_blanks_listening" && (
              <FIBListeningPanel key={taskIndex} item={currentTask} onComplete={handleTaskComplete} />
            )}
            {currentTask.task_type === "summarize_written_text" && (
              <SummarizePanel key={taskIndex} item={currentTask} onComplete={handleTaskComplete} />
            )}
            {currentTask.task_type === "multiple_choice_reading" && (
              <MultipleChoicePanel key={taskIndex} item={currentTask} onComplete={handleTaskComplete} />
            )}
          </div>
        )}

        {/* Analyzing */}
        {step === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
            <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-slate-800 animate-spin dark:border-slate-700 dark:border-t-white" />
            <div>
              <p className="text-lg font-semibold text-[var(--foreground)]">AI 正在分析你的回答</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">4 道题并行评分 → 诊断弱项 → 生成学习计划</p>
            </div>
          </div>
        )}

        {/* Results */}
        {step === "results" && result && (
          <Results result={result} onRetry={handleRetry} />
        )}

      </main>
    </div>
  )
}
