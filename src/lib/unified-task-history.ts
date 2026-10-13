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

export async function deleteTask(id: string): Promise<boolean> {
  return store.delete(id)
}

export async function getTasksByType(taskType: PracticeTask["taskType"]): Promise<PracticeTask[]> {
  return store.read(
    () => cloudHistory.getTasksByTypeFromCloud(taskType),
    () => localHistory.getTasksByType(taskType),
    (tasks) => tasks.length === 0,
  )
}

/**
 * Delete every Practice Task of the learner, in the cloud as well as on this
 * device. Resolves false when the cloud copy could not be cleared.
 */
export async function clearAllTasks(): Promise<boolean> {
  return store.change(
    () => cloudHistory.clearTasksFromCloud(),
    () => localHistory.clearAllTasks(),
  )
}

export function _resetCacheForTesting(): void {
  store._resetCache()
}
