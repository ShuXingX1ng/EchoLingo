// Learning plan generation based on Supabase data

import { createClient } from "./supabase";
import { TOPICS } from "./topics";
import { getUserProgress, type LearningProgress } from "./supabase-progress";

export interface DailyTask {
  id: string;
  type: "practice" | "review";
  title: string;
  description: string;
  reason: string;
  topicId?: string;
  part?: "part1" | "part2" | "part3";
  targetCount?: number;
  status: "pending" | "completed";
  link: string;
}

interface SessionRecord {
  mode: string;
  created_at: string;
  feedback: {
    estimatedBand?: number;
  };
}

// Get today's date string for comparison
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

// Check if a session happened today
function isSessionToday(createdAt: string): boolean {
  return createdAt.startsWith(getTodayString());
}

// Get user's recent sessions from Supabase
async function getRecentSessions(userId: string): Promise<SessionRecord[]> {
  const supabase = createClient();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from("sessions")
    .select("mode, created_at, feedback")
    .eq("user_id", userId)
    .gte("created_at", sevenDaysAgo.toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}

// Find unpracticed topics
function getUnpracticedTopics(progress: LearningProgress[]): string[] {
  const practicedIds = new Set(progress.map((p) => p.topic_id));
  return TOPICS.filter((t) => !practicedIds.has(t.id)).map((t) => t.id);
}

// Find low score topics (band < 6.0)
function getLowScoreTopics(progress: LearningProgress[]): { topicId: string; part: string; band: number }[] {
  const topicBest: Record<string, { part: string; band: number }> = {};

  for (const p of progress) {
    const key = `${p.topic_id}_${p.part}`;
    const existing = topicBest[key];
    if (!existing || p.best_band < existing.band) {
      topicBest[key] = { part: p.part, band: p.best_band };
    }
  }

  return Object.entries(topicBest)
    .filter(([, val]) => val.band < 6.0)
    .map(([key, val]) => ({
      topicId: key.split("_")[0],
      part: val.part,
      band: val.band,
    }))
    .sort((a, b) => a.band - b.band);
}

// Check if user practiced today
function hasPracticedToday(sessions: SessionRecord[]): boolean {
  return sessions.some((s) => isSessionToday(s.created_at));
}

// Generate practice task for a topic
function createPracticeTask(topicId: string, part: "part1" | "part2" | "part3", reason: string): DailyTask {
  const topic = TOPICS.find((t) => t.id === topicId);
  const partLabel = part.replace("part", "Part ");

  return {
    id: `practice_${topicId}_${part}`,
    type: "practice",
    title: `${partLabel} - ${topic?.name || topicId}`,
    description: part === "part1"
      ? `Complete ${Math.min(3, topic?.part1Questions.length || 3)} questions`
      : part === "part2"
        ? "Prepare and deliver a 2-minute response"
        : `Discuss ${Math.min(2, topic?.part3Questions.length || 2)} questions in depth`,
    reason,
    topicId,
    part,
    status: "pending",
    link: `/practice/setup?mode=${part}&topic=${topicId}`,
  };
}

// Generate review task for low score topic
function createReviewTask(topicId: string, part: string, band: number): DailyTask {
  const topic = TOPICS.find((t) => t.id === topicId);
  const partLabel = part.replace("part", "Part ");

  return {
    id: `review_${topicId}_${part}`,
    type: "review",
    title: `Review: ${partLabel} - ${topic?.name || topicId}`,
    description: `Current score: Band ${band.toFixed(1)}. Try to improve!`,
    reason: `Your best score here is Band ${band.toFixed(1)} — targeted practice can help raise it`,
    topicId,
    part: part as "part1" | "part2" | "part3",
    status: "pending",
    link: `/practice/setup?mode=${part}&topic=${topicId}&focus=improvement`,
  };
}

// Main function: Generate daily tasks
export async function generateDailyTasks(userId: string): Promise<DailyTask[]> {
  const [progress, sessions] = await Promise.all([
    getUserProgress(userId),
    getRecentSessions(userId),
  ]);

  const tasks: DailyTask[] = [];
  const practicedToday = hasPracticedToday(sessions);

  // 1. Practice tasks (2-3)
  const unpracticed = getUnpracticedTopics(progress);

  if (unpracticed.length > 0) {
    // Add 2 unpracticed topics
    const topicsToAdd = unpracticed.slice(0, 2);
    for (const topicId of topicsToAdd) {
      tasks.push(createPracticeTask(topicId, "part1", "You haven't practiced this topic yet — give it a try"));
    }
  } else if (progress.length > 0) {
    // All topics practiced - pick random topics for variety
    const randomTopics = TOPICS.sort(() => Math.random() - 0.5).slice(0, 2);
    for (const topic of randomTopics) {
      tasks.push(createPracticeTask(topic.id, "part1", "Review for variety — keep your skills fresh"));
    }
  }

  // 2. Review task (0-1)
  const lowScoreTopics = getLowScoreTopics(progress);
  if (lowScoreTopics.length > 0 && !practicedToday) {
    const worst = lowScoreTopics[0];
    tasks.push(createReviewTask(worst.topicId, worst.part, worst.band));
  }

  // Mark completed tasks based on today's sessions
  if (practicedToday) {
    for (const task of tasks) {
      if (task.type === "practice" || task.type === "review") {
        // Check if this specific task was completed today
        const completedToday = sessions.some(
          (s) =>
            isSessionToday(s.created_at) &&
            (task.part === undefined || s.mode.includes(task.part!))
        );
        if (completedToday) {
          task.status = "completed";
        }
      }
    }
  }

  return tasks;
}

// Get task completion stats
export function getTaskStats(tasks: DailyTask[]): {
  total: number;
  completed: number;
  progress: number;
} {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, progress };
}
