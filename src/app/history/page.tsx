"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { Clock, Trash2, Search } from "lucide-react"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { getTasks, deleteTask, clearAllTasksLocal } from "@/lib/unified-task-history"
import { useTranslation } from "@/lib/i18n"
import type { PracticeTask, PteTaskType } from "@/types"

type TFunc = (key: string) => string

function getTaskLabels(t: TFunc): Record<PteTaskType, string> {
  return {
    read_aloud: t("mock.taskLabel.read_aloud"),
    repeat_sentence: t("mock.taskLabel.repeat_sentence"),
    answer_short_question: t("mock.taskLabel.answer_short_question"),
    summarize_written_text: t("mock.taskLabel.summarize_written_text"),
    write_essay: t("mock.taskLabel.write_essay"),
    personal_intro: t("mock.taskLabel.personal_intro"),
    write_from_dictation: t("mock.taskLabel.write_from_dictation"),
    describe_image: t("mock.taskLabel.describe_image"),
    re_tell_lecture: t("mock.taskLabel.re_tell_lecture"),
    fill_in_the_blanks_reading: t("mock.taskLabel.fill_in_the_blanks"),
    re_order_paragraphs: t("mock.taskLabel.re_order_paragraphs"),
    multiple_choice_reading: t("mock.taskLabel.multiple_choice"),
    summarize_spoken_text: t("mock.taskLabel.summarize_spoken_text"),
    fill_in_the_blanks_listening: t("mock.taskLabel.fill_in_the_blanks_listening"),
    highlight_correct_summary: t("mock.taskLabel.highlight_correct_summary"),
  }
}

const TASK_SECTION_KEY: Record<PteTaskType, string> = {
  read_aloud: "Speaking",
  repeat_sentence: "Speaking",
  answer_short_question: "Speaking",
  personal_intro: "Speaking",
  describe_image: "Speaking",
  re_tell_lecture: "Speaking",
  summarize_written_text: "Writing",
  write_essay: "Writing",
  write_from_dictation: "Listening",
  fill_in_the_blanks_reading: "Reading",
  re_order_paragraphs: "Reading",
  multiple_choice_reading: "Reading",
  summarize_spoken_text: "Listening",
  fill_in_the_blanks_listening: "Listening",
  highlight_correct_summary: "Listening",
}

function parseFillInTheBlanksStimulus(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { passage?: unknown; blanks?: unknown }
    if (typeof parsed.passage !== "string" || !Array.isArray(parsed.blanks)) return null
    let passage = parsed.passage
    const blanks = parsed.blanks as Array<{ options: string[]; correct: number }>
    blanks.forEach((b, i) => {
      passage = passage.replace(`[BLANK_${i}]`, `[${b.options[b.correct]}]`)
    })
    const answers = blanks.map((b, i) => `Blank ${i + 1}: "${b.options[b.correct]}"`).join(", ")
    return `Passage (correct answers shown):\n${passage}\n\nAnswers: ${answers}`
  } catch {
    return null
  }
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function matchesSearch(task: PracticeTask, query: string, labels: Record<PteTaskType, string>): boolean {
  const q = query.toLowerCase()
  return (
    labels[task.taskType].toLowerCase().includes(q) ||
    (task.feedback?.summary?.toLowerCase().includes(q) ?? false) ||
    (task.feedback?.weaknesses.some((w) => w.toLowerCase().includes(q)) ?? false) ||
    (task.stimulus.kind === "text" && task.stimulus.content.toLowerCase().includes(q))
  )
}

