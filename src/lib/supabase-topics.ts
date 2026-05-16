import { createClient } from "./supabase";
import { TOPICS, type Topic } from "./topics";

export interface DbTopic {
  id: string;
  name: string;
  category: string;
  part1_questions: string[];
  part2_cue_card: string;
  part3_questions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Convert DB topic to app Topic format
function dbToTopic(db: DbTopic): Topic {
  return {
    id: db.id,
    name: db.name,
    category: db.category,
    part1Questions: db.part1_questions,
    part2CueCard: db.part2_cue_card,
    part3Questions: db.part3_questions,
  };
}

// Fetch all active topics from DB, fallback to local
export async function fetchTopics(): Promise<Topic[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true });

    if (error || !data || data.length === 0) {
      return TOPICS; // fallback to local
    }

    return (data as DbTopic[]).map(dbToTopic);
  } catch {
    return TOPICS;
  }
}

// Fetch a single topic by ID
export async function fetchTopicById(id: string): Promise<Topic | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return TOPICS.find((t) => t.id === id) || null;
    }

    return dbToTopic(data as DbTopic);
  } catch {
    return TOPICS.find((t) => t.id === id) || null;
  }
}

// Create a new topic (admin only)
export async function createTopic(topic: Omit<DbTopic, "created_at" | "updated_at">): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("topics").insert(topic);
  return !error;
}

// Update an existing topic (admin only)
export async function updateTopic(
  id: string,
  updates: Partial<Omit<DbTopic, "id" | "created_at" | "updated_at">>
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("topics")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

// Delete a topic (soft delete by setting is_active = false)
export async function deleteTopic(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("topics")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}
