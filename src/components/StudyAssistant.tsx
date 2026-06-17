"use client"

import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { useTranslation } from "@/lib/i18n"
import {
  askStudyAssistant,
  type StudyAssistantMessage,
  type StudyAssistantReply,
} from "@/lib/study-assistant"

// Preset chip keys (pulled from i18n)
const PRESET_KEYS = [
  "studyAssistant.preset1",
  "studyAssistant.preset2",
  "studyAssistant.preset3",
  "studyAssistant.preset4",
] as const

function BotIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M16.5 7.5h-9v9h9v-9Z" />
      <path
        fillRule="evenodd"
        d="M8.25 2.25A.75.75 0 0 1 9 3v.75h2.25V3a.75.75 0 0 1 1.5 0v.75H15V3a.75.75 0 0 1 1.5 0v.75h.75a3 3 0 0 1 3 3v.75H21A.75.75 0 0 1 21 9h-.75v2.25H21a.75.75 0 0 1 0 1.5h-.75V15H21a.75.75 0 0 1 0 1.5h-.75v.75a3 3 0 0 1-3 3h-.75V21a.75.75 0 0 1-1.5 0v-.75h-2.25V21a.75.75 0 0 1-1.5 0v-.75H9V21a.75.75 0 0 1-1.5 0v-.75h-.75a3 3 0 0 1-3-3v-.75H3A.75.75 0 0 1 3 15h.75v-2.25H3a.75.75 0 0 1 0-1.5h.75V9H3a.75.75 0 0 1 0-1.5h.75v-.75a3 3 0 0 1 3-3h.75V3a.75.75 0 0 1 .75-.75ZM6 6.75A.75.75 0 0 1 6.75 6h10.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V6.75Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" />
    </svg>
  )
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
    </svg>
  )
}

interface MessageBubble {
  role: "user" | "assistant"
  content: string
  reply?: StudyAssistantReply
}

export default function StudyAssistant() {
  const { t, locale } = useTranslation()
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<StudyAssistantMessage[]>([])
  const [bubbles, setBubbles] = useState<MessageBubble[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 50)
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      setError("")
      const userMsg: StudyAssistantMessage = { role: "user", content: trimmed }
      const nextHistory = [...history, userMsg]

      setBubbles((prev) => [...prev, { role: "user", content: trimmed }])
      setHistory(nextHistory)
      setInput("")
      setLoading(true)
      scrollToBottom()

      try {
        const reply = await askStudyAssistant(nextHistory, locale)
        const assistantMsg: StudyAssistantMessage = { role: "assistant", content: reply.reply }
        setHistory((prev) => [...prev, assistantMsg])
        setBubbles((prev) => [
          ...prev,
          { role: "assistant", content: reply.reply, reply },
        ])
        scrollToBottom()
      } catch (e) {
        setError(e instanceof Error ? e.message : t("studyAssistant.error"))
      } finally {
        setLoading(false)
      }
    },
    [history, loading, locale, t, scrollToBottom]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      sendMessage(input)
    },
    [input, sendMessage]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        sendMessage(input)
      }
    },
    [input, sendMessage]
  )

  const handleOpen = useCallback(() => {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const handlePreset = useCallback(
    (key: string) => {
      sendMessage(t(key))
    },
    [sendMessage, t]
  )

  const isEmptyConversation = bubbles.length === 0

  return (
    <>
      {/* Floating launcher button — bottom-right, sits above mobile nav (mb-20 on small screens) */}
      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={t("studyAssistant.launcher")}
          className="fixed bottom-20 right-4 sm:bottom-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-600 text-white shadow-2xl ring-1 ring-emerald-700/20 hover:bg-emerald-700 active:scale-95 transition-all"
        >
          <BotIcon className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold hidden sm:inline">{t("studyAssistant.title")}</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-4 w-[calc(100vw-2rem)] sm:w-96 max-w-sm z-50 animate-slide-up">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[70vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2">
                <BotIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {t("studyAssistant.title")}
                </span>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label={t("studyAssistant.close")}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 -mr-1 p-1 rounded-md transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Preset chips — shown only when conversation is empty */}
              {isEmptyConversation && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                    {t("studyAssistant.title")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handlePreset(key)}
                        disabled={loading}
                        className="text-xs px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversation bubbles */}
              {bubbles.map((bubble, idx) => (
                <div
                  key={idx}
                  className={`flex ${bubble.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      bubble.role === "user"
                        ? "bg-emerald-600 text-white rounded-br-sm"
                        : "bg-gray-100 dark:bg-gray-700 text-[var(--foreground)] rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{bubble.content}</p>

                    {/* Links and practice actions for assistant messages */}
                    {bubble.role === "assistant" && bubble.reply && (
                      <div className="mt-2 space-y-1.5">
                        {bubble.reply.links.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {bubble.reply.links.map((link, li) => (
                              <Link
                                key={li}
                                href={link.route}
                                onClick={handleClose}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                              >
                                {link.label} →
                              </Link>
                            ))}
                          </div>
                        )}

                        {bubble.reply.practice && (
                          <Link
                            href={bubble.reply.practice.route}
                            onClick={handleClose}
                            className="mt-1.5 flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 active:scale-95 transition-all"
                          >
                            {t("studyAssistant.startPractice")}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-sm px-3 py-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      {t("studyAssistant.thinking")}
                    </p>
                  </div>
                </div>
              )}

              {/* Inline error */}
              {error && (
                <p className="text-xs text-red-500 dark:text-red-400 text-center px-2">{error}</p>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <form
              onSubmit={handleSubmit}
              className="px-3 py-3 border-t border-gray-100 dark:border-gray-700 shrink-0"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("studyAssistant.placeholder")}
                  rows={1}
                  disabled={loading}
                  className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-[var(--foreground)] placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 max-h-28 overflow-y-auto"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label={t("studyAssistant.send")}
                  className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <SendIcon className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
