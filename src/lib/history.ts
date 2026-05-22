import type { ChatMessage, SessionFeedback } from "@/types";

export type SavedSession = {
  id: string;
  mode: string;
  messages: ChatMessage[];
  feedback: SessionFeedback;
  createdAt: string;
  endedAt: string;
};

const STORAGE_KEY = "echolingo_sessions";
const MAX_SESSIONS = 50; // 最大保存会话数

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveSession(
  messages: ChatMessage[],
  feedback: SessionFeedback,
  mode: string = "ielts_part_1"
): SavedSession {
  const session: SavedSession = {
    id: createSessionId(),
    mode,
    messages,
    feedback,
    createdAt: messages[0]?.createdAt || new Date().toISOString(),
    endedAt: new Date().toISOString(),
  };

  const sessions = getSessions();
  sessions.unshift(session);

  // 限制保存数量，删除旧会话
  if (sessions.length > MAX_SESSIONS) {
    sessions.length = MAX_SESSIONS;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    // 如果存储空间不足，删除一半旧会话后重试
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      sessions.length = Math.floor(sessions.length / 2);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  }

  return session;
}

export function getSessions(): SavedSession[] {
  if (typeof window === "undefined") return [];

  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getSessionById(id: string): SavedSession | null {
  const sessions = getSessions();
  return sessions.find((s) => s.id === id) || null;
}

export function deleteSession(id: string): boolean {
  const sessions = getSessions();
  const index = sessions.findIndex((s) => s.id === id);

  if (index === -1) return false;

  sessions.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return true;
}

export function clearAllSessions(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getStorageUsage(): { used: number; total: number } {
  if (typeof window === "undefined") return { used: 0, total: 0 };

  let used = 0;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    used = data ? new Blob([data]).size : 0;
  } catch {
    // ignore
  }

  // localStorage 通常限制 5-10MB
  return { used, total: 5 * 1024 * 1024 };
}
