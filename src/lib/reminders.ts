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
