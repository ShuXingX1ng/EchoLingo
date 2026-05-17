"use client";

import { useState, useRef, useCallback } from "react";
import type { PronunciationAssessmentResult } from "@/types";
import { getTopicById, getRandomTopic } from "@/lib/topics";
import { startAudioCapture, stopAudioCapture, type AudioCapture } from "@/lib/audio-utils";

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
  const audioCaptureRef = useRef<AudioCapture | null>(null);

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
      const capture = await startAudioCapture();
      audioCaptureRef.current = capture;
      setPhase("recording");
    } catch (err) {
      setError("Failed to access microphone. Please check permissions.");
      console.error("Audio capture error:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!audioCaptureRef.current) return;
    const blob = stopAudioCapture(audioCaptureRef.current);
    audioCaptureRef.current = null;
    return blob;
  }, []);

  const evaluatePronunciation = useCallback(async () => {
    const audioBlob = stopRecording();
    if (!audioBlob) {
      setError("No audio recorded. Please try again.");
      setPhase("listening");
      return;
    }

    const currentSentence = sentences[currentSentenceIndex];
    if (!currentSentence) return;

    setPhase("evaluating");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("text", currentSentence);

      const response = await fetch("/api/pronunciation", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Pronunciation assessment failed.");
      }

      const result: PronunciationAssessmentResult = await response.json();
      setAssessmentResult(result);
      setAllResults((prev) => [
        ...prev,
        { sentence: currentSentence, score: result.score, assessment: result },
      ]);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assessment failed.");
      setPhase("listening");
    }
  }, [stopRecording, sentences, currentSentenceIndex]);

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
    stopRecording,
    evaluatePronunciation,
    nextSentence,
    tryAgain,
    resetPractice,
    goToListening,
    setError,
  };
}
