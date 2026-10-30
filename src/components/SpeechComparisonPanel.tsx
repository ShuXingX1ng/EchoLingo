"use client";

import type {
  SpeechEvaluationComparison,
  SpeechEvaluationFailure,
  SpeechEvaluationResult,
} from "@/types";
import { useTranslation } from "@/lib/i18n";
import { comparisonRows } from "@/lib/speech-comparison";
import { speechProviderName } from "@/lib/speech-evaluation";

interface SpeechComparisonPanelProps {
  comparison: SpeechEvaluationComparison;
  /** The primary EchoLingo result, or why there is none. */
  primary?: SpeechEvaluationResult;
  primaryError?: SpeechEvaluationFailure;
}

function score(value: number | null) {
  return value === null ? "—" : String(value);
}

function signed(value: number | null) {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value}`;
}

const CELL = "px-2 py-1 text-right tabular-nums";

/**
 * The developer Compare panel (roadmap §11): both providers' dimension
 * scores and their difference, both recognised texts, the words they judged
 * differently, EchoLingo's alignment status, and each provider's latency and
 * error. Shown only behind the Compare switch.
 */
export default function SpeechComparisonPanel({ comparison, primary, primaryError }: SpeechComparisonPanelProps) {
  const { t } = useTranslation();
  const baseline = comparison.baseline;
  const errors = [primaryError, comparison.baselineError].filter(
    (error): error is SpeechEvaluationFailure => Boolean(error),
  );

  return (
    <section className="space-y-4 border border-dashed border-slate-400 p-4 text-sm dark:border-slate-600">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t("speechComparison.title")}</p>

      <table className="w-full text-sm">
        <thead className="text-xs text-[var(--text-secondary)]">
          <tr>
            <th className="px-2 py-1 text-left font-medium" />
            <th className={`${CELL} font-medium`}>EchoLingo{primary && ` (${primary.scale})`}</th>
            <th className={`${CELL} font-medium`}>Azure{baseline && ` (${baseline.scale})`}</th>
            <th className={`${CELL} font-medium`}>{t("speechComparison.difference")}</th>
          </tr>
        </thead>
        <tbody>
          {comparisonRows(primary, comparison).map((row) => (
            <tr key={row.labelKey} className="border-t border-[var(--border)]">
              <td className="px-2 py-1">{t(row.labelKey)}</td>
              <td className={CELL}>{score(row.echolingo)}</td>
              <td className={CELL}>{score(row.azure)}</td>
              <td className={CELL}>{signed(row.difference)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-[var(--text-secondary)]">{t("speechComparison.differenceNote")}</p>

      <dl className="space-y-2">
        {([["EchoLingo", primary?.recognizedText], ["Azure", baseline?.recognizedText]] as const).map(
          ([name, text]) => (
            <div key={name}>
              <dt className="text-xs text-[var(--text-secondary)]">{t("speechComparison.recognized", { provider: name })}</dt>
              <dd className="italic">{text || t("speechComparison.notKept")}</dd>
            </div>
          ),
        )}
      </dl>

      <div>
        <p className="text-xs text-[var(--text-secondary)]">{t("speechComparison.disagreements")}</p>
        {comparison.wordDisagreements.length === 0 ? (
          <p>{t("speechComparison.noDisagreements")}</p>
        ) : (
          <ul className="space-y-0.5">
            {comparison.wordDisagreements.map((d, index) => (
              <li key={index}>
                &ldquo;{d.word}&rdquo; — EchoLingo: {t(`speechEvaluation.wordStatus.${d.echolingo}`)}, Azure:{" "}
                {t(`speechEvaluation.wordStatus.${d.azure}`)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {primary && (
        <p>
          <span className="text-xs text-[var(--text-secondary)]">{t("speechComparison.alignment")}</span>{" "}
          {(["word", "phoneme"] as const).map((level) => {
            const { status, reason } = primary.evidenceStatus[level];
            return `${level}: ${status}${reason ? ` (${reason})` : ""}`;
          }).join(" · ")}
          {primary.modelId && ` · ${primary.modelId}`}
        </p>
      )}

      <p>
        <span className="text-xs text-[var(--text-secondary)]">{t("speechComparison.latency")}</span>{" "}
        {Object.entries(comparison.latencyMs)
          .map(([provider, ms]) => `${speechProviderName({ provider })} ${Math.round(ms)} ms`)
          .join(" · ")}
      </p>

      {errors.map((error) => (
        <p key={error.provider} className="text-amber-700 dark:text-amber-400">
          {speechProviderName(error)}: {error.code} — {error.message}
        </p>
      ))}

      <p className="text-xs text-[var(--text-muted)]">
        {comparison.createdAt} · sha256 {comparison.recordingSha256.slice(0, 12)}
      </p>
    </section>
  );
}
