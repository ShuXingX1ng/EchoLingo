"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getSessions, deleteSession, clearAllSessions } from "@/lib/history";
import type { SavedSession } from "@/lib/history";
import BackupModal from "@/components/BackupModal";
import RecordingsList from "@/components/RecordingsList";
import PersonalizedSuggestions from "@/components/PersonalizedSuggestions";
import { FeedbackReview } from "@/components/FeedbackPanel";
import DesktopNav from "@/components/DesktopNav";
import { useTranslation } from "@/lib/i18n";

export default function HistoryPage() {
  const { t } = useTranslation();
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
    if (confirm(t("history.confirmDelete"))) {
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
        t("history.confirmDeleteMultiple", { count: selectedIds.size })
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
    if (confirm(t("history.confirmDeleteAll"))) {
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="history" />

      {/* Content */}
      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex gap-1.5 mb-4">
              <div className="w-3 h-3 bg-slate-900 rounded-full animate-bounce" />
              <div
                className="w-3 h-3 bg-slate-900 rounded-full animate-bounce"
                style={{ animationDelay: "0.15s" }}
              />
              <div
                className="w-3 h-3 bg-slate-900 rounded-full animate-bounce"
                style={{ animationDelay: "0.3s" }}
              />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("history.loading")}
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="text-6xl mb-6">📝</div>
            <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              {t("history.emptyTitle")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-md">
              {t("history.emptyDesc")}
            </p>
            <Link
              href="/practice"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-slate-950 dark:bg-white dark:text-slate-950 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("history.emptyCta")}
            </Link>
          </div>
        ) : (
          <>
            {/* Personalized Suggestions */}
            <div className="mb-6 animate-fade-in">
              <PersonalizedSuggestions />
            </div>

            {/* 工具栏 */}
            <div className="mb-6 space-y-4 animate-fade-in">
              {/* 搜索框 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder={t("history.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
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
                    className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
                  >
                    <option value="date">{t("history.sortNewest")}</option>
                    <option value="band">{t("history.sortHighest")}</option>
                  </select>

                  {/* 选择模式 */}
                  <button
                    onClick={() => {
                      setIsSelectMode(!isSelectMode);
                      setSelectedIds(new Set());
                    }}
                    className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                      isSelectMode
                        ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white"
                        : "border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {isSelectMode ? t("history.cancel") : t("history.select")}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* 备份 */}
                  <button
                    onClick={() => setIsBackupModalOpen(true)}
                    className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t("history.backup")}
                  </button>

                  {/* 导出 */}
                  <div className="relative group">
                    <button className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      {t("history.export")}
                    </button>
                    <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <button
                        onClick={() => handleExport("json")}
                        className="w-full px-4 py-2 text-xs text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-t-lg"
                      >
                        {t("history.exportJson")}
                      </button>
                      <button
                        onClick={() => handleExport("csv")}
                        className="w-full px-4 py-2 text-xs text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-b-lg"
                      >
                        {t("history.exportCsv")}
                      </button>
                    </div>
                  </div>

                  {/* 清空 */}
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    {t("history.clearAll")}
                  </button>
                </div>
              </div>

              {/* 批量操作栏 */}
              {isSelectMode && (
                <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-slate-900 dark:text-white hover:underline"
                    >
                      {selectedIds.size === filteredSessions.length
                        ? t("history.deselectAll")
                        : t("history.selectAll")}
                    </button>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t("history.selected", { count: selectedIds.size })}
                    </span>
                  </div>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 bg-white dark:bg-slate-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("history.deleteSelected")}
                  </button>
                </div>
              )}
            </div>

            {/* 会话列表 */}
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {searchQuery
                  ? t("history.sessionsFound", {
                      count: filteredSessions.length,
                      query: searchQuery,
                    })
                  : t("history.sessions", {
                      count: filteredSessions.length,
                    })}
              </p>

              {filteredSessions.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 dark:text-slate-400">
                    {t("history.noMatch")}
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
                      className={`w-full bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border transition-all text-left group ${
                        isSelectMode && selectedIds.has(session.id)
                          ? "border-slate-900 dark:border-white ring-2 ring-slate-200 dark:ring-slate-700"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* 选择框 */}
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(session.id)}
                            onChange={() => toggleSelect(session.id)}
                            className="w-4 h-4 text-slate-900 rounded focus:ring-slate-900"
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
                              <p className="text-sm font-medium text-slate-900 dark:text-white">
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
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {formatMode(session.mode)} ·{" "}
                                {session.messages.length} messages
                              </p>
                            </div>
                            <div className="flex items-center gap-3 ml-4">
                              <div className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-1.5 rounded-full text-sm font-semibold group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/50 transition-colors">
                                {t("history.band", {
                                  score: session.feedback.estimatedBand,
                                })}
                              </div>
                              {!isSelectMode && (
                                <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white group-hover:translate-x-1 transition-all">
                                  →
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                              <span className="font-medium">
                                {t("history.focus")}{" "}
                              </span>
                              {firstFeedbackItem(session.feedback.weaknesses, t("history.noFeedback"))}
                            </p>
                            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100">
                              <span className="font-medium">
                                {t("history.next")}{" "}
                              </span>
                              {firstFeedbackItem(session.feedback.improvementSuggestions, t("history.noFeedback"))}
                            </p>
                          </div>
                        </button>

                        {/* 删除按钮 */}
                        {!isSelectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(session.id);
                            }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title={t("history.confirmDelete")}
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
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="history" />

      {/* Sticky sub-header for back navigation */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200 dark:border-white/10 dark:bg-slate-950/90 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← {t("history.back")}
            </button>
            <div>
              <h1 className="font-semibold text-slate-900 dark:text-white">
                {t("history.details")}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
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
            <div className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 px-4 py-1.5 rounded-full text-sm font-semibold">
              {t("history.band", { score: session.feedback.estimatedBand })}
            </div>
            <button
              onClick={onDelete}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title={t("history.confirmDelete")}
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
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Transcript */}
        <section>
          <h2 className="font-medium text-slate-900 dark:text-white mb-4">
            {t("history.transcript")}
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
                      ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950 rounded-br-md"
                      : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-md shadow-sm"
                  }`}
                >
                  {message.role === "examiner" && (
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {t("history.examiner")}
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

        <section className="bg-white dark:bg-slate-800 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
          <RecordingsList sessionId={session.id} />
        </section>

        <FeedbackReview
          feedback={session.feedback}
          title={t("feedback.studyReview")}
          primaryActionHref="/practice/setup"
          primaryActionLabel={t("history.startNew")}
          containerClassName="max-w-5xl shadow-sm"
        />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pb-8">
          <Link
            href="/practice"
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-slate-950 dark:bg-white dark:text-slate-950 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            {t("history.startNew")}
          </Link>
          <button
            onClick={onBack}
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("history.backToHistory")}
          </button>
        </div>
      </main>
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

function firstFeedbackItem(items: string[], fallback: string) {
  return items[0] || fallback;
}

function formatMode(mode: string) {
  const labels: Record<string, string> = {
    ielts_part_1: "IELTS Part 1",
    ielts_part_2: "IELTS Part 2",
    ielts_part_3: "IELTS Part 3",
    part1: "IELTS Part 1",
    part2: "IELTS Part 2",
    part3: "IELTS Part 3",
    full: "Full Speaking Test",
  };

  return labels[mode] ?? "IELTS Practice";
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
