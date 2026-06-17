"use client"

import { useState, useRef, useCallback, useEffect } from "react"

export interface RecordingSessionOptions {
  totalSeconds: number
  minSeconds?: number
  onComplete: (audioBlob: Blob, transcript: string, startedAt: string) => void
  onError?: (message: string) => void
}

export interface RecordingSessionReturn {
  recSeconds: number
  canStop: boolean
  start: () => Promise<void>
  stop: () => void
}

/**
 * Encapsulates MediaRecorder + SpeechRecognition + countdown timer for audio
 * recording tasks. Calls onComplete(blob, transcript, startedAt) when the
 * recording ends (countdown expiry or manual stop).
 */
export function useRecordingSession({
  totalSeconds,
  minSeconds = 0,
  onComplete,
  onError,
}: RecordingSessionOptions): RecordingSessionReturn {
  const [recSeconds, setRecSeconds] = useState(totalSeconds)

  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null)
  const txRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef("")

  // Keep callbacks in refs so closures never go stale
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      srRef.current?.stop()
      srRef.current = null
    }
  }, [])

  const finish = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    srRef.current?.stop()
    srRef.current = null

    const transcript = txRef.current.trim() || "[transcript not captured]"
    const startedAt = startedAtRef.current
    const mr = mrRef.current

    if (!mr || mr.state === "inactive") {
      onCompleteRef.current(new Blob([], { type: "audio/webm" }), transcript, startedAt)
      return
    }

    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" })
      streamRef.current?.getTracks().forEach(t => t.stop())
      onCompleteRef.current(blob, transcript, startedAt)
    }
    mr.stop()
  }, [])

  const start = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    chunksRef.current = []
    txRef.current = ""
    startedAtRef.current = new Date().toISOString()
    setRecSeconds(totalSeconds)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mrRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(250)
    } catch {
      onErrorRef.current?.("Microphone access denied.")
      return
    }

    // SpeechRecognition for best-effort transcript
    const SR = typeof window !== "undefined"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
      : null
    if (SR) {
      const rec = new SR()
      rec.continuous = true
      rec.interimResults = false
      rec.lang = "en-US"
      rec.onresult = (e: { results: SpeechRecognitionResultList; resultIndex: number }) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            txRef.current += (txRef.current ? " " : "") + e.results[i][0].transcript
          }
        }
      }
      rec.onerror = () => {}
      srRef.current = rec
      try { rec.start() } catch {}
    }

    timerRef.current = setInterval(() => {
      setRecSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); finish(); return 0 }
        return s - 1
      })
    }, 1000)
  }, [totalSeconds, finish])

  return {
    recSeconds,
    canStop: recSeconds <= totalSeconds - minSeconds,
    start,
    stop: finish,
  }
}
