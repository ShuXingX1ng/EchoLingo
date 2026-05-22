"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getErrorLogs,
  clearErrorLogs,
  deleteErrorLog,
  exportErrorLogs,
  getErrorSummary,
  formatTimestamp,
  getTypeColor,
  type ErrorLogEntry,
} from "@/lib/error-logger";

export default function DebugPage() {
  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [summary, setSummary] = useState<ReturnType<typeof getErrorSummary> | null>(null);
  const [filter, setFilter] = useState<ErrorLogEntry["type"] | "all">("all");
  const [selectedLog, setSelectedLog] = useState<ErrorLogEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(() => {
    setIsLoading(true);
    const allLogs = getErrorLogs();
    setLogs(allLogs);
    setSummary(getErrorSummary());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all error logs?")) {
      clearErrorLogs();
      loadLogs();
    }
  };

  const handleDelete = (id: string) => {
    deleteErrorLog(id);
    loadLogs();
    if (selectedLog?.id === id) {
      setSelectedLog(null);
    }
  };

  const filteredLogs = filter === "all" ? logs : logs.filter((l) => l.type === filter);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="flex gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Home
            </Link>
            <h1 className="font-semibold text-gray-900 dark:text-white">
              Debug Logs
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6 animate-fade-in">
            <StatCard label="Total" value={summary.total} />
            <StatCard label="Errors" value={summary.errors} color="text-red-600" />
            <StatCard label="Warnings" value={summary.warnings} color="text-yellow-600" />
            <StatCard label="API" value={summary.api} color="text-blue-600" />
            <StatCard label="Unhandled" value={summary.unhandled} color="text-purple-600" />
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-card-in">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
                <option value="api">API</option>
                <option value="unhandled">Unhandled</option>
              </select>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {filteredLogs.length} logs
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportErrorLogs}
                disabled={logs.length === 0}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export
              </button>
              <button
                onClick={handleClearAll}
                disabled={logs.length === 0}
                className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear All
              </button>
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-4">✓</div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Error Logs
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {filter === "all"
                  ? "Your application is running smoothly!"
                  : `No ${filter} logs found.`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                    selectedLog?.id === log.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                  onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${getTypeColor(log.type)}`}
                        >
                          {log.type}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {log.message}
                      </p>
                      {log.url && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                          {log.url}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(log.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  {selectedLog?.id === log.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                      <div className="space-y-3">
                        <DetailRow label="ID" value={log.id} />
                        <DetailRow label="Timestamp" value={log.timestamp} />
                        {log.stack && (
                          <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Stack Trace
                            </label>
                            <pre className="mt-1 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                              {log.stack}
                            </pre>
                          </div>
                        )}
                        {log.metadata && (
                          <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Metadata
                            </label>
                            <pre className="mt-1 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-gray-900 dark:text-white",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <p className="text-sm text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
