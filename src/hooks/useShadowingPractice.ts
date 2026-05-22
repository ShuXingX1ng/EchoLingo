"use client";

import { useState, useCallback } from "react";
import type { PronunciationAssessmentResult } from "@/types";
import { getTopicById, getRandomTopic } from "@/lib/topics";
import { fetchPronunciationAssessment } from "@/lib/feedback-actions";
import { useAudioRecorder } from "./useAudioRecorder";

export type ShadowingPhase = "setup" | "listening" | "recording" | "evaluating" | "result" | "summary";
export type ShadowingMode = "part1" | "part2" | "part3";

export interface ShadowingResult {
  sentence: string;
  score: number;
  assessment: PronunciationAssessmentResult;
}

export function useShadowingPractice() {
  const [phase, setPhase] = useState<ShadowingPhase>("setup");
  const [practiceMode, setPracticeMode] = useState<ShadowingMode>("part1");
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [assessmentResult, setAssessmentResult] = useState<PronunciationAssessmentResult | null>(null);
  const [allResults, setAllResults] = useState<ShadowingResult[]>([]);
  const [topicName, setTopicName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { startRecording: startAudioRecording, stopRecording: stopAudioRecording } = useAudioRecorder();

  const generateSentences = useCallback((mode: ShadowingMode, topicId?: string): string[] => {
    const topic = topicId ? getTopicById(topicId) : getRandomTopic();
    if (!topic) return [];

    setTopicName(topic.name);

    switch (mode) {
      case "part1":
        return topic.part1Questions.slice(0, 5);
      case "part2":
        return topic.part2CueCard
          .split(/[.。]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      case "part3":
        return topic.part3Questions.slice(0, 4);
      default:
        return topic.part1Questions.slice(0, 5);
    }
  }, []);

  const startPractice = useCallback((mode: ShadowingMode, topicId?: string) => {
    const sentenceList = generateSentences(mode, topicId);
    if (sentenceList.length === 0) {
      setError("No sentences available for this topic.");
      return;
    }
    setPracticeMode(mode);
    setSentences(sentenceList);
    setCurrentSentenceIndex(0);
    setAllResults([]);
    setAssessmentResult(null);
    setError(null);
    setPhase("listening");
  }, [generateSentences]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      await startAudioRecording();
      setPhase("recording");
    } catch (err) {
      setError("Failed to access microphone. Please check permissions.");
      console.error("Audio capture error:", err);
    }
  }, [startAudioRecording]);

  const evaluatePronunciation = useCallback(async () => {
    const audioBlob = stopAudioRecording();
    if (!audioBlob) {
      setError("No audio recorded. Please try again.");
      setPhase("listening");
      return;
    }

    const currentSentence = sentences[currentSentenceIndex];
    if (!currentSentence) return;

    setPhase("evaluating");

    const result = await fetchPronunciationAssessment(audioBlob, currentSentence);
    if (!result) {
      setError("Assessment failed.");
      setPhase("listening");
      return;
    }

    setAssessmentResult(result);
    setAllResults((prev) => [
      ...prev,
      { sentence: currentSentence, score: result.score, assessment: result },
    ]);
    setPhase("result");
  }, [stopAudioRecording, sentences, currentSentenceIndex]);

  const nextSentence = useCallback(() => {
    if (currentSentenceIndex < sentences.length - 1) {
      setCurrentSentenceIndex((prev) => prev + 1);
      setAssessmentResult(null);
      setPhase("listening");
    } else {
      setPhase("summary");
    }
  }, [currentSentenceIndex, sentences.length]);

  const tryAgain = useCallback(() => {
    setAssessmentResult(null);
    setPhase("listening");
  }, []);

  const resetPractice = useCallback(() => {
    setPhase("setup");
    setSentences([]);
    setCurrentSentenceIndex(0);
    setAssessmentResult(null);
    setAllResults([]);
    setError(null);
  }, []);

  const goToListening = useCallback(() => {
    setPhase("listening");
  }, []);

  return {
    // State
    phase,
    practiceMode,
    sentences,
    currentSentenceIndex,
    assessmentResult,
    allResults,
    topicName,
    error,
    // Actions
    startPractice,
    startRecording,
    evaluatePronunciation,
    nextSentence,
    tryAgain,
    resetPractice,
    goToListening,
    setError,
  };
}
