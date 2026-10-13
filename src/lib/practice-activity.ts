import type { PracticeTask } from "@/types"

// What a learner's Practice Tasks say about their study habit: whether they
// practised today, how long their streak is, and how much they did this week.
// Pure functions over a task list; load it with `getTasks()`.

type Dated = Pick<PracticeTask, "createdAt">

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function practiceDays(tasks: Dated[]): Set<string> {
  return new Set(tasks.map((task) => dayKey(new Date(task.createdAt))))
}

export function practicedToday(tasks: Dated[], now: Date = new Date()): boolean {
  return practiceDays(tasks).has(dayKey(now))
}

/**
 * Consecutive days with at least one Practice Task, ending today — or
 * yesterday, so that a streak is not shown as broken before today is over.
 */
export function streakDays(tasks: Dated[], now: Date = new Date()): number {
  const days = practiceDays(tasks)
  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** Practice Tasks since the most recent Monday 00:00 (local time). */
export function tasksThisWeek(tasks: Dated[], now: Date = new Date()): number {
  const weekStart = new Date(now)
  const day = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() - day + (day === 0 ? -6 : 1))
  weekStart.setHours(0, 0, 0, 0)
  return tasks.filter((task) => new Date(task.createdAt) >= weekStart).length
}
