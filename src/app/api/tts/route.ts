import { NextResponse } from "next/server";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

export async function POST(request: Request) {
  try {
    const { text, voice, rate } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return NextResponse.json(
        { error: "Azure Speech credentials not configured" },
        { status: 500 }
      );
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    speechConfig.speechSynthesisVoiceName = voice || "en-US-AriaNeural";

    // Set speech rate (convert from multiplier to SSML rate string)
    const ratePercent = Math.round(((rate || 1.0) - 1) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    // Build SSML for better control
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
        <voice name="${voice || "en-US-AriaNeural"}">
          <prosody rate="${rateStr}">
            ${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </prosody>
        </voice>
      </speak>
    `;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    const result = await new Promise<sdk.SpeechSynthesisResult>(
      (resolve, reject) => {
        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            resolve(result);
            synthesizer.close();
          },
          (error) => {
            reject(error);
            synthesizer.close();
          }
        );
      }
    );

    if (
      result.reason === sdk.ResultReason.SynthesizingAudioCompleted &&
      result.audioData
    ) {
      return new NextResponse(result.audioData, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } else {
      return NextResponse.json(
        { error: "Speech synthesis failed" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json(
      { error: "Failed to synthesize speech" },
      { status: 500 }
    );
  }
}
