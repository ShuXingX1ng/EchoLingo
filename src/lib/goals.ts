import type { PracticeTask } from "@/types";
import { tasksThisWeek } from "./practice-activity";

export type PracticeGoal = {
  /** Practice Tasks to complete each week. */
  weeklyTarget: number;
  createdAt: string;
};

export type GoalProgress = {
  weeklyTarget: number;
  weeklyCompleted: number;
  weeklyProgress: number;
  isWeeklyGoalMet: boolean;
};

const GOALS_KEY = "echolingo_goals";

export function getGoals(): PracticeGoal | null {
  if (typeof window === "undefined") return null;

  try {
    const data = localStorage.getItem(GOALS_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveGoals(goals: PracticeGoal): void {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export function clearGoals(): void {
  localStorage.removeItem(GOALS_KEY);
}

/** Progress towards the saved goal, counted over the learner's Practice Tasks. */
export function calculateGoalProgress(
  tasks: Array<Pick<PracticeTask, "createdAt">>,
  now: Date = new Date()
): GoalProgress | null {
  const goals = getGoals();
  if (!goals) return null;

  const weeklyCompleted = tasksThisWeek(tasks, now);
  return {
    weeklyTarget: goals.weeklyTarget,
    weeklyCompleted,
    weeklyProgress: Math.min(Math.round((weeklyCompleted / goals.weeklyTarget) * 100), 100),
    isWeeklyGoalMet: weeklyCompleted >= goals.weeklyTarget,
  };
}
