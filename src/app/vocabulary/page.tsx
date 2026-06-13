"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import DesktopNav from "@/components/DesktopNav"
import { getVocabulary, deleteVocabulary } from "@/lib/unified-vocabulary"
import type { VocabularyEntry } from "@/types"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function VocabularyCard({
  entry,
  onDelete,
}: {
  entry: VocabularyEntry
  onDelete: () => void
}) {
  return (
    <div className="bg-[var(--surface)] rounded-xl p-4 sm:p-5 border border-[var(--border)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-[var(--foreground)] break-words">{entry.text}</h3>
            {entry.phonetic && (
              <span className="text-sm text-[var(--text-muted)]">/{entry.phonetic}/</span>
            )}
          </div>

          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <ul className="mt-2 space-y-1">
            {entry.entries.map((e, i) => (
              <li key={i} className="text-sm text-[var(--foreground)] flex gap-2">
                {e.pos && (
                  <span className="shrink-0 text-emerald-600 dark:text-emerald-400 font-medium">{e.pos}</span>
                )}
                <span className="break-words">{e.meaning}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-[var(--text-muted)] mt-2">{formatDate(entry.createdAt)}</p>
        </div>

        <button
          onClick={onDelete}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
          title="Delete"
          aria-label={`删除 ${entry.text}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function VocabularyPage() {
  const [entries, setEntries] = useState<VocabularyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getVocabulary()
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id)) // optimistic
    await deleteVocabulary(id)
  }, [])

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <DesktopNav />

      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">生词本</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {loading ? "加载中…" : `${entries.length} 个生词`}
            </p>
          </div>
          <Link
            href="/practice"
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            去练习 →
          </Link>
        </div>

        {!loading && entries.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[var(--text-muted)]">还没有收藏生词。</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              在练习页选中单词，点击“译”查词，再点收藏即可加入这里。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <VocabularyCard
                key={entry.id}
                entry={entry}
                onDelete={() => handleDelete(entry.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
