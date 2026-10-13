import { apiPostBlob } from "@/lib/api-client"

// Azure TTS voice and pace used for every spoken Stimulus.
export const STIMULUS_VOICE = "en-US-AriaNeural"
export const DEFAULT_SPEECH_RATE = 0.85

/** Synthesize `text` through the backend and return the audio. */
export function synthesizeStimulus(text: string, rate: number = DEFAULT_SPEECH_RATE): Promise<Blob> {
  return apiPostBlob("/api/tts", { text, voice: STIMULUS_VOICE, rate }, { timeoutMs: 30000 })
}
