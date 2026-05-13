"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { ChatMessage, SessionFeedback } from "@/types";
import { saveSession } from "@/lib/history";

const INITIAL_QUESTION =
  "Let's talk about your hometown. Where is your hometown?";

export default function PracticePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, feedback]);

  useEffect(() => {
    const firstQuestion: ChatMessage = {
      id: "1",
      role: "examiner",
      content: INITIAL_QUESTION,
      createdAt: new Date().toISOString(),
    };
    setMessages([firstQuestion]);
  }, []);

  const fetchExaminerResponse = async (currentMessages: ChatMessage[]) => {
    const response = await fetch("/api/examiner", {
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
      setFeedback(feedbackData);
      saveSession(finalMessages, feedbackData);
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
              ← Home
            </Link>
            <div>
              <h1 className="font-semibold text-gray-900 dark:text-white">
                IELTS Speaking Practice
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Part 1 - AI Examiner
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/history"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              History
            </Link>
            {!isSessionEnded && (
              <button
                onClick={handleEndSession}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                End Session
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
                Starting your practice session...
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-bl-md shadow-sm"
                }`}
              >
                {message.role === "examiner" && (
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Examiner
                  </p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200 dark:border-gray-700 shadow-sm">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Examiner
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex justify-center px-4">
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
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type your answer..."
                className="flex-1 px-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </div>
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
                    Generating your feedback...
                  </p>
                </div>
              ) : feedback ? (
                <button
                  onClick={() => (window.location.href = "/practice")}
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Start New Session
                </button>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error || "Failed to generate feedback."}
                  </p>
                  <button
                    onClick={() => (window.location.href = "/practice")}
                    className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    Try Again
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
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Session Feedback
            </h2>
            <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-1.5 rounded-full text-sm font-semibold">
              Band {feedback.estimatedBand}
            </div>
          </div>

          <div className="space-y-5">
            <FeedbackSection
              title="Fluency and Coherence"
              content={feedback.fluencyAndCoherence}
            />
            <FeedbackSection
              title="Lexical Resource"
              content={feedback.lexicalResource}
            />
            <FeedbackSection
              title="Grammar Range and Accuracy"
              content={feedback.grammarRangeAndAccuracy}
            />
            <FeedbackSection
              title="Pronunciation"
              content={feedback.pronunciation}
            />

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                Strengths
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
                Areas for Improvement
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
                Improvement Suggestions
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
                Improved Sample Answer
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {feedback.improvedSampleAnswer}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => (window.location.href = "/practice")}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              Start New Session
            </button>
            <button
              onClick={() => (window.location.href = "/history")}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              View History
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
