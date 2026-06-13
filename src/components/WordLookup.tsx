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

// Heroicons-style "language / translate" glyph, shared by the floating button
// and the selection pill so the helper reads as a single tool.
function TranslateIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M9 2.25a.75.75 0 0 1 .75.75v1.506a49.38 49.38 0 0 1 5.343.371.75.75 0 1 1-.186 1.489c-.66-.083-1.323-.151-1.99-.206a18.67 18.67 0 0 1-2.969 6.323c.317.384.65.753.998 1.107a.75.75 0 1 1-1.07 1.052A18.902 18.902 0 0 1 9 14.092a18.8 18.8 0 0 1-5.45 5.174.75.75 0 1 1-.752-1.298A17.31 17.31 0 0 0 8.077 13.5a18.52 18.52 0 0 1-1.964-3.166.75.75 0 1 1 1.36-.632 16.99 16.99 0 0 0 1.692 2.722 17.21 17.21 0 0 0 2.642-5.641 47.5 47.5 0 0 0-8.35.05.75.75 0 0 1-.1-1.497 49.03 49.03 0 0 1 4.392-.413V3a.75.75 0 0 1 .75-.75Zm6.318 8.616a.75.75 0 0 1 .68.43l4.5 9.75a.75.75 0 0 1-1.36.629l-1.067-2.31h-5.504l-1.067 2.31a.75.75 0 1 1-1.36-.63l4.5-9.75a.75.75 0 0 1 .68-.429Zm0 2.557L13.61 17.25h3.418l-1.71-3.827Z" clipRule="evenodd" />
    </svg>
  )
}

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
          className="fixed z-[60] -translate-x-1/2 -translate-y-full -mt-2 inline-flex items-center gap-1 pl-2 pr-2.5 py-1.5 rounded-full bg-emerald-600 text-white text-sm font-medium shadow-lg ring-1 ring-emerald-700/20 active:scale-95 transition-transform"
          style={{ left: sel.x, top: sel.y }}
        >
          <TranslateIcon className="w-4 h-4" />
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
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 -mr-1 p-1 rounded-md transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" />
                </svg>
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
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        saved
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95"
                      }`}
                    >
                      {saved ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                          <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006Z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                        </svg>
                      )}
                      {saved ? "已收藏" : "收藏"}
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
        className={`fixed bottom-6 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg ring-1 ring-emerald-700/20 transition-all active:scale-95 ${
          dragOver ? "bg-emerald-500 scale-110 ring-4 ring-emerald-300" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        <TranslateIcon className="w-6 h-6" />
      </button>
    </div>
  )
}
