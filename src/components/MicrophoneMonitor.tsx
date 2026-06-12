"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const BAR_COUNT = 20;
const GOOD_THRESHOLD = 0.15;   // above this → green
const WARN_THRESHOLD = 0.05;   // above this → yellow, below → red

export default function MicrophoneMonitor() {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(0);           // 0–1
  const [peak, setPeak] = useState(0);             // 0–1, decays
  const [status, setStatus] = useState<"idle" | "active" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const peakRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (ctxRef.current) ctxRef.current.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current = null;
    analyserRef.current = null;
    rafRef.current = null;
    peakRef.current = 0;
    setLevel(0);
    setPeak(0);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      ctx.createMediaStreamSource(stream).connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // RMS amplitude
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);

        setLevel(rms);

        // Peak hold + slow decay
        if (rms > peakRef.current) {
          peakRef.current = rms;
        } else {
          peakRef.current = Math.max(0, peakRef.current - 0.005);
        }
        setPeak(peakRef.current);

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
      setStatus("active");
      setErrorMsg("");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Microphone access denied");
    }
  }, []);

  // cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  const handleToggle = () => {
    if (!open) {
      setOpen(true);
      start();
    } else {
      stop();
      setOpen(false);
    }
  };

  const filledBars = Math.round(level * BAR_COUNT * 4);          // amplify for visibility
  const peakBar = Math.min(BAR_COUNT - 1, Math.round(peak * BAR_COUNT * 4));

  const barColor = (i: number) => {
    if (i < BAR_COUNT * 0.6) return "bg-green-500";
    if (i < BAR_COUNT * 0.85) return "bg-yellow-400";
    return "bg-red-500";
  };

  const statusLabel = () => {
    if (status === "error") return { text: errorMsg, cls: "text-red-500" };
    if (level > GOOD_THRESHOLD) return { text: "Good signal", cls: "text-green-500" };
    if (level > WARN_THRESHOLD) return { text: "Weak signal — speak louder", cls: "text-yellow-500" };
    if (status === "active") return { text: "No signal detected", cls: "text-red-500" };
    return { text: "", cls: "" };
  };

  const { text: statusText, cls: statusCls } = statusLabel();

  return (
    <div className="inline-block">
      <button
        onClick={handleToggle}
        title={open ? "Close mic monitor" : "Test microphone"}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          open
            ? "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400"
            : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        </svg>
        {open ? "Stop" : "Test Mic"}
      </button>

      {open && (
        <div className="mt-2 p-3 rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 shadow-sm w-64">
          {/* Level bars */}
          <div className="flex items-end gap-0.5 h-8 mb-2">
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm transition-all duration-75 ${
                  i < filledBars
                    ? barColor(i)
                    : "bg-gray-100 dark:bg-gray-800"
                }`}
                style={{
                  // taller bars toward the right
                  height: `${40 + i * 2}%`,
                  // peak marker
                  outline: i === peakBar && peak > 0.02 ? "2px solid #f59e0b" : "none",
                }}
              />
            ))}
          </div>

          {/* Numeric level */}
          <div className="flex justify-between items-center text-xs text-gray-400 dark:text-gray-500 mb-1">
            <span>0</span>
            <span className="tabular-nums font-mono">
              {Math.round(level * 100)}%
            </span>
            <span>100</span>
          </div>

          {/* Status text */}
          {statusText && (
            <p className={`text-xs font-medium mt-1 ${statusCls}`}>{statusText}</p>
          )}

          {status === "error" && (
            <p className="text-xs text-gray-400 mt-1">
              Check browser microphone permissions and refresh.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
