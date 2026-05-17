import { getSessions } from "./history";

export type ReminderSettings = {
  examDate: string | null; // ISO date string (YYYY-MM-DD)
  dailyReminderEnabled: boolean;
  reminderTime: string; // HH:mm
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "echolingo_reminders";

export function getReminderSettings(): ReminderSettings | null {
  if (typeof window === "undefined") return null;

  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveReminderSettings(
  settings: Omit<ReminderSettings, "createdAt" | "updatedAt">
): ReminderSettings {
  const existing = getReminderSettings();
  const now = new Date().toISOString();

  const fullSettings: ReminderSettings = {
    ...settings,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(fullSettings));
  return fullSettings;
}

export function clearReminderSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getDaysUntilExam(): number | null {
  const settings = getReminderSettings();
  if (!settings?.examDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const examDate = new Date(settings.examDate);
  examDate.setHours(0, 0, 0, 0);

  const diffMs = examDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

export function hasPracticedToday(): boolean {
  const sessions = getSessions();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return sessions.some((session) => {
    const sessionDate = new Date(session.createdAt);
    return sessionDate >= today && sessionDate < tomorrow;
  });
}

export function getStreakDays(): number {
  const sessions = getSessions();
  if (sessions.length === 0) return 0;

  // Get unique practice dates (YYYY-MM-DD)
  const practiceDates = new Set<string>();
  for (const session of sessions) {
    const d = new Date(session.createdAt);
    practiceDates.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if practiced today; if not, start checking from yesterday
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  let checkDate = new Date(today);

  if (!practiceDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
    if (practiceDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
