"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { ChatMessage, SessionFeedback } from "@/types";
import { fetchFeedback, saveSessionAndUpdateLearning } from "@/lib/feedback-actions";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/lib/i18n";
import VoiceInput from "@/components/VoiceInput";
import VoiceOutput from "@/components/VoiceOutput";
import VoiceControls from "@/components/VoiceControls";
import DesktopNav from "@/components/DesktopNav";
import FeedbackPanel from "@/components/FeedbackPanel";
import { ChatLoadingIndicator, ChatErrorBanner, SuspenseFallback, FeedbackLoadingIndicator } from "@/components/ChatUIStates";

type ExamPhase = "part1" | "part2-prep" | "part2-speak" | "part3" | "ended";

const PREP_TIME = 60; // 1 minute prep
const SPEAK_TIME = 120; // 2 minutes speaking

export default function ExamPageWrapper() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
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

  const fetchExaminerResponse = useCallback(async (currentMessages: ChatMessage[]) => {
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
  }, [topicId]);

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
  }, [fetchExaminerResponse, isLoading, messages]);

  // Speak timer countdown
  useEffect(() => {
    if (phase !== "part2-speak") return;
    if (speakTimeLeft <= 0) {
      handleSpeakTimeout();
      return;
    }
    const timer = setInterval(() => {
      setSpeakTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [handleSpeakTimeout, phase, speakTimeLeft]);

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
    [fetchExaminerResponse, isLoading, phase, messages, detectPhaseTransition]
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
      const feedbackData = await fetchFeedback(finalMessages, "full");

      await saveSessionAndUpdateLearning(
        finalMessages,
        feedbackData,
        user?.id,
        topicId,
        "full",
        lastAudioBlobRef.current,
        lastUserMessageRef.current
      );

      setFeedback(feedbackData);
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

  // Get timer urgency level for styling
  const getTimerUrgency = (timeLeft: number, totalTime: number) => {
    const percentLeft = (timeLeft / totalTime) * 100;
    if (percentLeft <= 10) return "critical"; // ≤10% remaining
    if (percentLeft <= 25) return "warning";  // ≤25% remaining
    return "normal";
  };

  const phaseConfig = {
    part1: { label: "Part 1", color: "bg-emerald-500", desc: t("exam.phase.introduction") },
    "part2-prep": {
      label: "Part 2",
      color: "bg-yellow-500",
      desc: `${t("exam.phase.preparation")} — ${formatTime(prepTimeLeft)}`,
    },
    "part2-speak": {
      label: "Part 2",
      color: "bg-orange-500",
      desc: `${t("exam.phase.speaking")} — ${formatTime(speakTimeLeft)}`,
    },
    part3: { label: "Part 3", color: "bg-purple-500", desc: t("exam.phase.discussion") },
    ended: { label: t("exam.phase.ended"), color: "bg-slate-500", desc: t("exam.phase.testComplete") },
  };

  const currentPhase = phaseConfig[phase];

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <DesktopNav
        active="practice"
        maxWidth="4xl"
        rightContent={
          phase !== "ended" ? (
            <button
              onClick={handleEndExam}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
            >
              {t("exam.endExam")}
            </button>
          ) : undefined
        }
      />

      {/* Phase Indicator */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 px-4 py-2">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            {(["part1", "part2-prep", "part3"] as ExamPhase[]).map(
              (p, index) => {
                const config = phaseConfig[p];
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
                          isPast ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                          isCurrent
                            ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                            : isPast
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <span
                        className={`text-xs font-medium hidden sm:inline ${
                          isCurrent
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-500 dark:text-slate-400"
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
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {currentPhase.desc}
            </span>
            {(phase === "part2-prep" || phase === "part2-speak") && (
              <div
                className={`text-sm font-mono font-bold ${
                  (phase === "part2-prep" && prepTimeLeft <= 10) ||
                  (phase === "part2-speak" && speakTimeLeft <= 30)
                    ? "text-red-500"
                    : "text-slate-700 dark:text-slate-300"
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

      {/* Part 2 Prominent Timer */}
      {(phase === "part2-prep" || phase === "part2-speak") && (
        <div className={`border-b px-3 py-2 sm:px-4 sm:py-3 transition-colors duration-300 ${
          phase === "part2-prep"
            ? getTimerUrgency(prepTimeLeft, PREP_TIME) === "critical"
              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
              : getTimerUrgency(prepTimeLeft, PREP_TIME) === "warning"
              ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
              : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
            : getTimerUrgency(speakTimeLeft, SPEAK_TIME) === "critical"
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            : getTimerUrgency(speakTimeLeft, SPEAK_TIME) === "warning"
            ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
            : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
        }`}>
          <div className="max-w-4xl mx-auto">
            {/* Timer Header */}
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-lg ${
                  phase === "part2-prep" ? "📝" : "🎤"
                }`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {phase === "part2-prep" ? t("exam.prepTime") : t("exam.speakTime")}
                </span>
              </div>
              <div className={`text-xl sm:text-2xl font-mono font-bold tabular-nums ${
                phase === "part2-prep"
                  ? getTimerUrgency(prepTimeLeft, PREP_TIME) === "critical"
                    ? "text-red-600 dark:text-red-400 animate-pulse"
                    : getTimerUrgency(prepTimeLeft, PREP_TIME) === "warning"
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-yellow-600 dark:text-yellow-400"
                  : getTimerUrgency(speakTimeLeft, SPEAK_TIME) === "critical"
                  ? "text-red-600 dark:text-red-400 animate-pulse"
                  : getTimerUrgency(speakTimeLeft, SPEAK_TIME) === "warning"
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}>
                {phase === "part2-prep" ? formatTime(prepTimeLeft) : formatTime(speakTimeLeft)}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 sm:h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                  phase === "part2-prep"
                    ? getTimerUrgency(prepTimeLeft, PREP_TIME) === "critical"
                      ? "bg-red-500"
                      : getTimerUrgency(prepTimeLeft, PREP_TIME) === "warning"
                      ? "bg-orange-500"
                      : "bg-yellow-500"
                    : getTimerUrgency(speakTimeLeft, SPEAK_TIME) === "critical"
                    ? "bg-red-500"
                    : getTimerUrgency(speakTimeLeft, SPEAK_TIME) === "warning"
                    ? "bg-orange-500"
                    : "bg-emerald-500"
                }`}
                style={{
                  width: `${
                    phase === "part2-prep"
                      ? (prepTimeLeft / PREP_TIME) * 100
                      : (speakTimeLeft / SPEAK_TIME) * 100
                  }%`
                }}
              />
            </div>

            {/* Warning Messages */}
            {phase === "part2-prep" && prepTimeLeft <= 10 && prepTimeLeft > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2 text-center animate-pulse">
                ⏰ {prepTimeLeft <= 5 ? t("exam.prepEndingSoon") : t("exam.prepTimeWarning")}
              </p>
            )}
            {phase === "part2-speak" && speakTimeLeft <= 30 && speakTimeLeft > 0 && (
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 text-center animate-pulse">
                ⏰ {speakTimeLeft <= 10 ? t("exam.speakEndingSoon") : t("exam.speakTimeWarning")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
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
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950 rounded-br-md"
                    : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-md shadow-sm"
                }`}
              >
                {message.role === "examiner" && (
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
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

          {isLoading && <ChatLoadingIndicator />}

          {error && <ChatErrorBanner error={error} />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 p-4">
        <div className="max-w-4xl mx-auto">
          {phase !== "ended" ? (
            <>
              {/* Mode Toggle */}
              <div className="flex justify-center mb-3">
                <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/50">
                  <button
                    onClick={() => setInputMode("text")}
                    className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                      inputMode === "text"
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    {t("practice.textMode")}
                  </button>
                  <button
                    onClick={() => setInputMode("voice")}
                    className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                      inputMode === "voice"
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
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
                    className="flex-1 px-4 py-3 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 transition-shadow"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="px-4 sm:px-6 py-3 text-sm font-medium text-white bg-slate-950 rounded-xl hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                <FeedbackLoadingIndicator />
              ) : feedback ? (
                <button
                  onClick={() => (window.location.href = "/practice/exam")}
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-slate-950 rounded-xl hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 transition-colors"
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
                    className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-slate-950 rounded-xl hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 transition-colors"
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
      {feedback && (
        <FeedbackPanel
          feedback={feedback}
          title={t("exam.resultTitle")}
          primaryActionHref="/practice/exam"
          primaryActionLabel={t("exam.newExam")}
        />
      )}
    </div>
  );
}
