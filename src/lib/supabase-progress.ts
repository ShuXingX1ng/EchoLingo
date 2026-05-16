import { createClient } from "./supabase";

export interface LearningProgress {
  id: string;
  user_id: string;
  topic_id: string;
  part: "part1" | "part2" | "part3";
  best_band: number;
  attempt_count: number;
  last_attempt_at: string;
  created_at: string;
  updated_at: string;
}

// Record a practice attempt
export async function recordProgress(
  userId: string,
  topicId: string,
  part: string,
  band: number
): Promise<void> {
  const supabase = createClient();

  // Try to update existing record
  const { data: existing } = await supabase
    .from("learning_progress")
    .select("id, best_band, attempt_count")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .eq("part", part)
    .single();

  if (existing) {
    const newBestBand = Math.max(existing.best_band || 0, band);
    await supabase
      .from("learning_progress")
      .update({
        best_band: newBestBand,
        attempt_count: existing.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("learning_progress").insert({
      user_id: userId,
      topic_id: topicId,
      part,
      best_band: band,
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
    });
  }
}

// Get all progress for a user
export async function getUserProgress(userId: string): Promise<LearningProgress[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("learning_progress")
    .select("*")
    .eq("user_id", userId)
    .order("last_attempt_at", { ascending: false });

  if (error || !data) return [];
  return data as LearningProgress[];
}

// Get progress summary: average band per skill dimension
export async function getProgressSummary(
  userId: string
): Promise<{
  totalAttempts: number;
  averageBand: number;
  topicCount: number;
  byTopic: Record<string, { bestBand: number; attempts: number }>;
}> {
  const progress = await getUserProgress(userId);

  if (progress.length === 0) {
    return { totalAttempts: 0, averageBand: 0, topicCount: 0, byTopic: {} };
  }

  const totalAttempts = progress.reduce((sum, p) => sum + p.attempt_count, 0);
  const totalBand = progress.reduce((sum, p) => sum + (p.best_band || 0) * p.attempt_count, 0);
  const averageBand = totalAttempts > 0 ? totalBand / totalAttempts : 0;

  const byTopic: Record<string, { bestBand: number; attempts: number }> = {};
  const topicSet = new Set<string>();

  for (const p of progress) {
    topicSet.add(p.topic_id);
    const existing = byTopic[p.topic_id];
    if (!existing || (p.best_band || 0) > existing.bestBand) {
      byTopic[p.topic_id] = {
        bestBand: Math.max(existing?.bestBand || 0, p.best_band || 0),
        attempts: (existing?.attempts || 0) + p.attempt_count,
      };
    }
  }

  return {
    totalAttempts,
    averageBand: Math.round(averageBand * 10) / 10,
    topicCount: topicSet.size,
    byTopic,
  };
}
