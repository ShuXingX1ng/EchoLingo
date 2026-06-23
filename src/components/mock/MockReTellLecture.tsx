"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useTranslation } from "@/lib/i18n"
import { saveTask } from "@/lib/unified-task-history"
import { apiPost, apiPostBlob } from "@/lib/api-client"
import { loadStimulusText } from "@/lib/stimulus-loader"
import { useRecordingSession } from "@/hooks/useRecordingSession"
import type { PracticeTask, TaskFeedback } from "@/types"
import CountdownRing from "./CountdownRing"

const PREP_TIME = 10
const RECORD_TIME = 40

type Phase = "generating" | "ready" | "listening" | "prep" | "recording" | "processing" | "done" | "error"

export default function MockReTellLecture({ onComplete }: { onComplete: (task: PracticeTask) => void }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>("generating")
  const [lectureText, setLectureText] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [prepSec, setPrepSec] = useState(PREP_TIME)
  const [doneTask, setDoneTask] = useState<PracticeTask | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const processAudio = useCallback(async (_blob: Blob, tx: string, startedAt: string) => {
    setPhase("processing")
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )

    let fb: TaskFeedback
    try {
      fb = await apiPost<TaskFeedback>("/api/pte/feedback", { taskType: "re_tell_lecture", stimulus: lectureText, response: tx })
    } catch {
      fb = { summary: "Feedback unavailable.", strengths: [], weaknesses: [], suggestions: [] }
    }

    let task: PracticeTask
    try {
      task = await saveTask({
        taskType: "re_tell_lecture",
        stimulus: { kind: "audio", content: lectureText },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      })
    } catch {
      task = {
        id: `mock_${Date.now()}`,
        taskType: "re_tell_lecture",
        stimulus: { kind: "audio", content: lectureText },
        response: { kind: "audio", content: tx },
        feedback: fb,
        durationSeconds,
        createdAt: startedAt,
        endedAt,
      }
    }

    setDoneTask(task)
    setPhase("done")
  }, [lectureText])

  const recording = useRecordingSession({
    totalSeconds: RECORD_TIME,
    onComplete: processAudio,
    onError: msg => { setErrorMsg(msg); setPhase("error") },
  })

  useEffect(() => () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current)
    audioRef.current?.pause()
  }, [])

  const startPrepTimer = useCallback(() => {
    setPrepSec(PREP_TIME)
    setPhase("prep")
    prepTimerRef.current = setInterval(() => {
      setPrepSec(s => {
        if (s <= 1) {
          clearInterval(prepTimerRef.current!)
          setPhase("recording")
          recording.start()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, [recording.start]) // eslint-disable-line react-hooks/exhaustive-deps

  const playLecture = useCallback((url: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => startPrepTimer()
    audio.onerror = () => startPrepTimer()
    setPhase("listening")
    audio.play().catch(() => startPrepTimer())
  }, [startPrepTimer])

  // Auto-generate on mount
  useEffect(() => {
    const generate = async () => {
      try {
        const text = await loadStimulusText({ taskType: "re_tell_lecture" })
        setLectureText(text)

        const blob = await apiPostBlob("/api/tts", { text, voice: "en-US-AriaNeural", rate: 0.85 }, { timeoutMs: 30000 })
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setPhase("ready")
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to generate lecture")
        setPhase("error")
      }
    }
    generate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipTask = () => {
    const emptyTask: PracticeTask = {
      id: `mock_${Date.now()}`,
      taskType: "re_tell_lecture",
      stimulus: { kind: "audio", content: lectureText },
      response: { kind: "audio", content: "" },
      durationSeconds: 0,
      createdAt: new Date().toISOString(),
    }
    onComplete(emptyTask)
  }

  return (
    <div className="space-y-5">
      {phase === "generating" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t("mock.reTellLecture.generating")}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{t("mock.reTellLecture.generatingSubtitle")}</p>
        </div>
      )}

      {phase === "ready" && audioUrl && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
            {t("mock.reTellLecture.lectureReady")}
          </p>
          <button onClick={() => playLecture(audioUrl)}
            className="inline-flex items-center gap-3 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 mb-4">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
            {t("mock.reTellLecture.playLecture")}
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("mock.reTellLecture.afterLecture", { prepTime: PREP_TIME, recordTime: RECORD_TIME })}
          </p>
        </div>
      )}

      {phase === "listening" && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-center gap-2 mb-4">
            {[0, 1, 2, 3, 4].map(i => (
              <span key={i} className="inline-block w-1 rounded-full bg-emerald-500"
                style={{ height: `${16 + (i % 3) * 8}px`, animation: `pulse 0.8s ease-in-out ${i * 0.12}s infinite alternate` }} />
            ))}
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t("mock.reTellLecture.playing")}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{t("mock.reTellLecture.listenHint")}</p>
          <style>{`@keyframes pulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }`}</style>
        </div>
      )}

      {phase === "prep" && (
        <div className="border border-slate-900 bg-white p-8 dark:border-white/15 dark:bg-slate-900 text-center shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
            {t("mock.reTellLecture.prepPhase")}
          </p>
          <CountdownRing seconds={prepSec} total={PREP_TIME} size={88} />
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            {t("mock.reTellLecture.recordingStartsIn", { sec: prepSec })}
          </p>
        </div>
      )}

      {phase === "recording" && (
        <div className="border-2 border-red-400 bg-white p-8 dark:bg-slate-900 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
              {t("mock.reTellLecture.recordingPhase")}
            </p>
          </div>
          <CountdownRing seconds={recording.recSeconds} total={RECORD_TIME} size={80} />
          <p className="mt-4 text-xs text-slate-400">{t("mock.common.recordingStopsAuto")}</p>
        </div>
      )}

      {phase === "processing" && (
        <div className="border border-slate-200 bg-white p-12 dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("mock.reTellLecture.analyzing")}</p>
        </div>
      )}

      {phase === "done" && doneTask && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">{t("mock.common.aiFeedback")}</p>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{doneTask.feedback?.summary}</p>
          </div>
          <div className="flex justify-end">
            <button onClick={() => onComplete(doneTask)}
              className="rounded-xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              {t("mock.common.continueNext")}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{errorMsg}</p>
          <button onClick={skipTask} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
            {t("mock.common.skipTask")}
          </button>
        </div>
      )}
    </div>
  )
}
