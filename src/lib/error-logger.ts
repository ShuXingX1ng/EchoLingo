export type ErrorLogEntry = {
  id: string;
  timestamp: string;
  type: "error" | "warning" | "api" | "unhandled";
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

const STORAGE_KEY = "echolingo_error_logs";
const MAX_LOGS = 100;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function addErrorLog(
  type: ErrorLogEntry["type"],
  message: string,
  error?: Error | unknown,
  metadata?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;

  const entry: ErrorLogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    type,
    message,
    url: window.location.href,
    userAgent: navigator.userAgent,
    metadata,
  };

  if (error instanceof Error) {
    entry.stack = error.stack;
  }

  try {
    const logs = getErrorLogs();
    logs.unshift(entry);

    if (logs.length > MAX_LOGS) {
      logs.length = MAX_LOGS;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function getErrorLogs(): ErrorLogEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function clearErrorLogs(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteErrorLog(id: string): void {
  const logs = getErrorLogs().filter((log) => log.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

export function exportErrorLogs(): void {
  const logs = getErrorLogs();
  if (logs.length === 0) return;

  const blob = new Blob([JSON.stringify(logs, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `echolingo-error-logs-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function setupGlobalErrorHandlers(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleError = (event: ErrorEvent) => {
    addErrorLog("unhandled", event.message, event.error, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const message =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);

    addErrorLog("unhandled", `Unhandled Promise Rejection: ${message}`, event.reason);
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}

export function getErrorSummary(): {
  total: number;
  errors: number;
  warnings: number;
  api: number;
  unhandled: number;
  recent: ErrorLogEntry[];
} {
  const logs = getErrorLogs();

  return {
    total: logs.length,
    errors: logs.filter((l) => l.type === "error").length,
    warnings: logs.filter((l) => l.type === "warning").length,
    api: logs.filter((l) => l.type === "api").length,
    unhandled: logs.filter((l) => l.type === "unhandled").length,
    recent: logs.slice(0, 10),
  };
}

export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getTypeColor(type: ErrorLogEntry["type"]): string {
  switch (type) {
    case "error":
      return "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30";
    case "warning":
      return "text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30";
    case "api":
      return "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30";
    case "unhandled":
      return "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30";
    default:
      return "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30";
  }
}
