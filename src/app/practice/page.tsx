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

const INITIAL_QUESTIONS: Record<string, string> = {
  part1: "Let's talk about your hometown. Where is your hometown?",
  part2: "I'm going to give you a topic to talk about for 1-2 minutes. You have 1 minute to prepare. You can make notes if you wish.\n\nDescribe your hometown. You should say:\n- where it is\n- what it is known for\n- what you like and dislike about it\n\nAnd explain why it is special to you.\n\nAlright, you can start speaking now. You have 1-2 minutes.",
  part3: "Let's discuss some broader questions related to urbanization and city life. How do cities in your country differ from each other?",
  full: "Good morning/afternoon. My name is [Examiner]. Can I have your full name, please?\n\nNow I'd like to ask you some questions about your hometown. Where is your hometown?",
};

const MAX_ANSWER_TIME = 60; // 最大回答时间（秒）

export default function PracticePageWrapper() {
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastAudioBlobRef = useRef<Blob | null>(null);
  const lastUserMessageRef = useRef<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, feedback]);

  useEffect(() => {
    const initialQuestion = INITIAL_QUESTIONS[practiceMode] || INITIAL_QUESTIONS.part1;
    const firstQuestion: ChatMessage = {
      id: "1",
      role: "examiner",
      content: initialQuestion,
      createdAt: new Date().toISOString(),
    };
    setMessages([firstQuestion]);
  }, [practiceMode]);

  const fetchExaminerResponse = async (currentMessages: ChatMessage[]) => {
    const response = await fetch("/api/examiner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: practiceMode,
        topic: topicId,
        messages: currentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error ||
          "Failed to get examiner response. Please check your API configuration."
      );
    }

    const data = await response.json();
    return data.message as string;
  };

  const fetchFeedback = async (currentMessages: ChatMessage[]) => {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ielts_part_1",
        messages: currentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error ||
          "Failed to generate feedback. Please check your API configuration."
      );
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
      const feedbackData = await fetchFeedback(finalMessages);

      // Perform pronunciation assessment if audio is available
      if (lastAudioBlobRef.current && lastUserMessageRef.current) {
        const pronunciationResult = await fetchPronunciationAssessment(
          lastAudioBlobRef.current,
          lastUserMessageRef.current
        );

        if (pronunciationResult) {
          feedbackData.pronunciationAssessment = pronunciationResult;
          // Update the pronunciation feedback text with real assessment
          feedbackData.pronunciation = pronunciationResult.summary;
        }
      }

      setFeedback(feedbackData);
      saveSession(finalMessages, feedbackData);

      // Update error patterns for personalized learning
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

        // Record learning progress
        if (topicId && feedbackData.estimatedBand) {
          recordProgress(user.id, topicId, practiceMode, feedbackData.estimatedBand);
        }
      }
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
                {t("practice.title")}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("practice.part1")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MuteButton />
            <Link
              href="/history"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("nav.history")}
            </Link>
            <Link
              href="/stats"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("nav.stats")}
            </Link>
            {!isSessionEnded && (
              <button
                onClick={handleEndSession}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {t("practice.endSession")}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
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
                    <div
                      className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                  <span className="text-xs text-blue-500 dark:text-blue-400">{t("practice.thinking")}</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex justify-center px-4 animate-message-in">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 max-w-md">
                <div className="flex items-start gap-3">
                  <span className="text-red-500 mt-0.5">⚠</span>
                  <div>
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                    <p className="text-xs text-red-500 dark:text-red-500 mt-1">
                      Make sure your .env.local file is configured correctly.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area or Session End */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="max-w-3xl mx-auto">
          {!isSessionEnded ? (
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
                    maxAnswerTime={MAX_ANSWER_TIME}
                    onTimeout={handleTimeout}
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
                    <div
                      className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.15s" }}
                    />
                    <div
                      className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.3s" }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("practice.generating")}
                  </p>
                </div>
              ) : feedback ? (
                <button
                  onClick={() => (window.location.href = "/practice")}
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
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
              {t("feedback.title")}
            </h2>
            <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-1.5 rounded-full text-sm font-semibold">
              Band {feedback.estimatedBand}
            </div>
          </div>

          <div className="space-y-5">
            <FeedbackSection
              title={t("feedback.fluency")}
              content={feedback.fluencyAndCoherence}
            />
            <FeedbackSection
              title={t("feedback.vocabulary")}
              content={feedback.lexicalResource}
            />
            <FeedbackSection
              title={t("feedback.grammar")}
              content={feedback.grammarRangeAndAccuracy}
            />
            <FeedbackSection
              title={t("feedback.pronunciation")}
              content={feedback.pronunciation}
            />

            {feedback.pronunciationAssessment && (
              <PronunciationFeedback assessment={feedback.pronunciationAssessment} />
            )}

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                {t("feedback.strengths")}
              </h3>
              <ul className="space-y-2">
                {feedback.strengths.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                  >
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
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                  >
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
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                  >
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
              onClick={() => (window.location.href = "/practice")}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              {t("practice.newSession")}
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

function FeedbackSection({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <div>
      <h3 className="font-medium text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
        {content}
      </p>
    </div>
  );
}
