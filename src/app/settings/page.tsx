"use client";

import { useState, useEffect } from "react";
import { Settings2, Target, Bell, Volume2, UserCircle2 } from "lucide-react";
import DesktopNav from "@/components/DesktopNav";
import { AZURE_VOICES } from "@/components/VoiceOutput";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import {
  getGoals,
  saveGoals,
  clearGoals,
  calculateGoalProgress,
  type PracticeGoal,
  type GoalProgress,
} from "@/lib/goals";
import {
  getReminderSettings,
  saveReminderSettings,
  clearReminderSettings,
  getDaysUntilExam,
  hasPracticedToday,
  getStreakDays,
} from "@/lib/reminders";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [selectedVoice, setSelectedVoice] = useState<string>("en-US-AriaNeural");
  const [rate, setRate] = useState(0.95);
  const [isMuted, setIsMuted] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isTestPlaying, setIsTestPlaying] = useState(false);

  const [weeklyTarget, setWeeklyTarget] = useState(3);
  const [targetBand, setTargetBand] = useState(6.5);
  const [goalProgress, setGoalProgress] = useState<GoalProgress | null>(null);
  const [isGoalSaved, setIsGoalSaved] = useState(false);

  // Reminder state
  const [examDate, setExamDate] = useState("");
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [isReminderSaved, setIsReminderSaved] = useState(false);
  const [daysUntilExam, setDaysUntilExam] = useState<number | null>(null);
  const [practicedToday, setPracticedToday] = useState(false);
  const [streakDays, setStreakDays] = useState(0);

  useEffect(() => {
    const savedVoice = localStorage.getItem("echolingo_azure_voice");
    const savedRate = localStorage.getItem("echolingo_voice_rate");
    const savedMuted = localStorage.getItem("echolingo_muted");

    if (savedVoice) {
      setSelectedVoice(savedVoice);
    }

    if (savedRate) {
      setRate(parseFloat(savedRate));
    }

    if (savedMuted === "true") {
      setIsMuted(true);
    }

    const goals = getGoals();
    if (goals) {
      setWeeklyTarget(goals.weeklyTarget);
      setTargetBand(goals.targetBand);
    }

    setGoalProgress(calculateGoalProgress());

    // Load reminder settings
    const reminders = getReminderSettings();
    if (reminders) {
      setExamDate(reminders.examDate || "");
      setDailyReminderEnabled(reminders.dailyReminderEnabled);
      setReminderTime(reminders.reminderTime);
    }

    setDaysUntilExam(getDaysUntilExam());
    setPracticedToday(hasPracticedToday());
    setStreakDays(getStreakDays());
  }, []);

  const handleSave = () => {
    localStorage.setItem("echolingo_azure_voice", selectedVoice);
    localStorage.setItem("echolingo_voice_rate", rate.toString());
    localStorage.setItem("echolingo_muted", isMuted.toString());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleTest = async () => {
    setIsTestPlaying(true);
    try {
      const { apiPostBlob } = await import("@/lib/api-client");
      const audioBlob = await apiPostBlob("/api/tts", {
        text: "Hello, I am your IELTS speaking examiner. Let's begin the practice session.",
        voice: selectedVoice,
        rate,
      });

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setIsTestPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsTestPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (err) {
      console.error("Test voice error:", err);
      setIsTestPlaying(false);
    }
  };

  const handleSaveGoals = () => {
    const goal: PracticeGoal = {
      weeklyTarget,
      targetBand,
      createdAt: new Date().toISOString(),
    };
    saveGoals(goal);
    setGoalProgress(calculateGoalProgress());
    setIsGoalSaved(true);
    setTimeout(() => setIsGoalSaved(false), 2000);
  };

  const handleClearGoals = () => {
    clearGoals();
    setGoalProgress(null);
  };

  const handleSaveReminders = () => {
    saveReminderSettings({
      examDate: examDate || null,
      dailyReminderEnabled,
      reminderTime,
    });
    setDaysUntilExam(getDaysUntilExam());
    setIsReminderSaved(true);
    setTimeout(() => setIsReminderSaved(false), 2000);
  };

  const handleClearReminders = () => {
    clearReminderSettings();
    setExamDate("");
    setDailyReminderEnabled(false);
    setReminderTime("09:00");
    setDaysUntilExam(null);
  };

  return (
    <div className="min-h-screen">
      <DesktopNav active="settings" />

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Page hero */}
        <div className="rounded-[28px] border border-[#dce4ee] bg-white dark:bg-slate-900 shadow-[0_10px_26px_rgba(15,23,42,.055)] p-6 animate-enter">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-[15px] border border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <Settings2 className="w-6 h-6" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.19em] text-indigo-700 dark:text-indigo-400">Preferences</p>
              <h1 className="text-xl font-bold text-[var(--foreground)]">Settings</h1>
            </div>
          </div>
        </div>

        {/* Practice Goals */}
        <div className="bg-white dark:bg-slate-900 rounded-[22px] border border-[#dce4ee] shadow-[0_10px_26px_rgba(15,23,42,.055)] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="h-12 w-12 rounded-[15px] border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.19em] text-emerald-700 dark:text-emerald-400">Goals</p>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t("settings.practiceGoals")}</h2>
            </div>
          </div>

          {goalProgress && (
            <div className="mb-6 space-y-4">
              <div className="p-4 bg-[var(--background)] rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--text-muted)]">
                    {t("settings.weeklyPractice")}
                  </span>
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    {goalProgress.weeklyCompleted} / {goalProgress.weeklyTarget}
                  </span>
                </div>
                <div className="w-full bg-[var(--border)] rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      goalProgress.isWeeklyGoalMet
                        ? "bg-green-500"
                        : "bg-[var(--foreground)]"
                    }`}
                    style={{ width: `${goalProgress.weeklyProgress}%` }}
                  />
                </div>
                {goalProgress.isWeeklyGoalMet && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    {t("settings.weeklyGoalAchieved")}
                  </p>
                )}
              </div>

              <div className="p-4 bg-[var(--background)] rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--text-muted)]">
                    {t("settings.bandScore")}
                  </span>
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    {goalProgress.currentAverageBand} / {goalProgress.targetBand}
                  </span>
                </div>
                <div className="w-full bg-[var(--border)] rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      goalProgress.isBandGoalMet
                        ? "bg-green-500"
                        : "bg-[var(--foreground)]"
                    }`}
                    style={{ width: `${goalProgress.bandProgress}%` }}
                  />
                </div>
                {goalProgress.isBandGoalMet && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    {t("settings.bandGoalAchieved")}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              {t("settings.weeklyTarget")}: {weeklyTarget} {t("settings.sessions")}
            </label>
            <input
              type="range"
              min="1"
              max="14"
              step="1"
              value={weeklyTarget}
              onChange={(e) => setWeeklyTarget(parseInt(e.target.value))}
              className="w-full h-2 bg-[var(--border)] rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
              <span>{t("settings.oneSession")}</span>
              <span>{t("settings.sevenSessions")}</span>
              <span>{t("settings.fourteenSessions")}</span>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              {t("settings.targetBand")}: {targetBand.toFixed(1)}
            </label>
            <input
              type="range"
              min="4"
              max="9"
              step="0.5"
              value={targetBand}
              onChange={(e) => setTargetBand(parseFloat(e.target.value))}
              className="w-full h-2 bg-[var(--border)] rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
              <span>4.0</span>
              <span>6.5</span>
              <span>9.0</span>
            </div>
          </div>

          <div className="flex gap-3">
            {goalProgress && (
              <button
                onClick={handleClearGoals}
                className="flex-1 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded-xl hover:bg-[var(--background)] transition-colors"
              >
                {t("settings.clearGoals")}
              </button>
            )}
            <button
              onClick={handleSaveGoals}
              className="flex-1 px-4 py-3 text-sm font-medium text-[var(--background)] bg-[var(--foreground)] rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              {isGoalSaved ? t("settings.saved") : t("settings.saveGoals")}
            </button>
          </div>
        </div>

        {/* Learning Reminders */}
        <div className="bg-white dark:bg-slate-900 rounded-[22px] border border-[#dce4ee] shadow-[0_10px_26px_rgba(15,23,42,.055)] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="h-12 w-12 rounded-[15px] border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.19em] text-amber-700 dark:text-amber-400">Reminders</p>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t("reminder.title")}</h2>
            </div>
          </div>

          {/* Current Status */}
          <div className="mb-6 space-y-3">
            {daysUntilExam !== null && (
              <div className={`p-4 rounded-xl ${
                daysUntilExam <= 7
                  ? "bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                  : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-2xl font-bold ${
                      daysUntilExam <= 7
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-blue-600 dark:text-blue-400"
                    }`}>
                      {daysUntilExam}
                    </p>
                    <p className={`text-sm ${
                      daysUntilExam <= 7
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-blue-600 dark:text-blue-400"
                    }`}>
                      {t("reminder.daysUntilExam")}
                    </p>
                  </div>
                  <div className={`text-3xl ${
                    daysUntilExam <= 7 ? "animate-pulse" : ""
                  }`}>
                    {daysUntilExam <= 7 ? "🔥" : "📚"}
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 bg-[var(--background)] rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-secondary)]">
                    {t("reminder.todayPractice")}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    practicedToday
                      ? "text-green-600 dark:text-green-400"
                      : "text-[var(--text-muted)]"
                  }`}>
                    {practicedToday ? t("reminder.practiced") : t("reminder.notPracticed")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {streakDays > 0 && (
                    <span className="text-xs text-orange-500 dark:text-orange-400 font-medium">
                      {streakDays} {t("reminder.streak")}
                    </span>
                  )}
                  <div className={`text-2xl ${practicedToday ? "" : "opacity-30"}`}>
                    {practicedToday ? "✅" : "⭕"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Exam Date */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              {t("reminder.examDate")}
            </label>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              {t("reminder.examDateDesc")}
            </p>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3 text-sm border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </div>

          {/* Daily Reminder Toggle */}
          <div className="mb-6 flex items-center justify-between p-4 bg-[var(--background)] rounded-xl">
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                {t("reminder.dailyReminder")}
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {t("reminder.dailyReminderDesc")}
              </p>
            </div>
            <button
              onClick={() => setDailyReminderEnabled(!dailyReminderEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                dailyReminderEnabled
                  ? "bg-[var(--brand)]"
                  : "bg-[var(--border)]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[var(--background)] transition-transform ${
                  dailyReminderEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Reminder Time */}
          {dailyReminderEnabled && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                {t("reminder.reminderTime")}
              </label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full px-4 py-3 text-sm border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
          )}

          <div className="flex gap-3">
            {(examDate || dailyReminderEnabled) && (
              <button
                onClick={handleClearReminders}
                className="flex-1 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded-xl hover:bg-[var(--background)] transition-colors"
              >
                {t("reminder.clear")}
              </button>
            )}
            <button
              onClick={handleSaveReminders}
              className="flex-1 px-4 py-3 text-sm font-medium text-[var(--background)] bg-[var(--foreground)] rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              {isReminderSaved ? t("reminder.saved") : t("reminder.save")}
            </button>
          </div>
        </div>

        {/* Voice Settings */}
        <div className="bg-white dark:bg-slate-900 rounded-[22px] border border-[#dce4ee] shadow-[0_10px_26px_rgba(15,23,42,.055)] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="h-12 w-12 rounded-[15px] border border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <Volume2 className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.19em] text-indigo-700 dark:text-indigo-400">Voice</p>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t("settings.voiceSettings")}</h2>
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between p-4 bg-[var(--background)] rounded-xl">
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                {t("settings.autoPlayVoice")}
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {isMuted ? t("settings.mutedDesc") : t("settings.autoDesc")}
              </p>
            </div>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isMuted
                  ? "bg-[var(--border)]"
                  : "bg-[var(--brand)]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[var(--background)] transition-transform ${
                  isMuted ? "translate-x-1" : "translate-x-6"
                }`}
              />
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              {t("settings.examinerVoice")}
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full px-4 py-3 text-sm border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            >
              {AZURE_VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.gender})
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {t("settings.poweredByAzure")}
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              {t("settings.speechSpeed")}: {rate.toFixed(2)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full h-2 bg-[var(--border)] rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
              <span>{t("settings.slower")}</span>
              <span>{t("settings.normal")}</span>
              <span>{t("settings.faster")}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleTest}
              disabled={isTestPlaying}
              className="flex-1 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded-xl hover:bg-[var(--background)] transition-colors disabled:opacity-50"
            >
              {isTestPlaying ? t("settings.playing") : t("settings.testVoice")}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-3 text-sm font-medium text-[var(--background)] bg-[var(--foreground)] rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              {isSaved ? t("settings.saved") : t("settings.saveSettings")}
            </button>
          </div>
        </div>

        {/* Account */}
        {user && (
          <div className="bg-white dark:bg-slate-900 rounded-[22px] border border-[#dce4ee] shadow-[0_10px_26px_rgba(15,23,42,.055)] p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-12 w-12 rounded-[15px] border border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 flex items-center justify-center shrink-0">
                <UserCircle2 className="w-5 h-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.19em] text-slate-500 dark:text-slate-400">Account</p>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{t("settings.account")}</h2>
              </div>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              {user.email}
            </p>
            <button
              onClick={async () => {
                console.log("[Settings] signOut clicked, signOut type:", typeof signOut);
                try {
                  await signOut();
                  console.log("[Settings] signOut completed");
                } catch (err) {
                  console.error("[Settings] signOut error:", err);
                }
              }}
              className="w-full px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {t("auth.logout")}
            </button>
          </div>
        )}

        {/* Info */}
        <div className="bg-white dark:bg-slate-900 border border-[#dce4ee] rounded-[22px] shadow-[0_10px_26px_rgba(15,23,42,.055)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
            {t("settings.aboutTitle")}
          </h3>
          <ul className="text-xs text-[var(--text-muted)] space-y-1">
            <li>{t("settings.aboutGoals")}</li>
            <li>{t("settings.aboutVoices")}</li>
            <li>{t("settings.aboutSpeed")}</li>
            <li>{t("settings.aboutStorage")}</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
