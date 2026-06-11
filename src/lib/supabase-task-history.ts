// Supabase storage for PracticeTask records.
//
// Requires the following table in Supabase (run once via SQL editor):
//
// CREATE TABLE practice_tasks (
//   id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//   task_type       text NOT NULL,
//   stimulus        jsonb NOT NULL,
//   response        jsonb NOT NULL,
//   feedback        jsonb,
//   duration_seconds integer NOT NULL DEFAULT 0,
//   created_at      timestamptz NOT NULL DEFAULT now(),
//   ended_at        timestamptz
// );
// ALTER TABLE practice_tasks ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users manage own tasks" ON practice_tasks
//   USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

import { createClient } from "./supabase"
import type { PracticeTask, PteTaskType, TaskStimulus, TaskResponse, TaskFeedback } from "@/types"

type DbTask = {
  id: string
  user_id: string
  task_type: PteTaskType
  stimulus: TaskStimulus
  response: TaskResponse
  feedback: TaskFeedback | null
  duration_seconds: number
  created_at: string
  ended_at: string | null
}

function dbTaskToPracticeTask(db: DbTask): PracticeTask {
  return {
    id: db.id,
    taskType: db.task_type,
    stimulus: db.stimulus,
    response: db.response,
    feedback: db.feedback || undefined,
    durationSeconds: db.duration_seconds,
    createdAt: db.created_at,
    endedAt: db.ended_at || undefined,
  }
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id || null
}

export async function saveTaskToCloud(task: Omit<PracticeTask, "id">): Promise<PracticeTask | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const supabase = createClient()
  const { data, error } = await supabase
    .from("practice_tasks")
    .insert({
      user_id: userId,
      task_type: task.taskType,
      stimulus: task.stimulus,
      response: task.response,
      feedback: task.feedback || null,
      duration_seconds: task.durationSeconds,
      created_at: task.createdAt,
      ended_at: task.endedAt || null,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to save task to cloud:", error)
    return null
  }

  return dbTaskToPracticeTask(data)
}

export async function getTasksFromCloud(limit = 100): Promise<PracticeTask[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  const supabase = createClient()
  const { data, error } = await supabase
    .from("practice_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Failed to fetch tasks from cloud:", error)
    return []
  }

  return (data || []).map(dbTaskToPracticeTask)
}

export async function getTaskByIdFromCloud(id: string): Promise<PracticeTask | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const supabase = createClient()
  const { data, error } = await supabase
    .from("practice_tasks")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single()

  if (error || !data) return null
  return dbTaskToPracticeTask(data)
}

export async function deleteTaskFromCloud(id: string): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false

  const supabase = createClient()
  const { error } = await supabase
    .from("practice_tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  return !error
}

export async function getTasksByTypeFromCloud(taskType: string, limit = 50): Promise<PracticeTask[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  const supabase = createClient()
  const { data, error } = await supabase
    .from("practice_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("task_type", taskType)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return []
  return (data || []).map(dbTaskToPracticeTask)
}

export async function isUserLoggedIn(): Promise<boolean> {
  return (await getCurrentUserId()) !== null
}
