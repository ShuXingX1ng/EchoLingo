"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ChatMessage, SessionFeedback, PronunciationAssessmentResult } from "@/types";
import { saveSession } from "@/lib/history";
import { updateErrorPatterns } from "@/lib/error-patterns";
import { recordProgress } from "@/lib/supabase-progress";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/lib/i18n";
import VoiceInput from "@/components/VoiceInput";
import VoiceOutput from "@/components/VoiceOutput";
import VoiceControls from "@/components/VoiceControls";
import MuteButton from "@/components/MuteButton";
import ErrorAnnotations from "@/components/ErrorAnnotations";
import PronunciationFeedback from "@/components/PronunciationFeedback";

type ExamPhase = "part1" | "part2-prep" | "part2-speak" | "part3" | "ended";

const PREP_TIME = 60; // 1 minute prep
const SPEAK_TIME = 120; // 2 minutes speaking

export default function ExamPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          </div>
        </div>
      }
    >
      <ExamPage />
    </Suspense>
  );
}

function ExamPage() {
  const searchParams = useSearchParams();
  const topicId = searchParams.get("topic") || undefined;
  const { user } = useAuth();
  const { t } = useTranslation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<ExamPhase>("part1");
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [prepTimeLeft, setPrepTimeLeft] = useState(PREP_TIME);
  const [speakTimeLeft, setSpeakTimeLeft] = useState(SPEAK_TIME);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAudioBlobRef = useRef<Blob | null>(null);
  const lastUserMessageRef = useRef<string>("");

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, feedback]);

  // Start exam with Part 1 greeting
  useEffect(() => {
    const greeting: ChatMessage = {
      id: "1",
      role: "examiner",
      content:
        "Good morning/afternoon. My name is Examiner. Can I have your full name, please?\n\nNow I'd like to ask you some questions about yourself. Where are you from?",
      createdAt: new Date().toISOString(),
    };
    setMessages([greeting]);
  }, []);

  // Prep timer countdown
  useEffect(() => {
    if (phase !== "part2-prep") return;
    if (prepTimeLeft <= 0) {
      setPhase("part2-speak");
      return;
    }
    const timer = setInterval(() => {
      setPrepTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, prepTimeLeft]);

  // Speak timer countdown
  useEffect(() => {
    if (phase !== "part2-speak") return;
    if (speakTimeLeft <= 0) {
      // Auto-advance: inject a transition message and request Part 3
      handleSpeakTimeout();
      return;
    }
    const timer = setInterval(() => {
      setSpeakTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, speakTimeLeft]);

  // Detect phase transitions from examiner messages
  const detectPhaseTransition = useCallback(
    (examinerMessage: string) => {
      const lower = examinerMessage.toLowerCase();

      // Part 1 → Part 2: detect cue card / "give you a topic"
      if (
        phase === "part1" &&
        (lower.includes("give you a topic") ||
          lower.includes("cue card") ||
          lower.includes("i'm going to give you"))
      ) {
        setPhase("part2-prep");
        setPrepTimeLeft(PREP_TIME);
      }

      // Part 2 → Part 3: detect broader discussion transition
      if (
        (phase === "part2-prep" || phase === "part2-speak") &&
        (lower.includes("broader questions") ||
          lower.includes("discuss some") ||
          lower.includes("let's discuss"))
      ) {
        setPhase("part3");
      }

      // End detection
      if (
        lower.includes("end of the speaking test") ||
        lower.includes("that is the end")
      ) {
        setPhase("ended");
      }
    },
    [phase]
  );

  const fetchExaminerResponse = async (currentMessages: ChatMessage[]) => {
    const response = await fetch("/api/examiner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "full",
        topic: topicId,
        messages: currentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to get examiner response.");
    }

    const data = await response.json();
    return data.message as string;
  };

  const fetchFeedback = async (currentMessages: ChatMessage[]) => {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "full",
        messages: currentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to generate feedback.");
    }

    return response.json() as Promise<SessionFeedback>;
  };

  const fetchPronunciationAssessment = async (
    audioBlob: Blob,
    referenceText: string
  ): Promise<PronunciationAssessmentResult | null> => {
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("text", referenceText);

      const response = await fetch("/api/pronunciation", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        console.error("Pronunciation assessment failed:", response.status);
        return null;
      }

      return response.json();
    } catch (error) {
      console.error("Pronunciation assessment error:", error);
      return null;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || phase === "ended") return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const examinerResponse = await fetchExaminerResponse(newMessages);
      const examinerMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "examiner",
        content: examinerResponse,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, examinerMessage]);
      detectPhaseTransition(examinerResponse);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get response."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeakTimeout = useCallback(async () => {
    if (isLoading) return;

    const timeoutMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "examiner",
      content: "Thank you. Let's move on to the next part of the test.",
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, timeoutMsg];
    setMessages(newMessages);
    setIsLoading(true);
    setPhase("part3");

    try {
      const examinerResponse = await fetchExaminerResponse(newMessages);
      const examinerMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "examiner",
        content: examinerResponse,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, examinerMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get response.");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages]);

  const handleVoiceResult = useCallback((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  }, []);

  const handleVoiceConversationResult = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || phase === "ended") return;

      // Save last user message for pronunciation assessment
      lastUserMessageRef.current = text.trim();

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        createdAt: new Date().toISOString(),
      };

      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setIsLoading(true);
      setError(null);

      try {
        const examinerResponse = await fetchExaminerResponse(newMessages);
        const examinerMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "examiner",
          content: examinerResponse,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, examinerMessage]);
        detectPhaseTransition(examinerResponse);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to get response."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, phase, messages, detectPhaseTransition]
  );

  const handleAudioResult = useCallback((audioBlob: Blob) => {
    lastAudioBlobRef.current = audioBlob;
  }, []);

  const handleEndExam = async () => {
    setPhase("ended");
    setIsFeedbackLoading(true);
    setError(null);

    const endMessage: ChatMessage = {
      id: (Date.now() + 2).toString(),
      role: "examiner",
      content: "That is the end of the speaking test. Thank you.",
      createdAt: new Date().toISOString(),
    };
    const finalMessages = [...messages, endMessage];
    setMessages(finalMessages);

    try {
      const feedbackData = await fetchFeedback(finalMessages);

      // Perform pronunciation assessment if audio is available
      if (lastAudioBlobRef.current && lastUserMessageRef.current) {
        const pronunciationResult = await fetchPronunciationAssessment(
          lastAudioBlobRef.current,
          lastUserMessageRef.current
        );

        if (pronunciationResult) {
          feedbackData.pronunciationAssessment = pronunciationResult;
          feedbackData.pronunciation = pronunciationResult.summary;
        }
      }

      setFeedback(feedbackData);
      saveSession(finalMessages, feedbackData);

      if (user) {
        // Add pronunciation weaknesses if assessment is available
        const feedbackForPatterns = { ...feedbackData };
        if (feedbackData.pronunciationAssessment) {
          const mispronounced = feedbackData.pronunciationAssessment.words.filter(
            (w) => w.errorType === "Mispronunciation" && w.score < 70
          );
          if (mispronounced.length > 0) {
            feedbackForPatterns.weaknesses = [
              ...feedbackData.weaknesses,
              `Pronunciation: ${mispronounced.map((w) => w.word).join(", ")}`,
            ];
          }
        }
        updateErrorPatterns(user.id, feedbackForPatterns);
        if (topicId && feedbackData.estimatedBand) {
          recordProgress(user.id, topicId, "part1", feedbackData.estimatedBand);
          recordProgress(user.id, topicId, "part2", feedbackData.estimatedBand);
          recordProgress(user.id, topicId, "part3", feedbackData.estimatedBand);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate feedback."
      );
    } finally {
      setIsFeedbackLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const phaseConfig = {
    part1: { label: "Part 1", color: "bg-blue-500", desc: "Introduction" },
    "part2-prep": {
      label: "Part 2",
      color: "bg-yellow-500",
      desc: `Preparation — ${formatTime(prepTimeLeft)}`,
    },
    "part2-speak": {
      label: "Part 2",
      color: "bg-orange-500",
      desc: `Speaking — ${formatTime(speakTimeLeft)}`,
    },
    part3: { label: "Part 3", color: "bg-purple-500", desc: "Discussion" },
    ended: { label: "Ended", color: "bg-gray-500", desc: "Test complete" },
  };

  const currentPhase = phaseConfig[phase];

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← {t("nav.home")}
            </Link>
            <div>
              <h1 className="font-semibold text-gray-900 dark:text-white">
                {t("exam.title")}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MuteButton />
            {phase !== "ended" && (
              <button
                onClick={handleEndExam}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {t("exam.endExam")}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Phase Indicator */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            {(["part1", "part2-prep", "part3"] as ExamPhase[]).map(
              (p, index) => {
                const config = phaseConfig[p];
                const isActive =
                  phase === p ||
                  (p === "part2-prep" &&
                    (phase === "part2-prep" || phase === "part2-speak")) ||
                  (p === "part1" &&
                    !["part1"].includes(phase) &&
                    phase !== "ended") ||
                  (p === "part3" && phase === "ended");
                const isPast =
                  (p === "part1" && phase !== "part1") ||
                  (p === "part2-prep" && phase === "part3") ||
                  (p === "part2-prep" && phase === "ended");
                const isCurrent =
                  phase === p ||
                  (p === "part2-prep" &&
                    (phase === "part2-prep" || phase === "part2-speak"));

                return (
                  <div key={p} className="flex items-center gap-2 flex-1">
                    {index > 0 && (
                      <div
                        className={`h-0.5 flex-1 rounded ${
                          isPast ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"
                        }`}
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                          isCurrent
                            ? "bg-blue-600 text-white"
                            : isPast
                            ? "bg-blue-500 text-white"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <span
                        className={`text-xs font-medium hidden sm:inline ${
                          isCurrent
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {config.label}
                      </span>
                    </div>
                  </div>
                );
              }
            )}
          </div>

          {/* Timer / Status */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {currentPhase.desc}
            </span>
            {(phase === "part2-prep" || phase === "part2-speak") && (
              <div
                className={`text-sm font-mono font-bold ${
                  (phase === "part2-prep" && prepTimeLeft <= 10) ||
                  (phase === "part2-speak" && speakTimeLeft <= 30)
                    ? "text-red-500"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {phase === "part2-prep"
                  ? formatTime(prepTimeLeft)
                  : formatTime(speakTimeLeft)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex animate-message-in ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-bl-md shadow-sm"
                }`}
              >
                {message.role === "examiner" && (
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t("practice.examiner")}
                    </p>
                    <VoiceOutput
                      text={message.content}
                      autoPlay={message.id === messages[messages.length - 1]?.id}
                    />
                  </div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start animate-message-in">
              <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[200px]">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
                  {t("practice.examiner")}
                </p>
                <div className="space-y-2">
                  <div className="h-3 w-3/4 rounded animate-shimmer" />
                  <div className="h-3 w-1/2 rounded animate-shimmer" style={{ animationDelay: "0.1s" }} />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  </div>
                  <span className="text-xs text-blue-500 dark:text-blue-400">
                    {t("practice.thinking")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center px-4 animate-message-in">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 max-w-md">
                <div className="flex items-start gap-3">
                  <span className="text-red-500 mt-0.5">⚠</span>
                  <div>
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="max-w-3xl mx-auto">
          {phase !== "ended" ? (
            <>
              {/* Mode Toggle */}
              <div className="flex justify-center mb-3">
                <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800/50">
                  <button
                    onClick={() => setInputMode("text")}
                    className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                      inputMode === "text"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {t("practice.textMode")}
                  </button>
                  <button
                    onClick={() => setInputMode("voice")}
                    className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                      inputMode === "voice"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {t("practice.voiceMode")}
                  </button>
                </div>
              </div>

              {inputMode === "text" ? (
                <div className="flex gap-2 sm:gap-3 items-center">
                  <VoiceInput
                    onResult={handleVoiceResult}
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder={t("practice.inputPlaceholder")}
                    className="flex-1 px-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="px-4 sm:px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t("practice.send")}
                  </button>
                </div>
              ) : (
                <div className="flex justify-center py-2">
                  <VoiceControls
                    onResult={handleVoiceConversationResult}
                    onAudioResult={handleAudioResult}
                    isProcessing={isLoading}
                    disabled={isLoading}
                    maxAnswerTime={60}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-2">
              {isFeedbackLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("practice.generating")}
                  </p>
                </div>
              ) : feedback ? (
                <button
                  onClick={() => (window.location.href = "/practice/exam")}
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  {t("exam.newExam")}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error || t("practice.feedbackError")}
                  </p>
                  <button
                    onClick={() => (window.location.href = "/practice/exam")}
                    className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    {t("practice.tryAgain")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Feedback Panel */}
      {feedback && <FeedbackPanel feedback={feedback} />}
    </div>
  );
}

function FeedbackPanel({ feedback }: { feedback: SessionFeedback }) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t("exam.resultTitle")}
            </h2>
            <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-1.5 rounded-full text-sm font-semibold">
              Band {feedback.estimatedBand}
            </div>
          </div>

          <div className="space-y-5">
            <FeedbackSection title={t("feedback.fluency")} content={feedback.fluencyAndCoherence} />
            <FeedbackSection title={t("feedback.vocabulary")} content={feedback.lexicalResource} />
            <FeedbackSection title={t("feedback.grammar")} content={feedback.grammarRangeAndAccuracy} />
            <FeedbackSection title={t("feedback.pronunciation")} content={feedback.pronunciation} />

            {feedback.pronunciationAssessment && (
              <PronunciationFeedback assessment={feedback.pronunciationAssessment} />
            )}

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                {t("feedback.strengths")}
              </h3>
              <ul className="space-y-2">
                {feedback.strengths.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="text-green-500 mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                {t("feedback.weaknesses")}
              </h3>
              <ul className="space-y-2">
                {feedback.weaknesses.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="text-orange-500 mt-0.5">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                {t("feedback.suggestions")}
              </h3>
              <ol className="space-y-2">
                {feedback.improvementSuggestions.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-blue-500">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                {t("feedback.sampleAnswer")}
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {feedback.improvedSampleAnswer}
                </p>
              </div>
            </div>

            {feedback.errorAnnotations && (
              <ErrorAnnotations annotations={feedback.errorAnnotations} />
            )}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => (window.location.href = "/practice/exam")}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              {t("exam.newExam")}
            </button>
            <button
              onClick={() => (window.location.href = "/history")}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t("nav.history")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedbackSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h3 className="font-medium text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{content}</p>
    </div>
  );
}
