import { createClient } from "./supabase";
import type { ChatMessage, SessionFeedback } from "@/types";
import type { SavedSession } from "./history";

// Database session type (matches Supabase table structure)
type DbSession = {
  id: string;
  user_id: string;
  mode: string;
  messages: ChatMessage[];
  feedback: SessionFeedback;
  created_at: string;
  ended_at: string | null;
  topic: string | null;
};

// Convert database session to app session format
function dbSessionToSavedSession(db: DbSession): SavedSession {
  return {
    id: db.id,
    mode: db.mode,
    messages: db.messages,
    feedback: db.feedback,
    createdAt: db.created_at,
    endedAt: db.ended_at || db.created_at,
  };
}

// Get current user ID
async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// Save session to Supabase
export async function saveSessionToCloud(
  messages: ChatMessage[],
  feedback: SessionFeedback,
  mode: string = "ielts_part_1"
): Promise<SavedSession | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const supabase = createClient();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      mode,
      messages,
      feedback,
      created_at: messages[0]?.createdAt || new Date().toISOString(),
      ended_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save session to cloud:", error);
    return null;
  }

  return dbSessionToSavedSession(data);
}

// Get all sessions from Supabase
export async function getSessionsFromCloud(): Promise<SavedSession[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to fetch sessions from cloud:", error);
    return [];
  }

  return (data || []).map(dbSessionToSavedSession);
}

// Get single session from Supabase
export async function getSessionByIdFromCloud(
  id: string
): Promise<SavedSession | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const supabase = createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return dbSessionToSavedSession(data);
}

// Delete session from Supabase
export async function deleteSessionFromCloud(id: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const supabase = createClient();

  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  return !error;
}

// Clear all sessions from Supabase
export async function clearAllSessionsFromCloud(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const supabase = createClient();

  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("user_id", userId);

  return !error;
}

// Migrate local sessions to Supabase
export async function migrateLocalSessionsToCloud(
  localSessions: SavedSession[]
): Promise<{ success: number; failed: number }> {
  const userId = await getCurrentUserId();
  if (!userId) return { success: 0, failed: localSessions.length };

  const supabase = createClient();
  let success = 0;
  let failed = 0;

  for (const session of localSessions) {
    // Don't pass local ID - let Supabase generate a proper UUID
    const { error } = await supabase.from("sessions").insert({
      user_id: userId,
      mode: session.mode,
      messages: session.messages,
      feedback: session.feedback,
      created_at: session.createdAt,
      ended_at: session.endedAt,
    });

    if (error) {
      console.error("Migration error for session:", session.id, error);
      failed++;
    } else {
      success++;
    }
  }

  return { success, failed };
}

// Check if user is logged in
export async function isUserLoggedIn(): Promise<boolean> {
  const userId = await getCurrentUserId();
  return userId !== null;
}
