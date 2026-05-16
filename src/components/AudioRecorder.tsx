"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { saveRecording } from "@/lib/recordings";

interface AudioRecorderProps {
  sessionId: string;
  messageId: string;
  onRecordingSaved?: (recordingId: string) => void;
  disabled?: boolean;
}

export default function AudioRecorder({
  sessionId,
  messageId,
  onRecordingSaved,
  disabled,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported || disabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());

        try {
          const recording = await saveRecording(sessionId, messageId, blob);
          onRecordingSaved?.(recording.id);
        } catch (error) {
          console.error("Failed to save recording:", error);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, [isSupported, disabled, sessionId, messageId, onRecordingSaved]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  if (!isSupported) return null;

  return (
    <button
      onClick={toggleRecording}
      disabled={disabled}
      className={`p-2 rounded-lg transition-all ${
        isRecording
          ? "bg-red-500 text-white animate-pulse"
          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={isRecording ? "Stop recording" : "Record audio"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-4 h-4"
      >
        {isRecording ? (
          <path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
        ) : (
          <path d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        )}
      </svg>
    </button>
  );
}
