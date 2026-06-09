"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import TaskFeedbackDisplay from "@/components/TaskFeedbackDisplay"
import { getTasks, deleteTask, clearAllTasksLocal } from "@/lib/unified-task-history"
import type { PracticeTask, PteTaskType } from "@/types"

const TASK_LABELS: Record<PteTaskType, string> = {
  read_aloud: "Read Aloud",
  repeat_sentence: "Repeat Sentence",
  answer_short_question: "Answer Short Question",
  summarize_written_text: "Summarize Written Text",
  write_essay: "Write Essay",
  personal_intro: "Personal Intro",
  write_from_dictation: "Write from Dictation",
  describe_image: "Describe Image",
  re_tell_lecture: "Re-tell Lecture",
  fill_in_the_blanks_reading: "Fill in the Blanks (Reading)",
  re_order_paragraphs: "Re-order Paragraphs",
  multiple_choice_reading: "Multiple Choice (Reading)",
  summarize_spoken_text: "Summarize Spoken Text",
  fill_in_the_blanks_listening: "Fill in the Blanks (Listening)",
  highlight_correct_summary: "Highlight Correct Summary",
}

const TASK_SECTION: Record<PteTaskType, string> = {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function matchesSearch(task: PracticeTask, query: string): boolean {
  const q = query.toLowerCase()
  return (
    TASK_LABELS[task.taskType].toLowerCase().includes(q) ||
    (task.feedback?.summary?.toLowerCase().includes(q) ?? false) ||
    (task.feedback?.weaknesses.some((w) => w.toLowerCase().includes(q)) ?? false) ||
    (task.stimulus.kind === "text" && task.stimulus.content.toLowerCase().includes(q))
  )
}

function exportToCSV(tasks: PracticeTask[]): string {
  const headers = ["ID", "Date", "Task Type", "Section", "Duration (s)", "Feedback Summary"]
  const rows = tasks.map((t) => [
    t.id,
    new Date(t.createdAt).toLocaleDateString("en-US"),
    TASK_LABELS[t.taskType],
    TASK_SECTION[t.taskType],
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
  const firstWeakness = task.feedback?.weaknesses?.[0]

  return (
    <div
      className={`w-full bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border transition-all text-left group ${
        isSelectMode && isSelected
          ? "border-slate-900 dark:border-white ring-2 ring-slate-200 dark:ring-slate-700"
          : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md"
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
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {TASK_SECTION[task.taskType]}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {formatDate(task.createdAt)} · {task.durationSeconds}s
              </p>
            </div>
            {!isSelectMode && (
              <span className="text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white group-hover:translate-x-1 transition-all shrink-0">
                →
              </span>
            )}
          </div>

          {task.feedback && (
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {task.feedback.summary && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200 line-clamp-2">
                  {task.feedback.summary}
                </p>
              )}
              {firstWeakness && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100 line-clamp-2">
                  <span className="font-medium">Focus: </span>
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
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
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
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="history" />

      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200 dark:border-white/10 dark:bg-slate-950/90 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </button>
            <div>
              <h1 className="font-semibold text-slate-900 dark:text-white">
                {TASK_LABELS[task.taskType]}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatDate(task.createdAt)}
              </p>
            </div>
          </div>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {task.feedback ? (
          <TaskFeedbackDisplay
            feedback={task.feedback}
            stimulus={task.stimulus.kind === "text" ? task.stimulus.content : undefined}
            stimulusLabel={task.stimulus.kind === "text" ? "Stimulus" : "Audio Stimulus"}
            responseText={task.response.kind === "text" ? task.response.content : undefined}
            responseLabel={task.response.kind === "audio" ? "Spoken Response (transcript)" : "Your Response"}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">No feedback available for this task.</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pb-8">
          <Link
            href="/practice"
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-slate-950 dark:bg-white dark:text-slate-950 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            Practice Again
          </Link>
          <button
            onClick={onBack}
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Back to History
          </button>
        </div>
      </main>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HistoryPage() {
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
      .filter((t) => !searchQuery || matchesSearch(t, searchQuery))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [tasks, filterType, searchQuery])

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this practice task?")) return false
    await deleteTask(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    return true
  }

  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} selected task(s)?`)) return
    await Promise.all(Array.from(selectedIds).map((id) => deleteTask(id)))
    setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)))
    setSelectedIds(new Set())
    setIsSelectMode(false)
  }

  const handleClearAll = async () => {
    if (!confirm("Delete ALL practice history? This cannot be undone.")) return
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
        new Blob([exportToCSV(data)], { type: "text/csv" }),
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DesktopNav active="history" />

      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex gap-1.5 mb-4">
              {[0, 0.15, 0.3].map((delay, i) => (
                <div
                  key={i}
                  className="w-3 h-3 bg-slate-900 dark:bg-white rounded-full animate-bounce"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading history…</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="text-6xl mb-6">📝</div>
            <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No Practice History Yet
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-md">
              Complete a PTE practice task to see your history and track progress here.
            </p>
            <Link
              href="/practice"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-slate-950 dark:bg-white dark:text-slate-950 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all hover:shadow-lg"
            >
              Start Practicing
            </Link>
          </div>
        ) : (
          <>
            {/* Task type filter */}
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1 animate-fade-in">
              {typeOptions.map((type) => {
                const label = type === "all" ? "All" : TASK_LABELS[type]
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
                        ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                        : "bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-slate-500"
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
                  placeholder="Search by task type, feedback, or stimulus text…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => { setIsSelectMode(!isSelectMode); setSelectedIds(new Set()) }}
                  className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                    isSelectMode
                      ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white"
                      : "border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {isSelectMode ? "Cancel" : "Select"}
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <button
                      onClick={() => setIsExportOpen(!isExportOpen)}
                      className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Export
                    </button>
                    {isExportOpen && (
                      <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10">
                        <button onClick={() => handleExport("json")}
                          className="w-full px-4 py-2 text-xs text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-t-lg">
                          Export JSON
                        </button>
                        <button onClick={() => handleExport("csv")}
                          className="w-full px-4 py-2 text-xs text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-b-lg">
                          Export CSV
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {isSelectMode && (
                <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <button onClick={toggleSelectAll}
                      className="text-xs text-slate-900 dark:text-white hover:underline">
                      {selectedIds.size === filteredTasks.length ? "Deselect All" : "Select All"}
                    </button>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedIds.size} selected
                    </span>
                  </div>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 bg-white dark:bg-slate-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete Selected
                  </button>
                </div>
              )}
            </div>

            {/* Task list */}
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {searchQuery
                  ? `${filteredTasks.length} result(s) for "${searchQuery}"`
                  : `${filteredTasks.length} practice task(s)`}
              </p>

              {filteredTasks.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 dark:text-slate-400">No tasks match your search.</p>
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
