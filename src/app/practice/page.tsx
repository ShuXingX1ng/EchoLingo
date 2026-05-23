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

const INITIAL_QUESTIONS: Record<string, string> = {
  part1: "Let's talk about your hometown. Where is your hometown?",
  part2: "I'm going to give you a topic to talk about for 1-2 minutes. You have 1 minute to prepare. You can make notes if you wish.\n\nDescribe your hometown. You should say:\n- where it is\n- what it is known for\n- what you like and dislike about it\n\nAnd explain why it is special to you.\n\nAlright, you can start speaking now. You have 1-2 minutes.",
  part3: "Let's discuss some broader questions related to urbanization and city life. How do cities in your country differ from each other?",
  full: "Good morning/afternoon. My name is [Examiner]. Can I have your full name, please?\n\nNow I'd like to ask you some questions about your hometown. Where is your hometown?",
};

const MAX_ANSWER_TIME = 60; // 最大回答时间（秒）

function createInitialQuestion(mode: string): ChatMessage {
  return {
    id: "1",
    role: "examiner",
    content: INITIAL_QUESTIONS[mode] || INITIAL_QUESTIONS.part1,
    createdAt: new Date().toISOString(),
  };
}

export default function PracticePageWrapper() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <PracticePage />
    </Suspense>
  );
}

function PracticePage() {
  const searchParams = useSearchParams();
  const practiceMode = searchParams.get("mode") || "part1";
  const topicId = searchParams.get("topic") || undefined;
  const { user } = useAuth();
  const { t } = useTranslation();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createInitialQuestion(practiceMode),
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAudioBlobRef = useRef<Blob | null>(null);
  const lastUserMessageRef = useRef<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, feedback]);

  const fetchExaminerResponse = useCallback(async (currentMessages: ChatMessage[]) => {
    const { apiPost } = await import("@/lib/api-client");
    const data = await apiPost<{ message: string }>("/api/examiner", {
      mode: practiceMode,
      topic: topicId,
      messages: currentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
    return data.message;
  }, [practiceMode, topicId]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || isSessionEnded) return;

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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to get response. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSession = async () => {
    setIsSessionEnded(true);
    setIsFeedbackLoading(true);
    setError(null);

    const endMessage: ChatMessage = {
      id: (Date.now() + 2).toString(),
      role: "examiner",
      content: "Thank you. That is the end of the speaking practice session.",
      createdAt: new Date().toISOString(),
    };
    const finalMessages = [...messages, endMessage];
    setMessages(finalMessages);

    try {
      const feedbackData = await fetchFeedback(finalMessages, practiceMode === "full" ? "full" : "ielts_part_1");

      await saveSessionAndUpdateLearning(
        finalMessages,
        feedbackData,
        user?.id,
        topicId,
        practiceMode,
        lastAudioBlobRef.current,
        lastUserMessageRef.current
      );

      setFeedback(feedbackData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate feedback. Please try again."
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

  const handleVoiceResult = useCallback((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  }, []);

  const handleVoiceConversationResult = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || isSessionEnded) return;

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
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to get response. Please try again."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, isSessionEnded, messages, fetchExaminerResponse]
  );

  const handleAudioResult = useCallback((audioBlob: Blob) => {
    lastAudioBlobRef.current = audioBlob;
  }, []);

  // AI 超时打断处理
  const handleTimeout = useCallback(async () => {
    if (isLoading || isSessionEnded) return;

    // 添加超时提示消息
    const timeoutMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "examiner",
      content: "Thank you. Let's move on to the next question.",
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, timeoutMessage];
    setMessages(newMessages);
    setIsLoading(true);
    setError(null);

    try {
      // 请求 AI 生成新问题（切题）
      const examinerResponse = await fetchExaminerResponse(newMessages);

      const examinerMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "examiner",
        content: examinerResponse,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, examinerMessage]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to get response. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isSessionEnded, messages, fetchExaminerResponse]);

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <DesktopNav
        active="practice"
        maxWidth="4xl"
        rightContent={
          !isSessionEnded ? (
            <button
              onClick={handleEndSession}
              disabled={isLoading}
              className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {t("practice.endSession")}
            </button>
          ) : undefined
        }
      />

      <div className="hidden sm:block border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
        <div className="mx-auto grid max-w-4xl gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {t("practice.sessionGoal")}
            </p>
            <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
              {t("practice.sessionGoalHint")}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {t("practice.evidenceCollected")}
            </p>
            <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
              {t("practice.candidateAnswers", { count: messages.filter((message) => message.role === "user").length })}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {t("practice.input")}
            </p>
            <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
              {inputMode === "voice" ? t("practice.voiceConversation") : t("practice.textOrDictated")}
            </p>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {t("practice.startingSession")}
              </p>
            </div>
          )}

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

          {/* Error Message */}
          {error && <ChatErrorBanner error={error} />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area or Session End */}
      <div className="border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          {!isSessionEnded ? (
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

              {/* Input based on mode */}
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
                    maxAnswerTime={MAX_ANSWER_TIME}
                    onTimeout={handleTimeout}
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
                  onClick={() => (window.location.href = "/practice")}
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-slate-950 rounded-xl hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 transition-colors"
                >
                  {t("practice.newSession")}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error || t("practice.feedbackError")}
                  </p>
                  <button
                    onClick={() => (window.location.href = "/practice")}
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
          primaryActionHref="/practice/setup"
          primaryActionLabel={t("practice.newSession")}
        />
      )}
    </div>
  );
}
