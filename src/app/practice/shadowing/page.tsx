"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useShadowingPractice, type ShadowingMode } from "@/hooks/useShadowingPractice";
import { TOPICS, getCategories } from "@/lib/topics";
import MuteButton from "@/components/MuteButton";
import ShadowingProgress from "@/components/ShadowingProgress";
import ShadowingSentenceCard from "@/components/ShadowingSentenceCard";
import ShadowingSummary from "@/components/ShadowingSummary";

export default function ShadowingPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          </div>
        </div>
      }
    >
      <ShadowingPage />
    </Suspense>
  );
}

function ShadowingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const topicIdParam = searchParams.get("topic") || undefined;
  const modeParam = searchParams.get("mode") as ShadowingMode | null;
  const { t } = useTranslation();

  const {
    phase,
    practiceMode,
    sentences,
    currentSentenceIndex,
    assessmentResult,
    allResults,
    topicName,
    error,
    startPractice,
    startRecording,
    evaluatePronunciation,
    nextSentence,
    tryAgain,
    resetPractice,
    goToListening,
    setError,
  } = useShadowingPractice();

  const categories = getCategories();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("nav.home")}
            </Link>
            <h1 className="font-semibold text-gray-900 dark:text-white">
              {t("shadowing.title")}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <MuteButton />
            {phase !== "setup" && phase !== "summary" && (
              <button
                onClick={resetPractice}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                {t("shadowing.reset")}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      {phase === "setup" ? (
        <SetupView
          categories={categories}
          initialMode={modeParam}
          initialTopicId={topicIdParam}
          onStart={(mode, topicId) => startPractice(mode, topicId)}
        />
      ) : (
        <main className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Topic Info */}
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t(`shadowing.mode.${practiceMode}`)} &middot; {topicName}
              </p>
            </div>

            {/* Progress */}
            <ShadowingProgress
              currentIndex={currentSentenceIndex}
              total={sentences.length}
              scores={allResults.map((r) => r.score)}
            />

            {/* Error */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">!</span>
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="ml-auto text-red-400 hover:text-red-600"
                  >
                    x
                  </button>
                </div>
              </div>
            )}

            {/* Sentence Card */}
            {phase !== "summary" && sentences[currentSentenceIndex] && (
              <ShadowingSentenceCard
                sentence={sentences[currentSentenceIndex]}
                isPlaying={false}
                isRecording={phase === "recording"}
                isEvaluating={phase === "evaluating"}
                assessment={assessmentResult}
                onListen={() => {}}
                onRecord={startRecording}
                onStopRecord={evaluatePronunciation}
                onEvaluate={evaluatePronunciation}
                onNext={nextSentence}
                onTryAgain={tryAgain}
              />
            )}

            {/* Sentence counter */}
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {currentSentenceIndex + 1} / {sentences.length}
              </p>
            </div>
          </div>
        </main>
      )}

      {/* Summary Modal */}
      {phase === "summary" && (
        <ShadowingSummary
          results={allResults}
          topicName={topicName}
          onRestart={() => startPractice(practiceMode, topicIdParam)}
          onHome={() => router.push("/")}
        />
      )}
    </div>
  );
}

// Setup View Component
function SetupView({
  categories,
  initialMode,
  initialTopicId,
  onStart,
}: {
  categories: string[];
  initialMode?: ShadowingMode | null;
  initialTopicId?: string;
  onStart: (mode: ShadowingMode, topicId?: string) => void;
}) {
  const { t } = useTranslation();
  const [selectedMode, setSelectedMode] = useState<ShadowingMode>(
    initialMode || "part1"
  );
  const [selectedTopic, setSelectedTopic] = useState<string>(
    initialTopicId || ""
  );

  // Auto-start if both params provided
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (initialMode && initialTopicId && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      onStart(initialMode, initialTopicId);
    }
  }, [initialMode, initialTopicId, onStart]);

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t("shadowing.setup.title")}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("shadowing.setup.description")}
          </p>
        </div>

        {/* Mode Selection */}
        <section>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            {t("setup.chooseMode")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(["part1", "part2", "part3"] as ShadowingMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`p-4 rounded-xl text-left transition-all ${
                  selectedMode === mode
                    ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 dark:border-blue-400"
                    : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600"
                }`}
              >
                <h4
                  className={`font-medium mb-1 ${
                    selectedMode === mode
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-gray-900 dark:text-white"
                  }`}
                >
                  {t(`shadowing.mode.${mode}`)}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(`shadowing.mode.${mode}Desc`)}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Topic Selection */}
        <section>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {t("setup.chooseTopic")}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("setup.topicOptional")}
          </p>

          {categories.map((category) => (
            <div key={category} className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {category}
              </h4>
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

        {/* Start Button */}
        <div className="flex justify-center pt-4 pb-8">
          <button
            onClick={() => onStart(selectedMode, selectedTopic || undefined)}
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            {t("shadowing.setup.start")}
          </button>
        </div>
      </div>
    </main>
  );
}

