"use client";

import { useState, useRef, useCallback } from "react";
import { encodeWAV } from "@/lib/audio-utils";

export interface UseAudioRecorderOptions {
  sampleRate?: number;
  maxChunks?: number;
}

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Blob | null;
}

export function useAudioRecorder(
  options: UseAudioRecorderOptions = {}
): UseAudioRecorderReturn {
  const { sampleRate = 16000, maxChunks = 1000 } = options;

  const [isRecording, setIsRecording] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioDataRef = useRef<Float32Array[]>([]);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    mediaStreamRef.current = stream;
    audioDataRef.current = [];

    const audioContext = new AudioContext({ sampleRate });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const data = new Float32Array(inputData.length);
      data.set(inputData);
      if (audioDataRef.current.length < maxChunks) {
        audioDataRef.current.push(data);
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setIsRecording(true);
  }, [sampleRate, maxChunks]);

  const stopRecording = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);

    if (audioDataRef.current.length > 0) {
      const wavBlob = encodeWAV(audioDataRef.current, sampleRate);
      audioDataRef.current = [];
      return wavBlob;
    }
    audioDataRef.current = [];
    return null;
  }, [sampleRate]);

  return { isRecording, startRecording, stopRecording };
}