function exportToCSV(tasks: PracticeTask[], labels: Record<PteTaskType, string>): string {
  const headers = ["ID", "Date", "Task Type", "Section", "Duration (s)", "Feedback Summary"]
  const rows = tasks.map((t) => [
    t.id,
    new Date(t.createdAt).toLocaleDateString("en-US"),
    labels[t.taskType],
    TASK_SECTION_KEY[t.taskType],
    t.durationSeconds,
    `"${(t.feedback?.summary ?? "").replace(/"/g, '""')}"`,
  ])
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Task list item ─────────────────────────────────────────────────────────────

function TaskCard({
  task,
  isSelectMode,
  isSelected,
  onSelect,
  onClick,
  onDelete,
}: {
  task: PracticeTask
  isSelectMode: boolean
  isSelected: boolean
  onSelect: () => void
  onClick: () => void
  onDelete: () => void
}) {
  const { t, locale } = useTranslation()
  const TASK_LABELS = getTaskLabels(t)
  const firstWeakness = task.feedback?.weaknesses?.[0]

  return (
    <div
      className={`w-full bg-[var(--surface)] rounded-[22px] p-4 sm:p-5 border transition-all text-left group ${
        isSelectMode && isSelected
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/20 shadow-[0_10px_26px_rgba(15,23,42,.055)]"
          : "border-[var(--border)] shadow-[0_10px_26px_rgba(15,23,42,.055)] hover:border-[var(--brand)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {isSelectMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="mt-1 w-4 h-4 text-slate-900 rounded focus:ring-slate-900"
          />
        )}

        <button
          onClick={isSelectMode ? onSelect : onClick}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5">
                  {TASK_LABELS[task.taskType]}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {t(`practiceHub.section.${TASK_SECTION_KEY[task.taskType]}`)}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                {formatDate(task.createdAt, locale)} · {task.durationSeconds}s
              </p>
            </div>
            {!isSelectMode && (
              <span className="text-[var(--text-muted)] group-hover:text-[var(--foreground)] group-hover:translate-x-1 transition-all shrink-0">
                →
              </span>
            )}
          </div>

          {task.feedback && (
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {task.feedback.summary && (
                <p className="rounded-lg bg-[var(--background)] px-3 py-2 text-[var(--text-secondary)] line-clamp-2">
                  {task.feedback.summary}
                </p>
              )}
              {firstWeakness && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100 line-clamp-2">
                  <span className="font-medium">{t("history.focus")} </span>
                  {firstWeakness}
                </p>
              )}
            </div>
          )}
        </button>

        {!isSelectMode && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
            title={t("admin.delete")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Task detail view ───────────────────────────────────────────────────────────

function TaskDetail({
  task,
  onBack,
  onDelete,
}: {
  task: PracticeTask
  onBack: () => void
  onDelete: () => void
}) {
  const { t, locale } = useTranslation()
  const TASK_LABELS = getTaskLabels(t)

  return (
    <div className="min-h-screen">
      <DesktopNav active="history" />

      <div className="sticky top-0 z-10 bg-[var(--surface)]/90 backdrop-blur border-b border-[var(--border)] px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              ← {t("history.back")}
            </button>
            <div>
              <h1 className="font-semibold text-[var(--foreground)]">
                {TASK_LABELS[task.taskType]}
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                {formatDate(task.createdAt, locale)}
              </p>
            </div>
          </div>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title={t("admin.delete")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {task.feedback ? (
          <TaskFeedbackDisplay
            feedback={task.feedback}
            stimulus={
              task.stimulus.kind === "text"
                ? (parseFillInTheBlanksStimulus(task.stimulus.content) ?? task.stimulus.content)
                : undefined
            }
            stimulusLabel={task.stimulus.kind === "text" ? t("practiceTask.common.passage") : t("history.details")}
            responseText={task.response.kind === "text" ? task.response.content : undefined}
            responseLabel={task.response.kind === "audio" ? t("history.transcript") : t("practiceTask.common.passage")}
          />
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
            <p className="text-sm text-[var(--text-secondary)]">{t("history.noFeedback")}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pb-8">
          <Link
            href="/practice"
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-[var(--brand)] rounded-xl hover:bg-[var(--brand-hover)] transition-colors"
          >
            {t("history.startNew")}
          </Link>
          <button
            onClick={onBack}
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded-xl hover:bg-[var(--background)] transition-colors"
          >
            {t("history.backToHistory")}
          </button>
        </div>
      </main>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { t } = useTranslation()
  const TASK_LABELS = useMemo(() => getTaskLabels(t), [t])
  const [tasks, setTasks] = useState<PracticeTask[]>([])
  const [selectedTask, setSelectedTask] = useState<PracticeTask | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<PteTaskType | "all">("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)

  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await getTasks()
      setTasks(loaded)
    } catch {
      setTasks([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadTasks() }, [loadTasks])

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((t) => filterType === "all" || t.taskType === filterType)
      .filter((t) => !searchQuery || matchesSearch(t, searchQuery, TASK_LABELS))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [tasks, filterType, searchQuery, TASK_LABELS])

  const handleDelete = async (id: string) => {
    if (!confirm(t("history.confirmDelete"))) return false
    await deleteTask(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    return true
  }

  const handleBatchDelete = async () => {
    if (!confirm(t("history.confirmDeleteMultiple", { count: selectedIds.size }))) return
    await Promise.all(Array.from(selectedIds).map((id) => deleteTask(id)))
    setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)))
    setSelectedIds(new Set())
    setIsSelectMode(false)
  }

  const handleClearAll = async () => {
    if (!confirm(t("history.confirmDeleteAll"))) return
    clearAllTasksLocal()
    setTasks([])
    setSelectedIds(new Set())
  }

  const handleExport = (format: "json" | "csv") => {
    const data = isSelectMode ? tasks.filter((t) => selectedIds.has(t.id)) : tasks
    if (format === "json") {
      downloadBlob(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        `echolingo-tasks-${Date.now()}.json`
      )
    } else {
      downloadBlob(
        new Blob([exportToCSV(data, TASK_LABELS)], { type: "text/csv" }),
        `echolingo-tasks-${Date.now()}.csv`
      )
    }
    setIsExportOpen(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id) } else { n.add(id) }
      return n
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(
      selectedIds.size === filteredTasks.length
        ? new Set()
        : new Set(filteredTasks.map((t) => t.id))
    )
  }

  if (selectedTask) {
    return (
      <TaskDetail
        task={selectedTask}
        onBack={() => setSelectedTask(null)}
        onDelete={async () => {
          if (await handleDelete(selectedTask.id)) setSelectedTask(null)
        }}
      />
    )
  }

  const typeOptions: Array<PteTaskType | "all"> = [
    "all",
    "read_aloud",
    "repeat_sentence",
    "answer_short_question",
    "summarize_written_text",
    "write_essay",
    "personal_intro",
    "write_from_dictation",
  ]

  return (
    <div className="min-h-screen">
      <DesktopNav active="history" />

      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        {/* Page hero */}
        <div className="mb-6 rounded-[28px] border border-[#dce4ee] bg-white dark:bg-slate-900 shadow-[0_10px_26px_rgba(15,23,42,.055)] p-6 animate-enter">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-[15px] border border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.19em] text-violet-700 dark:text-violet-400">{t("history.title")}</p>
              <h1 className="text-xl font-bold text-[var(--foreground)]">{t("home.practiceHistory")}</h1>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex gap-1.5 mb-4">
              {[0, 0.15, 0.3].map((delay, i) => (
                <div
                  key={i}
                  className="w-3 h-3 bg-[var(--brand)] rounded-full animate-bounce"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-[var(--text-secondary)]">{t("history.loading")}</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="text-6xl mb-6">📝</div>
            <h2 className="text-lg font-medium text-[var(--foreground)] mb-2">
              {t("history.emptyTitle")}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-md">
              {t("history.emptyDesc")}
            </p>
            <Link
              href="/practice"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-[var(--brand)] rounded-xl hover:bg-[var(--brand-hover)] transition-all hover:shadow-lg"
            >
              {t("history.emptyCta")}
            </Link>
          </div>
        ) : (
          <>
            {/* Task type filter */}
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1 animate-fade-in">
              {typeOptions.map((type) => {
                const label = type === "all" ? t("history.filterAll") : TASK_LABELS[type]
                const count = type === "all"
                  ? tasks.length
                  : tasks.filter((t) => t.taskType === type).length
                if (type !== "all" && count === 0) return null
                return (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`shrink-0 px-3 py-1.5 text-xs rounded-full transition-colors ${
                      filterType === type
                        ? "bg-[var(--brand)] text-white"
                        : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]"
                    }`}
                  >
                    {label} ({count})
                  </button>
                )
              })}
            </div>

            {/* Toolbar */}
            <div className="mb-5 space-y-3 animate-fade-in">
              <div className="relative">
                <input
                  type="text"
                  placeholder={t("history.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--foreground)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={2} />
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => { setIsSelectMode(!isSelectMode); setSelectedIds(new Set()) }}
                  className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                    isSelectMode
                      ? "bg-[var(--border)] text-[var(--foreground)]"
                      : "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--background)]"
                  }`}
                >
                  {isSelectMode ? t("history.cancel") : t("history.select")}
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <button
                      onClick={() => setIsExportOpen(!isExportOpen)}
                      className="px-3 py-2 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--background)] transition-colors"
                    >
                      {t("history.export")}
                    </button>
                    {isExportOpen && (
                      <div className="absolute right-0 mt-1 w-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg z-10">
                        <button onClick={() => handleExport("json")}
                          className="w-full px-4 py-2 text-xs text-left text-[var(--text-secondary)] hover:bg-[var(--background)] rounded-t-lg">
                          {t("history.exportJson")}
                        </button>
                        <button onClick={() => handleExport("csv")}
                          className="w-full px-4 py-2 text-xs text-left text-[var(--text-secondary)] hover:bg-[var(--background)] rounded-b-lg">
                          {t("history.exportCsv")}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    {t("history.clearAll")}
                  </button>
                </div>
              </div>

              {isSelectMode && (
                <div className="flex items-center justify-between p-3 bg-[var(--background)] rounded-xl">
                  <div className="flex items-center gap-3">
                    <button onClick={toggleSelectAll}
                      className="text-xs text-[var(--foreground)] hover:underline">
                      {selectedIds.size === filteredTasks.length ? t("history.deselectAll") : t("history.selectAll")}
                    </button>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {t("history.selected", { count: selectedIds.size })}
                    </span>
                  </div>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 bg-[var(--surface)] rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("history.deleteSelected")}
                  </button>
                </div>
              )}
            </div>

            {/* Task list */}
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                {searchQuery
                  ? t("history.sessionsFound", { count: filteredTasks.length, query: searchQuery })
                  : t("history.sessions", { count: filteredTasks.length })}
              </p>

              {filteredTasks.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[var(--text-secondary)]">{t("history.noMatch")}</p>
                </div>
              ) : (
                filteredTasks.map((task, index) => (
                  <div key={task.id} className="stagger-item" style={{ animationDelay: `${index * 40}ms` }}>
                    <TaskCard
                      task={task}
                      isSelectMode={isSelectMode}
                      isSelected={selectedIds.has(task.id)}
                      onSelect={() => toggleSelect(task.id)}
                      onClick={() => setSelectedTask(task)}
                      onDelete={() => handleDelete(task.id)}
                    />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
