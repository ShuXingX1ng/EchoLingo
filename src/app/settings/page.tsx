"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import MuteButton from "@/components/MuteButton";
import { AZURE_VOICES } from "@/components/VoiceOutput";
import { useTranslation } from "@/lib/i18n";
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
  type ReminderSettings,
} from "@/lib/reminders";

export default function SettingsPage() {
  const { t } = useTranslation();
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
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello, I am your IELTS speaking examiner. Let's begin the practice session.",
          voice: selectedVoice,
          rate,
        }),
      });

      if (!response.ok) throw new Error("TTS failed");

      const audioBlob = await response.blob();
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Home
            </Link>
            <h1 className="font-semibold text-gray-900 dark:text-white">
              Settings
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/stats"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Stats
            </Link>
            <MuteButton />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Practice Goals */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Practice Goals
          </h2>

          {goalProgress && (
            <div className="mb-6 space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Weekly Practice
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {goalProgress.weeklyCompleted} / {goalProgress.weeklyTarget}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      goalProgress.isWeeklyGoalMet
                        ? "bg-green-500"
                        : "bg-blue-500"
                    }`}
                    style={{ width: `${goalProgress.weeklyProgress}%` }}
                  />
                </div>
                {goalProgress.isWeeklyGoalMet && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    Weekly goal achieved!
                  </p>
                )}
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Band Score
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {goalProgress.currentAverageBand} / {goalProgress.targetBand}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      goalProgress.isBandGoalMet
                        ? "bg-green-500"
                        : "bg-blue-500"
                    }`}
                    style={{ width: `${goalProgress.bandProgress}%` }}
                  />
                </div>
                {goalProgress.isBandGoalMet && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    Band score goal achieved!
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Weekly Practice Target: {weeklyTarget} sessions
            </label>
            <input
              type="range"
              min="1"
              max="14"
              step="1"
              value={weeklyTarget}
              onChange={(e) => setWeeklyTarget(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>1 session</span>
              <span>7 sessions</span>
              <span>14 sessions</span>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Band Score: {targetBand.toFixed(1)}
            </label>
            <input
              type="range"
              min="4"
              max="9"
              step="0.5"
              value={targetBand}
              onChange={(e) => setTargetBand(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>4.0</span>
              <span>6.5</span>
              <span>9.0</span>
            </div>
          </div>

          <div className="flex gap-3">
            {goalProgress && (
              <button
                onClick={handleClearGoals}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Clear Goals
              </button>
            )}
            <button
              onClick={handleSaveGoals}
              className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              {isGoalSaved ? "Saved!" : "Save Goals"}
            </button>
          </div>
        </div>

        {/* Learning Reminders */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            {t("reminder.title")}
          </h2>

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

            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("reminder.todayPractice")}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    practicedToday
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500 dark:text-gray-400"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("reminder.examDate")}
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {t("reminder.examDateDesc")}
            </p>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Daily Reminder Toggle */}
          <div className="mb-6 flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("reminder.dailyReminder")}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t("reminder.dailyReminderDesc")}
              </p>
            </div>
            <button
              onClick={() => setDailyReminderEnabled(!dailyReminderEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                dailyReminderEnabled
                  ? "bg-blue-600"
                  : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  dailyReminderEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Reminder Time */}
          {dailyReminderEnabled && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("reminder.reminderTime")}
              </label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full px-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex gap-3">
            {(examDate || dailyReminderEnabled) && (
              <button
                onClick={handleClearReminders}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t("reminder.clear")}
              </button>
            )}
            <button
              onClick={handleSaveReminders}
              className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              {isReminderSaved ? t("reminder.saved") : t("reminder.save")}
            </button>
          </div>
        </div>

        {/* Voice Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Voice Settings
          </h2>

          <div className="mb-6 flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-play Voice
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isMuted ? "Examiner voice is muted" : "Examiner will speak automatically"}
              </p>
            </div>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isMuted
                  ? "bg-gray-300 dark:bg-gray-600"
                  : "bg-blue-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isMuted ? "translate-x-1" : "translate-x-6"
                }`}
              />
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Examiner Voice
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full px-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AZURE_VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.gender})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Powered by Azure Neural TTS
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Speech Speed: {rate.toFixed(2)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>Slower (0.5x)</span>
              <span>Normal (1.0x)</span>
              <span>Faster (1.5x)</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleTest}
              disabled={isTestPlaying}
              className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {isTestPlaying ? "Playing..." : "Test Voice"}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              {isSaved ? "Saved!" : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
            About Settings
          </h3>
          <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <li>Practice goals help you stay motivated and track progress</li>
            <li>Voices are powered by Azure Neural TTS for natural sound</li>
            <li>A slower speed (0.8-0.9x) is recommended for learning</li>
            <li>All settings are saved locally in your browser</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
