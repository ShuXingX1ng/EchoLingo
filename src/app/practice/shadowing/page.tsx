"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useShadowingPractice, type ShadowingMode } from "@/hooks/useShadowingPractice";
import { TOPICS, getCategories } from "@/lib/topics";
import DesktopNav from "@/components/DesktopNav";
import ShadowingProgress from "@/components/ShadowingProgress";
import ShadowingSentenceCard from "@/components/ShadowingSentenceCard";
import ShadowingSummary from "@/components/ShadowingSummary";

export default function ShadowingPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
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
  const wordsParam = searchParams.get("words");
  const priorityWords = wordsParam ? wordsParam.split(",").filter(Boolean) : [];
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
    setError,
  } = useShadowingPractice();

  const categories = getCategories();

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <DesktopNav
        active="practice"
        maxWidth="4xl"
        rightContent={
          phase !== "setup" && phase !== "summary" ? (
            <button
              onClick={resetPractice}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t("shadowing.reset")}
            </button>
          ) : undefined
        }
      />

      {/* Main Content */}
      {phase === "setup" ? (
        <SetupView
          categories={categories}
          initialMode={modeParam}
          initialTopicId={topicIdParam}
          priorityWords={priorityWords}
          onStart={(mode, topicId) => startPractice(mode, topicId)}
        />
      ) : (
        <main className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Topic Info */}
            <div className="text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
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
                onRecord={startRecording}
                onStopRecord={evaluatePronunciation}
                onNext={nextSentence}
                onTryAgain={tryAgain}
              />
            )}

            {/* Sentence counter */}
            <div className="text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500">
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
  priorityWords,
  onStart,
}: {
  categories: string[];
  initialMode?: ShadowingMode | null;
  initialTopicId?: string;
  priorityWords?: string[];
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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t("shadowing.setup.title")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("shadowing.setup.description")}
          </p>
        </div>

        {/* Priority Words from Feedback */}
        {priorityWords && priorityWords.length > 0 && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
            <h3 className="text-sm font-semibold text-cyan-950 dark:text-cyan-100">
              {t("setup.priorityWords")}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {priorityWords.map((word) => (
                <span
                  key={word}
                  className="rounded-full bg-white px-3 py-1 text-sm font-medium text-cyan-800 shadow-sm dark:bg-slate-900 dark:text-cyan-200"
                >
                  {word}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-cyan-700 dark:text-cyan-300">
              {t("setup.priorityWordsHint")}
            </p>
          </div>
        )}

        {/* Mode Selection */}
        <section>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">
            {t("setup.chooseMode")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(["part1", "part2", "part3"] as ShadowingMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`p-4 rounded-xl text-left transition-all ${
                  selectedMode === mode
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500 dark:border-emerald-400"
                    : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600"
                }`}
              >
                <h4
                  className={`font-medium mb-1 ${
                    selectedMode === mode
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-slate-900 dark:text-white"
                  }`}
                >
                  {t(`shadowing.mode.${mode}`)}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(`shadowing.mode.${mode}Desc`)}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Topic Selection */}
        <section>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
            {t("setup.chooseTopic")}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {t("setup.topicOptional")}
          </p>

          {categories.map((category) => (
            <div key={category} className="mb-6">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
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
                        ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950 shadow-md"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500"
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
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base font-medium text-white bg-slate-950 rounded-xl hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            {t("shadowing.setup.start")}
          </button>
        </div>
      </div>
    </main>
  );
}
