import type { PracticeTask } from "@/types"

const STORAGE_KEY = "echolingo_practice_tasks"
const MAX_TASKS = 50

function createTaskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function saveTask(task: Omit<PracticeTask, "id">): PracticeTask {
  const saved: PracticeTask = { ...task, id: createTaskId() }
  const tasks = getTasks()
  tasks.unshift(saved)

  if (tasks.length > MAX_TASKS) {
    tasks.length = MAX_TASKS
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      tasks.length = Math.floor(tasks.length / 2)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
    }
  }

  return saved
}

export function getTasks(): PracticeTask[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function getTaskById(id: string): PracticeTask | null {
  return getTasks().find((t) => t.id === id) || null
}

export function deleteTask(id: string): boolean {
  const tasks = getTasks()
  const index = tasks.findIndex((t) => t.id === id)
  if (index === -1) return false
  tasks.splice(index, 1)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  return true
}

export function clearAllTasks(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function getTasksByType(taskType: PracticeTask["taskType"]): PracticeTask[] {
  return getTasks().filter((t) => t.taskType === taskType)
}
