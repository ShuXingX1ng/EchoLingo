import { getSessions, type SavedSession } from "./history";
import { getGoals, type PracticeGoal } from "./goals";

export type BackupData = {
  version: string;
  createdAt: string;
  sessions: SavedSession[];
  goals: PracticeGoal | null;
  settings: {
    voiceURI: string | null;
    voiceRate: string | null;
    muted: string | null;
  };
};

const CURRENT_VERSION = "1.0.0";

export function createBackup(): BackupData {
  return {
    version: CURRENT_VERSION,
    createdAt: new Date().toISOString(),
    sessions: getSessions(),
    goals: getGoals(),
    settings: {
      voiceURI: localStorage.getItem("echolingo_voice_uri"),
      voiceRate: localStorage.getItem("echolingo_voice_rate"),
      muted: localStorage.getItem("echolingo_muted"),
    },
  };
}

export function downloadBackup(): void {
  const backup = createBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `echolingo-backup-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function validateBackup(data: unknown): data is BackupData {
  if (!data || typeof data !== "object") return false;

  const backup = data as Record<string, unknown>;

  if (typeof backup.version !== "string") return false;
  if (typeof backup.createdAt !== "string") return false;
  if (!Array.isArray(backup.sessions)) return false;

  for (const session of backup.sessions) {
    if (typeof session.id !== "string") return false;
    if (typeof session.mode !== "string") return false;
    if (!Array.isArray(session.messages)) return false;
    if (!session.feedback || typeof session.feedback !== "object") return false;
    if (typeof session.feedback.estimatedBand !== "number") return false;
  }

  return true;
}

export type ImportResult = {
  success: boolean;
  message: string;
  sessionsImported: number;
};

export function importBackup(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        if (!validateBackup(data)) {
          resolve({
            success: false,
            message: "Invalid backup file format.",
            sessionsImported: 0,
          });
          return;
        }

        const existingSessions = getSessions();
        const existingIds = new Set(existingSessions.map((s) => s.id));

        const newSessions = data.sessions.filter(
          (s) => !existingIds.has(s.id)
        );

        const mergedSessions = [...newSessions, ...existingSessions].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const MAX_SESSIONS = 50;
        if (mergedSessions.length > MAX_SESSIONS) {
          mergedSessions.length = MAX_SESSIONS;
        }

        localStorage.setItem(
          "echolingo_sessions",
          JSON.stringify(mergedSessions)
        );

        if (data.goals) {
          localStorage.setItem("echolingo_goals", JSON.stringify(data.goals));
        }

        if (data.settings) {
          if (data.settings.voiceURI)
            localStorage.setItem("echolingo_voice_uri", data.settings.voiceURI);
          if (data.settings.voiceRate)
            localStorage.setItem("echolingo_voice_rate", data.settings.voiceRate);
          if (data.settings.muted)
            localStorage.setItem("echolingo_muted", data.settings.muted);
        }

        resolve({
          success: true,
          message: `Successfully imported ${newSessions.length} new sessions.`,
          sessionsImported: newSessions.length,
        });
      } catch {
        resolve({
          success: false,
          message: "Failed to parse backup file. Please ensure it's a valid JSON file.",
          sessionsImported: 0,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        message: "Failed to read file.",
        sessionsImported: 0,
      });
    };

    reader.readAsText(file);
  });
}

export function getLastBackupDate(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("echolingo_last_backup");
}

export function setLastBackupDate(): void {
  localStorage.setItem("echolingo_last_backup", new Date().toISOString());
}

export function shouldShowBackupReminder(): boolean {
  const lastBackup = getLastBackupDate();
  if (!lastBackup) return true;

  const daysSinceLastBackup =
    (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceLastBackup >= 7;
}
