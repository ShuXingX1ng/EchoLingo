"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import MuteButton from "@/components/MuteButton";

export default function SettingsPage() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [rate, setRate] = useState(0.95);
  const [isMuted, setIsMuted] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      const englishVoices = availableVoices.filter((v) =>
        v.lang.startsWith("en")
      );
      setVoices(englishVoices);

      // Load saved settings
      const savedVoice = localStorage.getItem("echolingo_voice_uri");
      const savedRate = localStorage.getItem("echolingo_voice_rate");
      const savedMuted = localStorage.getItem("echolingo_muted");

      if (savedVoice && englishVoices.find((v) => v.voiceURI === savedVoice)) {
        setSelectedVoiceURI(savedVoice);
      } else if (englishVoices.length > 0) {
        const preferred =
          englishVoices.find((v) => v.name.includes("Google") && v.lang === "en-US") ||
          englishVoices.find((v) => v.lang === "en-US") ||
          englishVoices[0];
        setSelectedVoiceURI(preferred.voiceURI);
      }

      if (savedRate) {
        setRate(parseFloat(savedRate));
      }

      if (savedMuted === "true") {
        setIsMuted(true);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const handleSave = () => {
    localStorage.setItem("echolingo_voice_uri", selectedVoiceURI);
    localStorage.setItem("echolingo_voice_rate", rate.toString());
    localStorage.setItem("echolingo_muted", isMuted.toString());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleTest = () => {
    const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      "Hello, I am your IELTS speaking examiner. Let's begin the practice session."
    );
    utterance.lang = "en-US";
    utterance.rate = rate;
    if (voice) utterance.voice = voice;

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Home
            </Link>
            <h1 className="font-semibold text-gray-900 dark:text-white">
              Settings
            </h1>
          </div>
          <MuteButton />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Voice Settings
          </h2>

          {/* Mute Toggle */}
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

          {/* Voice Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Examiner Voice
            </label>
            <select
              value={selectedVoiceURI}
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="w-full px-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {voices.length === 0 && (
                <option value="">Loading voices...</option>
              )}
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Choose the voice for the AI examiner
            </p>
          </div>

          {/* Speed Control */}
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

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleTest}
              className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Test Voice
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              {isSaved ? "✓ Saved!" : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
            About Voice Settings
          </h3>
          <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <li>• Voices are provided by your browser and operating system</li>
            <li>• Google Chrome typically has the best voice options</li>
            <li>• A slower speed (0.8-0.9x) is recommended for learning</li>
            <li>• Settings are saved locally in your browser</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
