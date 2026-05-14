"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface VoiceOutputProps {
  text: string;
  autoPlay?: boolean;
}

export default function VoiceOutput({ text, autoPlay = false }: VoiceOutputProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(0.95);
  const [isMuted, setIsMuted] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setIsSupported("speechSynthesis" in window);

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      const englishVoices = availableVoices.filter((v) =>
        v.lang.startsWith("en")
      );
      setVoices(englishVoices);

      // Load saved settings
      const savedVoiceURI = localStorage.getItem("echolingo_voice_uri");
      const savedRate = localStorage.getItem("echolingo_voice_rate");
      const savedMuted = localStorage.getItem("echolingo_muted");

      if (savedRate) {
        setRate(parseFloat(savedRate));
      }

      if (savedMuted === "true") {
        setIsMuted(true);
      }

      let voice: SpeechSynthesisVoice | null = null;
      if (savedVoiceURI) {
        voice = englishVoices.find((v) => v.voiceURI === savedVoiceURI) || null;
      }

      if (!voice) {
        voice =
          englishVoices.find((v) => v.name.includes("Google") && v.lang === "en-US") ||
          englishVoices.find((v) => v.lang === "en-US") ||
          englishVoices.find((v) => v.lang === "en-GB") ||
          englishVoices[0] ||
          null;
      }

      setSelectedVoice(voice);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(() => {
    if (!isSupported || !text) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    utterance.pitch = 1;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported, text, selectedVoice, rate]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    if (autoPlay && text && selectedVoice && !isMuted) {
      const timer = setTimeout(speak, 100);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, text, selectedVoice, speak, isMuted]);

  if (!isSupported) {
    return null;
  }

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
