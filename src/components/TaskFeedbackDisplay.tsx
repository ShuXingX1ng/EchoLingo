"use client"

import PronunciationFeedback from "@/components/PronunciationFeedback"
import { useTranslation } from "@/lib/i18n"
import type { TaskFeedback, DimensionScores, TaskScoreCard } from "@/types"

interface Props {
  feedback: TaskFeedback
  stimulus?: string
  stimulusLabel?: string
  responseLabel?: string
  responseText?: string
}

export default function TaskFeedbackDisplay({
  feedback,
  stimulus,
  stimulusLabel,
  responseLabel,
  responseText,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      {feedback.scoreCard && (
        <ScoreCardBlock card={feedback.scoreCard} />
      )}

      {stimulus && (
        <div className="border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/50">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">{stimulusLabel ?? t("practiceTask.common.passage")}</p>
          <p className="text-sm leading-7 text-slate-700 dark:text-slate-300 font-serif">{stimulus}</p>
        </div>
      )}

      {responseText && (
        <div className="border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
            {responseLabel ?? t("taskFeedback.yourResponse")}
          </p>
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300 italic">{responseText}</p>
        </div>
      )}

      {feedback.pronunciationAssessment && (
        <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-4">
            {t("practiceTask.read-aloud.azurePronunciation")}
          </p>
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: t("pronunciation.overall"), score: feedback.pronunciationAssessment.score },
              { label: t("pronunciation.accuracy"), score: feedback.pronunciationAssessment.accuracyScore },
              { label: t("pronunciation.fluency"), score: feedback.pronunciationAssessment.fluencyScore },
              { label: t("pronunciation.completeness"), score: feedback.pronunciationAssessment.completenessScore },
            ].map(({ label, score }) => (
              <div key={label} className="text-center">
                <ScoreBadge score={score} />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</p>
              </div>
            ))}
          </div>
          <PronunciationFeedback assessment={feedback.pronunciationAssessment} />
        </div>
      )}

      {feedback.dimensionScores && (
        <DimensionScoresBlock scores={feedback.dimensionScores} />
      )}

      <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)] space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t("practiceTask.common.aiFeedback")}</p>

        <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{feedback.summary}</p>

        {feedback.details && <DetailsBlock details={feedback.details} />}

        {feedback.strengths.length > 0 && (
          <div className="border-t border-slate-100 dark:border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400 mb-2">{t("practiceTask.common.strengths")}</p>
            <ul className="space-y-1">
              {feedback.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <span className="text-emerald-500 shrink-0">+</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback.weaknesses.length > 0 && (
          <div className="border-t border-slate-100 dark:border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600 dark:text-red-400 mb-2">{t("practiceTask.common.areasToImprove")}</p>
            <ul className="space-y-1">
              {feedback.weaknesses.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <span className="text-red-400 shrink-0">–</span>{w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback.suggestions.length > 0 && (
          <div className="border-t border-slate-100 dark:border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">{t("practiceTask.common.suggestions")}</p>
            <ul className="space-y-1">
              {feedback.suggestions.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="shrink-0 tabular-nums text-slate-400">{i + 1}.</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback.coachSuggestions && feedback.coachSuggestions.length > 0 && (
          <div className="border-t border-slate-100 dark:border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400 mb-2">
              {t("taskFeedback.targetedCoaching")}
            </p>
            <ul className="space-y-1">
              {feedback.coachSuggestions.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="text-blue-400 shrink-0">→</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreCardBlock({ card }: { card: TaskScoreCard }) {
  const { t } = useTranslation()
  const pct = card.max > 0 ? card.earned / card.max : 0
  const color = pct >= 0.8
    ? "text-emerald-700 dark:text-emerald-300"
    : pct >= 0.5
    ? "text-yellow-700 dark:text-yellow-300"
    : "text-red-700 dark:text-red-300"
  const barColor = pct >= 0.8
    ? "bg-emerald-500"
    : pct >= 0.5
    ? "bg-yellow-400"
    : "bg-red-500"

  return (
    <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-3">{t("taskFeedback.score")}</p>
      <div className="flex items-end gap-2 mb-3">
        <span className={`text-4xl font-bold tabular-nums ${color}`}>{card.earned}</span>
        <span className="text-xl text-slate-400 mb-0.5">/ {card.max}</span>
        <span className="text-sm text-slate-400 mb-1 ml-1">{t("taskFeedback.pts")}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80
    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"
    : score >= 60
    ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800"
    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-sm font-semibold ${cls}`}>
      {score}
    </span>
  )
}

function DimensionScoresBlock({ scores }: { scores: DimensionScores }) {
  const { t } = useTranslation()
  let dims: Array<{ label: string; score: number }> = []
  if (scores.section === "speaking") {
    dims = [
      { label: t("feedback.fluency"), score: scores.fluency },
      { label: t("feedback.pronunciation"), score: scores.pronunciation },
      { label: t("taskFeedback.dim.content"), score: scores.content },
    ]
  } else if (scores.section === "writing") {
    dims = [
      { label: t("feedback.grammar"), score: scores.grammar },
      { label: t("feedback.vocabulary"), score: scores.vocabulary },
      { label: t("taskFeedback.dim.form"), score: scores.form },
      { label: t("taskFeedback.dim.content"), score: scores.content },
    ]
  } else if (scores.section === "reading") {
    dims = [
      { label: t("feedback.vocabulary"), score: scores.vocabulary },
      { label: t("taskFeedback.dim.comprehension"), score: scores.comprehension },
    ]
  } else if (scores.section === "listening") {
    dims = [
      { label: t("taskFeedback.dim.comprehension"), score: scores.comprehension },
      { label: t("taskFeedback.dim.accuracy"), score: scores.accuracy },
    ]
  }

  return (
    <div className="border border-slate-900 bg-white p-5 dark:border-white/15 dark:bg-slate-900 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {t("taskFeedback.dimensionScores")}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{t("taskFeedback.referenceOnly")}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {dims.map(({ label, score }) => (
          <div key={label} className="text-center">
            <ScoreBadge score={score} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailsBlock({ details }: { details: NonNullable<TaskFeedback["details"]> }) {
  const { t } = useTranslation()
  const rows: Array<{ label: string; value: string }> = []

  if ("oralFluency" in details) rows.push({ label: t("taskFeedback.detail.oralFluency"), value: details.oralFluency })
  if ("pronunciation" in details) rows.push({ label: t("feedback.pronunciation"), value: details.pronunciation })
  if ("contentAccuracy" in details) rows.push({ label: t("taskFeedback.detail.contentAccuracy"), value: details.contentAccuracy })
  if ("contentCoverage" in details) rows.push({ label: t("taskFeedback.detail.contentCoverage"), value: details.contentCoverage })
  if ("fluency" in details) rows.push({ label: t("feedback.fluency"), value: details.fluency })
  if ("wordAccuracy" in details && details.wordAccuracy) rows.push({ label: t("taskFeedback.detail.wordAccuracy"), value: details.wordAccuracy })
  if ("content" in details && details.content) rows.push({ label: t("taskFeedback.detail.content"), value: details.content })
  if ("grammar" in details && details.grammar) rows.push({ label: t("feedback.grammar"), value: details.grammar })
  if ("vocabulary" in details && details.vocabulary) rows.push({ label: t("feedback.vocabulary"), value: details.vocabulary })
  if ("structure" in details && details.structure) rows.push({ label: t("taskFeedback.detail.structure"), value: details.structure })
  if ("accuracy" in details) rows.push({ label: t("taskFeedback.detail.accuracy"), value: details.accuracy })
  if ("orderAccuracy" in details) rows.push({ label: t("taskFeedback.detail.orderAccuracy"), value: details.orderAccuracy })
  if ("logicFeedback" in details) rows.push({ label: t("taskFeedback.detail.textLogic"), value: details.logicFeedback })
  if ("answerAccuracy" in details) rows.push({ label: t("taskFeedback.detail.answerAccuracy"), value: details.answerAccuracy })
  if ("readingComprehension" in details) rows.push({ label: t("taskFeedback.detail.readingComprehension"), value: details.readingComprehension })
  if ("writingQuality" in details) rows.push({ label: t("taskFeedback.detail.writingQuality"), value: details.writingQuality })
  if ("listeningComprehension" in details) rows.push({ label: t("taskFeedback.detail.listeningComprehension"), value: details.listeningComprehension })

  if (rows.length === 0) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 dark:border-white/10 pt-4">
      {rows.map(({ label, value }) => (
        <div key={label}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">{label}</p>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{value}</p>
        </div>
      ))}
    </div>
  )
}
