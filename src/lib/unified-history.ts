import type { ChatMessage, SessionFeedback } from "@/types";
import type { SavedSession } from "./history";
import * as localHistory from "./history";
import * as cloudHistory from "./supabase-history";

// Check if user is authenticated
async function isAuthenticated(): Promise<boolean> {
  return cloudHistory.isUserLoggedIn();
}

// Save session (auto-detect local vs cloud)
export async function saveSession(
  messages: ChatMessage[],
  feedback: SessionFeedback,
  mode: string = "ielts_part_1"
): Promise<SavedSession> {
  const isAuthed = await isAuthenticated();

  if (isAuthed) {
    const cloudSession = await cloudHistory.saveSessionToCloud(
      messages,
      feedback,
      mode
    );
    if (cloudSession) {
      // Also save locally as backup
      localHistory.saveSession(messages, feedback);
      return cloudSession;
    }
  }

  // Fallback to local storage
  return localHistory.saveSession(messages, feedback);
}

// Get all sessions (auto-detect local vs cloud)
export async function getSessions(): Promise<SavedSession[]> {
  const isAuthed = await isAuthenticated();

  if (isAuthed) {
    const cloudSessions = await cloudHistory.getSessionsFromCloud();
    if (cloudSessions.length > 0) {
      return cloudSessions;
    }
  }

  // Fallback to local storage
  return localHistory.getSessions();
}

// Get session by ID
export async function getSessionById(
  id: string
): Promise<SavedSession | null> {
  const isAuthed = await isAuthenticated();

  if (isAuthed) {
    const cloudSession = await cloudHistory.getSessionByIdFromCloud(id);
    if (cloudSession) {
      return cloudSession;
    }
  }

  // Fallback to local storage
  return localHistory.getSessionById(id);
}

// Delete session
export async function deleteSession(id: string): Promise<boolean> {
  const isAuthed = await isAuthenticated();

  if (isAuthed) {
    const cloudResult = await cloudHistory.deleteSessionFromCloud(id);
    // Also delete locally
    localHistory.deleteSession(id);
    return cloudResult;
  }

  // Fallback to local storage
  return localHistory.deleteSession(id);
}

// Clear all sessions
export async function clearAllSessions(): Promise<boolean> {
  const isAuthed = await isAuthenticated();

  if (isAuthed) {
    const cloudResult = await cloudHistory.clearAllSessionsFromCloud();
    localHistory.clearAllSessions();
    return cloudResult;
  }

  // Fallback to local storage
  localHistory.clearAllSessions();
  return true;
}

// Get storage usage (local only)
export function getStorageUsage(): { used: number; total: number } {
  return localHistory.getStorageUsage();
}

// Migrate local sessions to cloud
export async function migrateLocalToCloud(): Promise<{
  success: number;
  failed: number;
  total: number;
}> {
  const localSessions = localHistory.getSessions();

  if (localSessions.length === 0) {
    return { success: 0, failed: 0, total: 0 };
  }

  const result = await cloudHistory.migrateLocalSessionsToCloud(localSessions);
  return { ...result, total: localSessions.length };
}
