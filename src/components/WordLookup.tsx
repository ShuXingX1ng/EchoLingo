"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { lookupWord } from "@/lib/word-lookup"
import { saveVocabulary } from "@/lib/unified-vocabulary"
import { isSaved as isSavedLocally } from "@/lib/vocabulary"
import type { WordLookupResult } from "@/types"

// Floating Word Lookup helper for Task Practice pages (never Mock Exam).
// Two capture routes hit the same translation path: a "译" button beside the
// browser's native text selection (all platforms), and dragging the selection
// onto the floating button (desktop). One-shot — no conversation history.

const MAX_SELECTION = 120 // chars; longer selections are ignored

type Phase = "idle" | "loading" | "result" | "error"

type SelPos = { x: number; y: number; text: string }

export default function WordLookup() {
  const [sel, setSel] = useState<SelPos | null>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [result, setResult] = useState<WordLookupResult | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // ── Selection detection ─────────────────────────────────────────────────────
  const readSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      setSel(null)
      return
    }
    const text = selection.toString().trim()
    if (!text || text.length > MAX_SELECTION) {
      setSel(null)
      return
    }
    // Ignore selections originating inside our own widget.
    const anchor = selection.anchorNode
    if (anchor && rootRef.current?.contains(anchor)) {
      setSel(null)
      return
    }
    try {
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      setSel({ x: rect.left + rect.width / 2, y: rect.top, text })
    } catch {
      setSel(null)
    }
  }, [])

  useEffect(() => {
    const hide = () => setSel(null)
    document.addEventListener("mouseup", readSelection)
    document.addEventListener("touchend", readSelection)
    document.addEventListener("scroll", hide, true)
    return () => {
      document.removeEventListener("mouseup", readSelection)
      document.removeEventListener("touchend", readSelection)
      document.removeEventListener("scroll", hide, true)
    }
  }, [readSelection])

  // ── Lookup ───────────────────────────────────────────────────────────────────
  const runLookup = useCallback(async (query: string) => {
    setSel(null)
    setOpen(true)
    setPhase("loading")
    setError("")
    setResult(null)
    setSaved(false)
    try {
      const data = await lookupWord(query)
      setResult(data)
      setSaved(isSavedLocally(data.text))
      setPhase("result")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed")
      setPhase("error")
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!result || saved) return
    setSaved(true) // optimistic
    try {
      await saveVocabulary(result)
    } catch {
      setSaved(false)
    }
  }, [result, saved])

  // ── Drag-and-drop onto the floating button ──────────────────────────────────
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const text = e.dataTransfer.getData("text/plain").trim()
      if (text) runLookup(text)
    },
    [runLookup]
  )

  return (
    <div ref={rootRef}>
      {/* Selection "译" button */}
      {sel && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // keep selection alive
          onClick={() => runLookup(sel.text)}
          aria-label={`翻译 “${sel.text}”`}
          className="fixed z-[60] -translate-x-1/2 -translate-y-full -mt-2 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-sm font-medium shadow-lg active:scale-95 transition-transform"
          style={{ left: sel.x, top: sel.y }}
        >
          译
        </button>
      )}

      {/* Result panel */}
      {open && (
        <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-slide-up">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-semibold text-[var(--foreground)]">查词</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-4 py-3 overflow-y-auto">
              {phase === "loading" && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">翻译中…</p>
              )}

              {phase === "error" && (
                <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
              )}

              {phase === "result" && result && (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-lg font-bold text-[var(--foreground)] break-words">{result.text}</h3>
                    {result.phonetic && (
                      <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">/{result.phonetic}/</span>
                    )}
                  </div>

                  {result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {result.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <ul className="space-y-1.5">
                    {result.entries.map((entry, i) => (
                      <li key={i} className="text-sm text-[var(--foreground)] flex gap-2">
                        {entry.pos && (
                          <span className="shrink-0 text-emerald-600 dark:text-emerald-400 font-medium">{entry.pos}</span>
                        )}
                        <span className="break-words">{entry.meaning}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-400">
                      {result.source === "dictionary" ? "词典" : "AI 翻译"}
                    </span>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saved}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        saved
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95"
                      }`}
                    >
                      {saved ? "★ 已收藏" : "☆ 收藏"}
                    </button>
                  </div>

                  <Link
                    href="/vocabulary"
                    className="block text-center text-xs text-emerald-600 dark:text-emerald-400 hover:underline pt-1"
                  >
                    查看生词本 →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating button + drop zone */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label="查词助手"
        title="选中文字后点“译”，或将选中文字拖到这里"
        className={`fixed bottom-6 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg transition-all active:scale-95 ${
          dragOver ? "bg-emerald-500 scale-110 ring-4 ring-emerald-300" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        译
      </button>
    </div>
  )
}
