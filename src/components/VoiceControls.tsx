"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import VoiceVisualizer from "./VoiceVisualizer";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useTranslation } from "@/lib/i18n";

type VoiceState = "idle" | "listening" | "processing" | "speaking";

type RecognitionInstance = {
  stop(): void;
  abort(): void;
};

interface VoiceControlsProps {
  onResult: (text: string) => void;
  onAudioResult?: (audioBlob: Blob) => void; // 音频数据回调，用于发音评估
  isProcessing?: boolean;
  disabled?: boolean;
  maxAnswerTime?: number; // 最大回答时间（秒），默认 60
  onTimeout?: () => void; // 超时回调
}

export default function VoiceControls({
  onResult,
  onAudioResult,
  isProcessing = false,
  disabled = false,
  maxAnswerTime = 60,
  onTimeout,
}: VoiceControlsProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<VoiceState>("idle");
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const { startRecording, stopRecording } = useAudioRecorder();

  useEffect(() => {
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  // 清理计时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Sync processing state from parent
  useEffect(() => {
    if (isProcessing) {
      setState("processing");
    } else if (state === "processing") {
      // When processing ends, go back to idle
      setState("idle");
    }
  }, [isProcessing]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startTimeRef.current = null;
    setElapsedTime(0);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startTimeRef.current = Date.now();
    setElapsedTime(0);

    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedTime(elapsed);

        // 超时处理
        if (elapsed >= maxAnswerTime) {
          stopTimer();
          if (onTimeout) {
            onTimeout();
          }
        }
      }
    }, 1000);
  }, [maxAnswerTime, onTimeout, stopTimer]);

  const startListening = useCallback(async () => {
    if (!isSupported || disabled || isProcessing) return;

    // Start audio recording if onAudioResult is provided
    if (onAudioResult) {
      try {
        await startRecording();
      } catch (error) {
        console.error("Failed to start audio recording:", error);
      }
    }

    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      setInterimText(interimTranscript);

      if (finalTranscript) {
        setInterimText("");
        onResult(finalTranscript);
        // Don't set state here - let parent handle it via isProcessing
      }
    };

    recognition.onerror = () => {
      setInterimText("");
      setState("idle");
      if (onAudioResult) {
        const blob = stopRecording();
        if (blob) onAudioResult(blob);
      }
    };

    recognition.onend = () => {
      setInterimText("");
      if (onAudioResult) {
        const blob = stopRecording();
        if (blob) onAudioResult(blob);
      }
      // Only go to idle if we're still in listening state
      // If onResult was called, parent will set isProcessing=true
      setState((prev) => (prev === "listening" ? "idle" : prev));
    };

    recognitionRef.current = recognition;
    recognition.start();
    setState("listening");
    setInterimText("");
    startTimer(); // 开始计时
  }, [isSupported, disabled, isProcessing, onResult, onAudioResult, startTimer, startRecording, stopRecording]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (onAudioResult) {
      const blob = stopRecording();
      if (blob) onAudioResult(blob);
    }
    stopTimer(); // 停止计时
    setState("idle");
    setInterimText("");
  }, [stopTimer, stopRecording, onAudioResult]);

  const handleMainButton = () => {
    if (state === "listening") {
      stopListening();
    } else if (state === "idle") {
      startListening();
    }
  };

  if (!isSupported) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t("voiceControls.notSupported")}
      </p>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusText = () => {
    switch (state) {
      case "listening":
        if (interimText) return interimText;
        return `${t("voiceControls.listening")} ${formatTime(elapsedTime)}/${formatTime(maxAnswerTime)}`;
      case "processing":
        return t("voiceControls.aiThinking");
      default:
        return t("voiceControls.tapToSpeak");
    }
  };

  const getTimeWarningColor = () => {
    const remaining = maxAnswerTime - elapsedTime;
    if (remaining <= 10) return "text-red-500";
    if (remaining <= 20) return "text-yellow-500";
    return "text-gray-500 dark:text-gray-400";
  };

  const getButtonColor = () => {
    switch (state) {
      case "listening":
        return "bg-red-500 hover:bg-red-600 animate-pulse";
      case "processing":
        return "bg-yellow-500 cursor-not-allowed";
      default:
        return "bg-blue-600 hover:bg-blue-700";
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Main Voice Button */}
      <button
        onClick={handleMainButton}
        disabled={disabled || state === "processing"}
        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-white transition-all shadow-lg active:scale-95 ${getButtonColor()}`}
        aria-label={state === "listening" ? t("voiceControls.stopListening") : t("voiceControls.startSpeaking")}
      >
        {state === "listening" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-7 h-7"
          >
            <path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-7.5Z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-7 h-7"
          >
            <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
            <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.041h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.041a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
          </svg>
        )}
      </button>

      {/* Visualizer */}
      <VoiceVisualizer isActive={state === "listening"} type="recording" />

      {/* Status Text */}
      <p className={`text-xs text-center max-w-48 truncate ${state === "listening" ? getTimeWarningColor() : "text-gray-500 dark:text-gray-400"}`}>
        {getStatusText()}
      </p>

      {/* Time Progress Bar */}
      {state === "listening" && (
        <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              maxAnswerTime - elapsedTime <= 10
                ? "bg-red-500"
                : maxAnswerTime - elapsedTime <= 20
                ? "bg-yellow-500"
                : "bg-blue-500"
            }`}
            style={{ width: `${Math.max(0, (elapsedTime / maxAnswerTime) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
