"use client";

import { useState } from "react";
import Link from "next/link";
import { TOPICS, getCategories } from "@/lib/topics";
import { useTranslation } from "@/lib/i18n";

type PracticeMode = "part1" | "part2" | "part3" | "full";

export default function PracticeSetupPage() {
  const [selectedMode, setSelectedMode] = useState<PracticeMode>("part1");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const categories = getCategories();
  const { t } = useTranslation();

  const practiceUrl = selectedTopic
    ? `/practice?mode=${selectedMode}&topic=${selectedTopic}`
    : `/practice?mode=${selectedMode}`;

  const examUrl = selectedTopic
    ? `/practice/exam?topic=${selectedTopic}`
    : "/practice/exam";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← {t("nav.home")}
          </Link>
          <h1 className="font-semibold text-gray-900 dark:text-white">
            {t("setup.title")}
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-8">
        {/* Mock Exam Banner */}
        <Link
          href={examUrl}
          className="block p-6 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white hover:shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold mb-1">{t("setup.mockExam")}</h2>
              <p className="text-sm text-purple-100">
                Full Part 1 → 2 → 3 simulation with timers (11-14 min)
              </p>
            </div>
            <span className="text-2xl">🎓</span>
          </div>
        </Link>

        {/* Shadowing Practice Banner */}
        <Link
          href={selectedTopic ? `/practice/shadowing?mode=${selectedMode}&topic=${selectedTopic}` : `/practice/shadowing?mode=${selectedMode}`}
          className="block p-6 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl text-white hover:shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold mb-1">{t("home.shadowing")}</h2>
              <p className="text-sm text-green-100">
                {t("shadowing.setup.description")}
              </p>
            </div>
            <span className="text-2xl">🎤</span>
          </div>
        </Link>

        {/* Mode Selection */}
        <section>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            {t("setup.chooseMode")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ModeCard
              mode="part1"
              title={t("setup.part1")}
              description={t("setup.part1Desc")}
              selected={selectedMode === "part1"}
              onClick={() => setSelectedMode("part1")}
            />
            <ModeCard
              mode="part2"
              title={t("setup.part2")}
              description={t("setup.part2Desc")}
              selected={selectedMode === "part2"}
              onClick={() => setSelectedMode("part2")}
            />
            <ModeCard
              mode="part3"
              title={t("setup.part3")}
              description={t("setup.part3Desc")}
              selected={selectedMode === "part3"}
              onClick={() => setSelectedMode("part3")}
            />
            <ModeCard
              mode="full"
              title={t("setup.fullTest")}
              description={t("setup.fullTestDesc")}
              selected={selectedMode === "full"}
              onClick={() => setSelectedMode("full")}
            />
          </div>
        </section>

        {/* Topic Selection */}
        <section>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {t("setup.chooseTopic")}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("setup.topicOptional")}
          </p>

          {categories.map((category) => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {category}
              </h3>
              <div className="flex flex-wrap gap-2">
                {TOPICS.filter((t) => t.category === category).map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() =>
                      setSelectedTopic(
                        selectedTopic === topic.id ? "" : topic.id
                      )
                    }
                    className={`px-4 py-2 text-sm rounded-lg transition-all ${
                      selectedTopic === topic.id
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
                    }`}
                  >
                    {topic.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Start Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 pb-8">
          <Link
            href={practiceUrl}
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            {t("setup.startPractice")}
          </Link>
          <Link
            href="/practice"
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            {t("setup.quickStart")}
          </Link>
        </div>
      </main>
    </div>
  );
}

function ModeCard({
  mode,
  title,
  description,
  selected,
  onClick,
}: {
  mode: PracticeMode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl text-left transition-all ${
        selected
          ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 dark:border-blue-400"
          : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600"
      }`}
    >
      <h3
        className={`font-medium mb-1 ${
          selected
            ? "text-blue-700 dark:text-blue-300"
            : "text-gray-900 dark:text-white"
        }`}
      >
        {title}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </button>
  );
}
