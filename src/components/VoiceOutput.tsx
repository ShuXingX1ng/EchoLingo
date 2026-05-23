"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Azure Neural voice options
export const AZURE_VOICES = [
  { name: "Aria", id: "en-US-AriaNeural", gender: "Female" },
  { name: "Jenny", id: "en-US-JennyNeural", gender: "Female" },
  { name: "Guy", id: "en-US-GuyNeural", gender: "Male" },
  { name: "Davis", id: "en-US-DavisNeural", gender: "Male" },
  { name: "Amber", id: "en-US-AmberNeural", gender: "Female" },
  { name: "Brandon", id: "en-US-BrandonNeural", gender: "Male" },
  { name: "Christopher", id: "en-US-ChristopherNeural", gender: "Male" },
  { name: "Cora", id: "en-US-CoraNeural", gender: "Female" },
  { name: "Elizabeth", id: "en-US-ElizabethNeural", gender: "Female" },
  { name: "Eric", id: "en-US-EricNeural", gender: "Male" },
  { name: "Michelle", id: "en-US-MichelleNeural", gender: "Female" },
];

interface VoiceOutputProps {
  text: string;
  autoPlay?: boolean;
}

export default function VoiceOutput({ text, autoPlay = false }: VoiceOutputProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const savedMuted = localStorage.getItem("echolingo_muted");
    if (savedMuted === "true") {
      setIsMuted(true);
    }
  }, []);

  const getVoice = useCallback(() => {
    return localStorage.getItem("echolingo_azure_voice") || "en-US-AriaNeural";
  }, []);

  const getRate = useCallback(() => {
    const savedRate = localStorage.getItem("echolingo_voice_rate");
    return savedRate ? parseFloat(savedRate) : 0.95;
  }, []);

  const speak = useCallback(async () => {
    if (!text) return;

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }

    setIsSpeaking(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { apiPostBlob } = await import("@/lib/api-client");
      const audioBlob = await apiPostBlob(
        "/api/tts",
        {
          text,
          voice: getVoice(),
          rate: getRate(),
        },
        { signal: controller.signal }
      );

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("TTS playback error:", err);
      }
      setIsSpeaking(false);
    }
  }, [text, getVoice, getRate]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    if (autoPlay && text && !isMuted) {
      const timer = setTimeout(speak, 200);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, text, speak, isMuted]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return (
    <button
      onClick={isSpeaking ? stop : speak}
      className={`p-1.5 rounded-lg transition-colors ${
        isSpeaking
          ? "text-blue-500 bg-blue-50 dark:bg-blue-900/30"
          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
      title={isSpeaking ? "Stop speaking" : "Listen to this message"}
    >
      {isSpeaking ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
          <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
        </svg>
      )}
    </button>
  );
}
