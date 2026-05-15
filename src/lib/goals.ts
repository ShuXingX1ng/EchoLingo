import { getSessions } from "./history";

export type PracticeGoal = {
  weeklyTarget: number;
  targetBand: number;
  createdAt: string;
};

export type GoalProgress = {
  weeklyTarget: number;
  targetBand: number;
  weeklyCompleted: number;
  weeklyProgress: number;
  currentAverageBand: number;
  bandProgress: number;
  isWeeklyGoalMet: boolean;
  isBandGoalMet: boolean;
};

const GOALS_KEY = "echolingo_goals";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

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

export function calculateGoalProgress(): GoalProgress | null {
  const goals = getGoals();
  if (!goals) return null;

  const sessions = getSessions();
  const now = new Date();
  const weekStart = getWeekStart(now);

  const thisWeekSessions = sessions.filter(
    (s) => new Date(s.createdAt) >= weekStart
  );

  const weeklyCompleted = thisWeekSessions.length;
  const weeklyProgress = Math.min(
    Math.round((weeklyCompleted / goals.weeklyTarget) * 100),
    100
  );

  const bands = sessions
    .map((s) => s.feedback?.estimatedBand)
    .filter((b): b is number => b !== undefined);

  const currentAverageBand =
    bands.length > 0
      ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 10) / 10
      : 0;

  const bandProgress = Math.min(
    Math.round((currentAverageBand / goals.targetBand) * 100),
    100
  );

  return {
    weeklyTarget: goals.weeklyTarget,
    targetBand: goals.targetBand,
    weeklyCompleted,
    weeklyProgress,
    currentAverageBand,
    bandProgress,
    isWeeklyGoalMet: weeklyCompleted >= goals.weeklyTarget,
    isBandGoalMet: currentAverageBand >= goals.targetBand,
  };
}
