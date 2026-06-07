import type { PracticeTask } from "@/types"
import * as localHistory from "./task-history"
import * as cloudHistory from "./supabase-task-history"

async function isAuthenticated(): Promise<boolean> {
  return cloudHistory.isUserLoggedIn()
}

export async function saveTask(task: Omit<PracticeTask, "id">): Promise<PracticeTask> {
  const isAuthed = await isAuthenticated()

  if (isAuthed) {
    try {
      const cloudTask = await cloudHistory.saveTaskToCloud(task)
      if (cloudTask) {
        localHistory.saveTask(task)
        return cloudTask
      }
    } catch (error) {
      console.warn("Cloud task save failed, falling back to local storage:", error)
    }
  }

  return localHistory.saveTask(task)
}

export async function getTasks(): Promise<PracticeTask[]> {
  const isAuthed = await isAuthenticated()

  if (isAuthed) {
    const cloudTasks = await cloudHistory.getTasksFromCloud()
    if (cloudTasks.length > 0) return cloudTasks
  }

  return localHistory.getTasks()
}

export async function getTaskById(id: string): Promise<PracticeTask | null> {
  const isAuthed = await isAuthenticated()

  if (isAuthed) {
    const cloudTask = await cloudHistory.getTaskByIdFromCloud(id)
    if (cloudTask) return cloudTask
  }

  return localHistory.getTaskById(id)
}

export async function deleteTask(id: string): Promise<boolean> {
  const isAuthed = await isAuthenticated()

  if (isAuthed) {
    const cloudResult = await cloudHistory.deleteTaskFromCloud(id)
    localHistory.deleteTask(id)
    return cloudResult
  }

  return localHistory.deleteTask(id)
}

export async function getTasksByType(taskType: PracticeTask["taskType"]): Promise<PracticeTask[]> {
  const isAuthed = await isAuthenticated()

  if (isAuthed) {
    const cloudTasks = await cloudHistory.getTasksByTypeFromCloud(taskType)
    if (cloudTasks.length > 0) return cloudTasks
  }

  return localHistory.getTasksByType(taskType)
}

export function clearAllTasksLocal(): void {
  localHistory.clearAllTasks()
}
