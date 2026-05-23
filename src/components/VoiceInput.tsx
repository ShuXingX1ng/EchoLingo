"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface VoiceInputProps {
  onResult: (text: string) => void;
  disabled?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionType = any;

export default function VoiceInput({ onResult, disabled }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionType>(null);

  useEffect(() => {
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported || disabled) return;

    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SR();
    recognition.continuous = true;
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
        onResult(finalTranscript);
        setInterimText("");
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setInterimText("");
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, disabled, onResult]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 overflow-hidden min-w-0">
      <button
        onClick={toggleListening}
        disabled={disabled}
        className={`p-3 rounded-xl shrink-0 transition-all ${
          isListening
            ? "bg-red-500 text-white animate-pulse"
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isListening ? "Stop listening" : "Start voice input"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5"
        >
          <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
          <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.041h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.041a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
        </svg>
      </button>
      {isListening && interimText && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate max-w-48">
          {interimText}
        </p>
      )}
      {isListening && !interimText && (
        <p className="text-xs text-red-500 animate-pulse">Listening...</p>
      )}
    </div>
  );
}
