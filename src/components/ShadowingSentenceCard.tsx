"use client";

import { useTranslation } from "@/lib/i18n";
import type { PronunciationAssessmentResult } from "@/types";
import VoiceOutput from "./VoiceOutput";
import VoiceVisualizer from "./VoiceVisualizer";
import PronunciationFeedback from "./PronunciationFeedback";

interface ShadowingSentenceCardProps {
  sentence: string;
  isPlaying: boolean;
  isRecording: boolean;
  isEvaluating: boolean;
  assessment: PronunciationAssessmentResult | null;
  onRecord: () => void;
  onStopRecord: () => void;
  onNext: () => void;
  onTryAgain: () => void;
}

export default function ShadowingSentenceCard({
  sentence,
  isRecording,
  isEvaluating,
  assessment,
  onRecord,
  onStopRecord,
  onNext,
  onTryAgain,
}: ShadowingSentenceCardProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Sentence Display */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-700">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          {t("shadowing.listenAndRepeat")}
        </p>
        <p className="text-lg font-medium text-slate-900 dark:text-white leading-relaxed">
          {sentence}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <VoiceOutput text={sentence} autoPlay={false} />
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {t("shadowing.playTTS")}
          </span>
        </div>
      </div>

      {/* Recording Area */}
      <div className="p-6">
        {!assessment ? (
          <div className="flex flex-col items-center gap-4">
            {!isRecording && !isEvaluating && (
              <button
                onClick={onRecord}
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-lg hover:shadow-xl active:scale-95"
                aria-label={t("shadowing.startRecording")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-8 h-8"
                >
                  <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                  <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.041h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.041a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                </svg>
              </button>
            )}

            {isRecording && (
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={onStopRecord}
                  className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-lg animate-pulse"
                  aria-label={t("shadowing.stopRecording")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-8 h-8"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <VoiceVisualizer isActive={true} type="recording" />
                <p className="text-sm text-red-500 font-medium">
                  {t("shadowing.recording")}
                </p>
              </div>
            )}

            {isEvaluating && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("shadowing.evaluating")}
                </p>
              </div>
            )}

            {!isRecording && !isEvaluating && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t("shadowing.tapToRecord")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <PronunciationFeedback assessment={assessment} />
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={onTryAgain}
                className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("shadowing.tryAgain")}
              </button>
              <button
                onClick={onNext}
                className="px-5 py-2.5 text-sm font-medium text-white bg-slate-950 rounded-xl hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 transition-colors"
              >
                {t("shadowing.nextSentence")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
