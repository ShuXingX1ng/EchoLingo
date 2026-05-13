"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getSessions } from "@/lib/history";
import type { SavedSession } from "@/lib/history";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const loaded = getSessions();
      setSessions(loaded);
    } catch {
      // localStorage not available
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession}
        onBack={() => setSelectedSession(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
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
            <h1 className="font-semibold text-gray-900 dark:text-white">
              Practice History
            </h1>
          </div>
          <Link
            href="/practice"
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            New Session
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex gap-1.5 mb-4">
              <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce" />
              <div
                className="w-3 h-3 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0.15s" }}
              />
              <div
                className="w-3 h-3 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0.3s" }}
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading history...
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-6">📝</div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Practice Sessions Yet
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-md">
              Complete your first IELTS Speaking practice session to see your
              history here. Your transcripts and feedback will be saved locally.
            </p>
            <Link
              href="/practice"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              Start Your First Session
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} saved
            </p>
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className="w-full bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(session.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      IELTS Part 1 · {session.messages.length} messages
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1.5 rounded-full text-sm font-semibold">
                      Band {session.feedback.estimatedBand}
                    </div>
                    <span className="text-gray-400 group-hover:text-blue-500 transition-colors">
                      →
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 line-clamp-2">
                  {session.feedback.improvementSuggestions[0] ||
                    "Session completed"}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SessionDetail({
  session,
  onBack,
}: {
  session: SavedSession;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </button>
            <div>
              <h1 className="font-semibold text-gray-900 dark:text-white">
                Session Details
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(session.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-1.5 rounded-full text-sm font-semibold">
            Band {session.feedback.estimatedBand}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Transcript */}
        <section>
          <h2 className="font-medium text-gray-900 dark:text-white mb-4">
            Transcript
          </h2>
          <div className="space-y-3">
            {session.messages.map((message) => (
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
          </div>
        </section>

        {/* Feedback */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-5 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="font-medium text-gray-900 dark:text-white mb-5">
            Feedback
          </h2>
          <div className="space-y-5">
            <FeedbackSection
              title="Fluency and Coherence"
              content={session.feedback.fluencyAndCoherence}
            />
            <FeedbackSection
              title="Lexical Resource"
              content={session.feedback.lexicalResource}
            />
            <FeedbackSection
              title="Grammar Range and Accuracy"
              content={session.feedback.grammarRangeAndAccuracy}
            />
            <FeedbackSection
              title="Pronunciation"
              content={session.feedback.pronunciation}
            />

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                Strengths
              </h3>
              <ul className="space-y-2">
                {session.feedback.strengths.map((item, i) => (
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
                {session.feedback.weaknesses.map((item, i) => (
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
                {session.feedback.improvementSuggestions.map((item, i) => (
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
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {session.feedback.improvedSampleAnswer}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pb-8">
          <Link
            href="/practice"
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
          >
            Start New Session
          </Link>
          <button
            onClick={onBack}
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Back to History
          </button>
        </div>
      </main>
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
