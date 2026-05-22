"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TOPICS, getCategories } from "@/lib/topics";
import { useTranslation } from "@/lib/i18n";
import DesktopNav from "@/components/DesktopNav";
import { SuspenseFallback } from "@/components/ChatUIStates";

type PracticeMode = "part1" | "part2" | "part3" | "full";
type TrainingType = "drill" | "exam" | "shadowing";

const trainingTypes: Array<{
  id: TrainingType;
  titleKey: string;
  descriptionKey: string;
  detailKey: string;
}> = [
  {
    id: "drill",
    titleKey: "setup.training.drill",
    descriptionKey: "setup.training.drillDesc",
    detailKey: "setup.detail.drill",
  },
  {
    id: "exam",
    titleKey: "setup.training.exam",
    descriptionKey: "setup.training.examDesc",
    detailKey: "setup.detail.exam",
  },
  {
    id: "shadowing",
    titleKey: "setup.training.shadowing",
    descriptionKey: "setup.training.shadowingDesc",
    detailKey: "setup.detail.shadowing",
  },
];

export default function PracticeSetupPageWrapper() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <PracticeSetupPage />
    </Suspense>
  );
}

function PracticeSetupPage() {
  const searchParams = useSearchParams();
  const focusParam = searchParams.get("focus");
  const suggestionsParam = searchParams.get("suggestions");
  const focusAreas = focusParam ? focusParam.split(",").filter(Boolean) : [];
  const suggestionItems = suggestionsParam ? suggestionsParam.split(",").filter(Boolean) : [];

  const [selectedTraining, setSelectedTraining] = useState<TrainingType>("drill");
  const [selectedMode, setSelectedMode] = useState<PracticeMode>("part1");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const categories = getCategories();
  const { t } = useTranslation();

  const query = new URLSearchParams();
  if (selectedMode) query.set("mode", selectedMode);
  if (selectedTopic) query.set("topic", selectedTopic);

  const practiceUrl = `/practice?${query.toString()}`;
  const examUrl = selectedTopic ? `/practice/exam?topic=${selectedTopic}` : "/practice/exam";
  const shadowingUrl = `/practice/shadowing?${query.toString()}`;
  const startUrl =
    selectedTraining === "exam"
      ? examUrl
      : selectedTraining === "shadowing"
        ? shadowingUrl
        : practiceUrl;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <DesktopNav
        active="practice"
        rightContent={
          <Link
            href="/practice"
            className="hidden rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:border-white/40 dark:hover:bg-white/10 sm:inline-flex"
          >
            {t("setup.quickStart")}
          </Link>
        }
      />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-8 rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            {t("setup.learningPlan")}
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {t("setup.learningPlanDesc")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t("setup.learningPlanHint")}
          </p>
        </div>

        {focusAreas.length > 0 && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
              {t("setup.trainingGoal")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {focusAreas.map((area) => (
                <span
                  key={area}
                  className="rounded-full bg-white px-3 py-1 text-sm font-medium text-amber-800 shadow-sm dark:bg-slate-900 dark:text-amber-200"
                >
                  {area}
                </span>
              ))}
            </div>
            {suggestionItems.length > 0 && (
              <ul className="mt-3 space-y-1">
                {suggestionItems.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-amber-800 dark:text-amber-200">
                    <span className="mt-0.5">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <section className="space-y-4">
          <SectionHeading number="01" title={t("setup.trainingType")} />
          <div className="grid gap-4 md:grid-cols-3">
            {trainingTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedTraining(type.id)}
                className={`rounded-2xl border p-5 text-left transition-all ${
                  selectedTraining === type.id
                    ? "border-emerald-600 bg-emerald-50 shadow-sm ring-2 ring-emerald-600/10 dark:border-emerald-300 dark:bg-emerald-950/30"
                    : "border-slate-200 bg-white hover:border-slate-400 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/30"
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {t(type.detailKey)}
                </span>
                <span className="mt-3 block text-lg font-semibold text-slate-950 dark:text-white">
                  {t(type.titleKey)}
                </span>
                <span className="mt-2 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {t(type.descriptionKey)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <SectionHeading number="02" title={t("setup.chooseMode")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModeCard
              title={t("setup.part1")}
              description={t("setup.part1Desc")}
              selected={selectedMode === "part1"}
              onClick={() => setSelectedMode("part1")}
            />
            <ModeCard
              title={t("setup.part2")}
              description={t("setup.part2Desc")}
              selected={selectedMode === "part2"}
              onClick={() => setSelectedMode("part2")}
            />
            <ModeCard
              title={t("setup.part3")}
              description={t("setup.part3Desc")}
              selected={selectedMode === "part3"}
              onClick={() => setSelectedMode("part3")}
            />
            <ModeCard
              title={t("setup.fullTest")}
              description={t("setup.fullTestDesc")}
              selected={selectedMode === "full"}
              onClick={() => setSelectedMode("full")}
            />
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <SectionHeading number="03" title={t("setup.chooseTopic")} />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("setup.topicOptional")}
          </p>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            {categories.map((category) => (
              <div key={category} className="border-b border-slate-100 py-5 first:pt-0 last:border-b-0 last:pb-0 dark:border-white/10">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {TOPICS.filter((topic) => topic.category === category).map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => setSelectedTopic(selectedTopic === topic.id ? "" : topic.id)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                        selectedTopic === topic.id
                          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15"
                      }`}
                    >
                      {topic.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 mt-10 border-t border-slate-200 bg-slate-50/90 py-4 backdrop-blur dark:border-white/10 dark:bg-slate-950/90">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selectedTopic
                ? t("setup.selectedTopic", { name: TOPICS.find((topic) => topic.id === selectedTopic)?.name || "" })
                : t("setup.noTopicSelected")}
            </p>
            <Link
              href={startUrl}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {selectedTraining === "exam"
                ? t("setup.mockExam")
                : selectedTraining === "shadowing"
                  ? t("shadowing.setup.start")
                  : t("setup.startPractice")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function SectionHeading({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 font-mono text-xs text-white dark:bg-white dark:text-slate-950">
        {number}
      </span>
      <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{title}</h2>
    </div>
  );
}

function ModeCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left transition-all ${
        selected
          ? "border-slate-950 bg-white shadow-sm ring-2 ring-slate-950/10 dark:border-white dark:bg-slate-900"
          : "border-slate-200 bg-white hover:border-slate-400 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/30"
      }`}
    >
      <span className="block font-semibold text-slate-950 dark:text-white">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-slate-600 dark:text-slate-300">
        {description}
      </span>
    </button>
  );
}
