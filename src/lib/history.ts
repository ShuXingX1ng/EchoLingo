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

export function saveSession(
  messages: ChatMessage[],
  feedback: SessionFeedback
): SavedSession {
  const session: SavedSession = {
    id: Date.now().toString(),
    mode: "ielts_part_1",
    messages,
    feedback,
    createdAt: messages[0]?.createdAt || new Date().toISOString(),
    endedAt: new Date().toISOString(),
  };

  const sessions = getSessions();
  sessions.unshift(session);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

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
