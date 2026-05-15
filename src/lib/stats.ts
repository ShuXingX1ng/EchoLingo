import { getSessions, type SavedSession } from "./history";

export type PracticeStats = {
  totalSessions: number;
  thisWeekSessions: number;
  thisMonthSessions: number;
  averageBand: number;
  highestBand: number;
  lowestBand: number;
  part1Count: number;
  part2Count: number;
  part3Count: number;
  recentSessions: SavedSession[];
  bandHistory: { date: string; band: number }[];
  weeklyTrend: { week: string; count: number }[];
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getWeekLabel(date: Date): string {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day}`;
}

export function calculateStats(): PracticeStats {
  const sessions = getSessions();
  const now = new Date();
  const weekStart = getWeekStart(now);
  const monthStart = getMonthStart(now);

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      thisWeekSessions: 0,
      thisMonthSessions: 0,
      averageBand: 0,
      highestBand: 0,
      lowestBand: 0,
      part1Count: 0,
      part2Count: 0,
      part3Count: 0,
      recentSessions: [],
      bandHistory: [],
      weeklyTrend: [],
    };
  }

  const thisWeekSessions = sessions.filter(
    (s) => new Date(s.createdAt) >= weekStart
  ).length;

  const thisMonthSessions = sessions.filter(
    (s) => new Date(s.createdAt) >= monthStart
  ).length;

  const bands = sessions
    .map((s) => s.feedback?.estimatedBand)
    .filter((b): b is number => b !== undefined);

  const averageBand =
    bands.length > 0
      ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 10) / 10
      : 0;

  const highestBand = bands.length > 0 ? Math.max(...bands) : 0;
  const lowestBand = bands.length > 0 ? Math.min(...bands) : 0;

  const part1Count = sessions.filter((s) =>
    s.mode.includes("part_1")
  ).length;
  const part2Count = sessions.filter((s) =>
    s.mode.includes("part_2")
  ).length;
  const part3Count = sessions.filter((s) =>
    s.mode.includes("part_3")
  ).length;

  const recentSessions = sessions.slice(0, 10);

  const bandHistory = sessions
    .slice()
    .reverse()
    .filter((s) => s.feedback?.estimatedBand)
    .map((s) => ({
      date: formatDate(new Date(s.createdAt)),
      band: s.feedback!.estimatedBand,
    }))
    .slice(-30);

  const weeklyTrend: { week: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekDate = new Date(now);
    weekDate.setDate(weekDate.getDate() - i * 7);
    const wStart = getWeekStart(weekDate);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);

    const count = sessions.filter((s) => {
      const d = new Date(s.createdAt);
      return d >= wStart && d < wEnd;
    }).length;

    weeklyTrend.push({
      week: getWeekLabel(wStart),
      count,
    });
  }

  return {
    totalSessions: sessions.length,
    thisWeekSessions,
    thisMonthSessions,
    averageBand,
    highestBand,
    lowestBand,
    part1Count,
    part2Count,
    part3Count,
    recentSessions,
    bandHistory,
    weeklyTrend,
  };
}

export function getBandColor(band: number): string {
  if (band >= 7) return "text-green-600 dark:text-green-400";
  if (band >= 6) return "text-blue-600 dark:text-blue-400";
  if (band >= 5) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function getBandBgColor(band: number): string {
  if (band >= 7) return "bg-green-100 dark:bg-green-900/30";
  if (band >= 6) return "bg-blue-100 dark:bg-blue-900/30";
  if (band >= 5) return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export function getBandLabel(band: number): string {
  if (band >= 8) return "Excellent";
  if (band >= 7) return "Very Good";
  if (band >= 6) return "Good";
  if (band >= 5) return "Moderate";
  if (band >= 4) return "Limited";
  return "Beginner";
}
