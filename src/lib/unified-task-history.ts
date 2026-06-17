import type { PracticeTask } from "@/types"
import * as localHistory from "./task-history"
import * as cloudHistory from "./supabase-task-history"
import { createSyncedStore } from "./synced-store"

type TaskInput = Omit<PracticeTask, "id">

const store = createSyncedStore<PracticeTask, TaskInput>(
  {
    save: (item) => localHistory.saveTask(item),
    listAll: () => localHistory.getTasks(),
    delete: (id) => localHistory.deleteTask(id),
    // Mirror the original input (not the cloud copy) so local gets its own id.
    mirror: (_cloudResult, input) => { localHistory.saveTask(input) },
  },
  {
    isLoggedIn: () => cloudHistory.isUserLoggedIn(),
    save: (item) => cloudHistory.saveTaskToCloud(item),
    listAll: () => cloudHistory.getTasksFromCloud(),
    delete: (id) => cloudHistory.deleteTaskFromCloud(id),
  }
)

export async function saveTask(task: TaskInput): Promise<PracticeTask> {
  return store.save(task)
}

export async function getTasks(): Promise<PracticeTask[]> {
  return store.listAll()
}

export async function getTaskById(id: string): Promise<PracticeTask | null> {
  if (await cloudHistory.isUserLoggedIn()) {
    const cloudTask = await cloudHistory.getTaskByIdFromCloud(id)
    if (cloudTask) return cloudTask
  }
  return localHistory.getTaskById(id)
}

export async function deleteTask(id: string): Promise<boolean> {
  return store.delete(id)
}

export async function getTasksByType(taskType: PracticeTask["taskType"]): Promise<PracticeTask[]> {
  if (await cloudHistory.isUserLoggedIn()) {
    const cloudTasks = await cloudHistory.getTasksByTypeFromCloud(taskType)
    if (cloudTasks.length > 0) return cloudTasks
  }
  return localHistory.getTasksByType(taskType)
}

export function clearAllTasksLocal(): void {
  localHistory.clearAllTasks()
}

export function _resetCacheForTesting(): void {
  store._resetCache()
}
