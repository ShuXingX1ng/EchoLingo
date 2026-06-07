"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { getTaskStats, type DailyTask } from "@/lib/learning-plan";

export default function DailyTasks({ tasks }: { tasks: DailyTask[] }) {
  const { t } = useTranslation();

  const stats = getTaskStats(tasks);

  if (tasks.length === 0) {
    return (
      <div className="border border-slate-300 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("dailyTasks.title")}
        </p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {t("dailyTasks.noTasks")}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-slate-300 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("dailyTasks.title")}
        </p>
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {stats.completed}/{stats.total} {t("dailyTasks.completed")}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1.5 w-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-emerald-600 transition-all duration-300"
          style={{ width: `${stats.progress}%` }}
        />
      </div>

      {/* Task list */}
      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function TaskItem({ task }: { task: DailyTask }) {
  const { t } = useTranslation();

  const typeColors = {
    practice: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    review: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  };

  const typeLabels = {
    practice: t("dailyTasks.typePractice"),
    review: t("dailyTasks.typeReview"),
  };

  const isCompleted = task.status === "completed";

  return (
    <div
      className={`flex items-center gap-3 p-3 border transition-colors ${
        isCompleted
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
      }`}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0">
        {isCompleted ? (
          <div className="w-5 h-5 bg-emerald-600 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 ${typeColors[task.type]}`}>
            {typeLabels[task.type]}
          </span>
          <span className={`text-sm font-medium ${isCompleted ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}>
            {task.title}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {task.description}
        </p>
        {task.reason && (
          <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">
            {task.reason}
          </p>
        )}
      </div>

      {/* Action button */}
      {!isCompleted && (
        <Link
          href={task.link}
          className="flex-shrink-0 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
        >
          {t("dailyTasks.start")}
        </Link>
      )}
    </div>
  );
}
