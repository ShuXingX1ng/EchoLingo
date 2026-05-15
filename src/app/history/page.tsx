"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getSessions, deleteSession, clearAllSessions } from "@/lib/history";
import type { SavedSession } from "@/lib/history";
import MuteButton from "@/components/MuteButton";
import BackupModal from "@/components/BackupModal";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "band">("date");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

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

  // 筛选和排序
  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    // 搜索筛选
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.feedback.improvementSuggestions.some((item) =>
            item.toLowerCase().includes(query)
          ) ||
          s.feedback.strengths.some((item) =>
            item.toLowerCase().includes(query)
          ) ||
          s.feedback.weaknesses.some((item) =>
            item.toLowerCase().includes(query)
          )
      );
    }

    // 排序
    if (sortBy === "band") {
      result.sort(
        (a, b) => b.feedback.estimatedBand - a.feedback.estimatedBand
      );
    } else {
      result.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return result;
  }, [sessions, searchQuery, sortBy]);

  // 删除单个会话
  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this session?")) {
      deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (
      confirm(
        `Are you sure you want to delete ${selectedIds.size} sessions?`
      )
    ) {
      selectedIds.forEach((id) => deleteSession(id));
      setSessions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSessions.map((s) => s.id)));
    }
  };

  // 切换选中状态
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 导出数据
  const handleExport = (format: "json" | "csv") => {
    const data = isSelectMode
      ? sessions.filter((s) => selectedIds.has(s.id))
      : sessions;

    if (format === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, `echolingo-sessions-${Date.now()}.json`);
    } else {
      const csv = convertToCSV(data);
      const blob = new Blob([csv], { type: "text/csv" });
      downloadBlob(blob, `echolingo-sessions-${Date.now()}.csv`);
    }
  };

  // 清空所有数据
  const handleClearAll = () => {
    if (
      confirm(
        "Are you sure you want to delete ALL sessions? This cannot be undone."
      )
    ) {
      clearAllSessions();
      setSessions([]);
      setSelectedIds(new Set());
    }
  };

  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession}
        onBack={() => setSelectedSession(null)}
        onDelete={() => {
          handleDelete(selectedSession.id);
          setSelectedSession(null);
        }}
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
          <div className="flex items-center gap-3">
            <MuteButton />
            <Link
              href="/stats"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Stats
            </Link>
            <Link
              href="/practice"
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              New Session
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex gap-1.5 mb-4">
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
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading history...
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="text-6xl mb-6">📝</div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Practice Sessions Yet
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-md">
              Complete your first IELTS Speaking practice session to see your
              history here. Your transcripts and feedback will be saved locally.
            </p>
            <Link
              href="/practice"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Your First Session
            </Link>
          </div>
        ) : (
          <>
            {/* 工具栏 */}
            <div className="mb-6 space-y-4 animate-fade-in">
              {/* 搜索框 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search feedback..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* 操作栏 */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {/* 排序 */}
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as "date" | "band")
                    }
                    className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
                  >
                    <option value="date">Newest First</option>
                    <option value="band">Highest Band</option>
                  </select>

                  {/* 选择模式 */}
                  <button
                    onClick={() => {
                      setIsSelectMode(!isSelectMode);
                      setSelectedIds(new Set());
                    }}
                    className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                      isSelectMode
                        ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                        : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    {isSelectMode ? "Cancel" : "Select"}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* 备份 */}
                  <button
                    onClick={() => setIsBackupModalOpen(true)}
                    className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Backup
                  </button>

                  {/* 导出 */}
                  <div className="relative group">
                    <button className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      Export
                    </button>
                    <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <button
                        onClick={() => handleExport("json")}
                        className="w-full px-4 py-2 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
                      >
                        Export JSON
                      </button>
                      <button
                        onClick={() => handleExport("csv")}
                        className="w-full px-4 py-2 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-b-lg"
                      >
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {/* 清空 */}
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* 批量操作栏 */}
              {isSelectMode && (
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {selectedIds.size === filteredSessions.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedIds.size} selected
                    </span>
                  </div>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete Selected
                  </button>
                </div>
              )}
            </div>

            {/* 会话列表 */}
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {filteredSessions.length} session
                {filteredSessions.length !== 1 ? "s" : ""}
                {searchQuery && ` found for "${searchQuery}"`}
              </p>

              {filteredSessions.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">
                    No sessions match your search.
                  </p>
                </div>
              ) : (
                filteredSessions.map((session, index) => (
                  <div
                    key={session.id}
                    className="stagger-item"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div
                      className={`w-full bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-5 border transition-all text-left group ${
                        isSelectMode && selectedIds.has(session.id)
                          ? "border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800"
                          : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* 选择框 */}
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(session.id)}
                            onChange={() => toggleSelect(session.id)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                        )}

                        <button
                          onClick={() =>
                            isSelectMode
                              ? toggleSelect(session.id)
                              : setSelectedSession(session)
                          }
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {new Date(
                                  session.createdAt
                                ).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                IELTS Part 1 · {session.messages.length}{" "}
                                messages
                              </p>
                            </div>
                            <div className="flex items-center gap-3 ml-4">
                              <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1.5 rounded-full text-sm font-semibold group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                                Band {session.feedback.estimatedBand}
                              </div>
                              {!isSelectMode && (
                                <span className="text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all">
                                  →
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 line-clamp-2">
                            {session.feedback.improvementSuggestions[0] ||
                              "Session completed"}
                          </p>
                        </button>

                        {/* 删除按钮 */}
                        {!isSelectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(session.id);
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete session"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </main>

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onImportComplete={() => {
          setSessions(getSessions());
        }}
      />
    </div>
  );
}

function SessionDetail({
  session,
  onBack,
  onDelete,
}: {
  session: SavedSession;
  onBack: () => void;
  onDelete: () => void;
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
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-1.5 rounded-full text-sm font-semibold">
              Band {session.feedback.estimatedBand}
            </div>
            <button
              onClick={onDelete}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Delete session"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
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

// 工具函数：下载 Blob
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 工具函数：转换为 CSV
function convertToCSV(sessions: SavedSession[]): string {
  const headers = [
    "ID",
    "Date",
    "Band Score",
    "Messages",
    "Fluency",
    "Vocabulary",
    "Grammar",
    "Strengths",
    "Weaknesses",
    "Suggestions",
  ];

  const rows = sessions.map((s) => [
    s.id,
    new Date(s.createdAt).toLocaleDateString("en-US"),
    s.feedback.estimatedBand,
    s.messages.length,
    `"${s.feedback.fluencyAndCoherence.replace(/"/g, '""')}"`,
    `"${s.feedback.lexicalResource.replace(/"/g, '""')}"`,
    `"${s.feedback.grammarRangeAndAccuracy.replace(/"/g, '""')}"`,
    `"${s.feedback.strengths.join("; ").replace(/"/g, '""')}"`,
    `"${s.feedback.weaknesses.join("; ").replace(/"/g, '""')}"`,
    `"${s.feedback.improvementSuggestions.join("; ").replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
