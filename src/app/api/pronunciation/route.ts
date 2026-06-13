import { NextResponse } from "next/server";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

export interface PronunciationAssessmentResult {
  score: number; // 整体发音分数 0-100
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  words: WordAssessment[];
  summary: string; // 简要反馈
}

export interface WordAssessment {
  word: string;
  score: number;
  accuracyScore: number;
  errorType?: string; // None, Omission, Insertion, Mispronunciation
  phonemes?: PhonemeAssessment[];
}

export interface PhonemeAssessment {
  phoneme: string;
  score: number;
  accuracyScore: number;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    const referenceText = formData.get("text") as string;

    console.log("Pronunciation assessment request:", {
      audioSize: audioFile?.size,
      audioType: audioFile?.type,
      textLength: referenceText?.length,
      text: referenceText?.substring(0, 50) + "...",
    });

    if (!audioFile || !referenceText) {
      return NextResponse.json(
        { error: "Audio file and reference text are required" },
        { status: 400 }
      );
    }

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      console.error("Azure Speech credentials not configured");
      return NextResponse.json(
        { error: "Azure Speech credentials not configured" },
        { status: 500 }
      );
    }

    console.log("Azure config:", { region: speechRegion, keyLength: speechKey.length });

    // Convert File to ArrayBuffer
    const audioBuffer = await audioFile.arrayBuffer();
    console.log("Audio buffer size:", audioBuffer.byteLength, "Audio type:", audioFile.type);

    // Create speech config
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    speechConfig.speechRecognitionLanguage = "en-US";

    // Create audio config from WAV buffer
    const audioConfig = sdk.AudioConfig.fromWavFileInput(
      Buffer.from(audioBuffer),
      "audio.wav"
    );

    // Create pronunciation assessment config
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true // enableMiscue
    );

    // Create recognizer
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    // Apply pronunciation assessment config to recognizer
    pronunciationConfig.applyTo(recognizer);

    // Perform pronunciation assessment
    const result = await new Promise<sdk.PronunciationAssessmentResult>(
      (resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            console.log("Azure recognition result:", {
              reason: result.reason,
              reasonText: sdk.ResultReason[result.reason],
              text: result.text,
              errorDetails: result.errorDetails,
            });

            if (result.reason === sdk.ResultReason.Canceled) {
              const cancellation = sdk.CancellationDetails.fromResult(result);
              console.error("Azure recognition canceled:", {
                reason: cancellation.reason,
                errorDetails: cancellation.errorDetails,
              });
              reject(new Error(`Azure recognition canceled: ${cancellation.errorDetails}`));
              recognizer.close();
              return;
            }

            if (result.reason === sdk.ResultReason.NoMatch) {
              console.warn("Azure NoMatch — no speech detected in audio");
              reject(new Error("no_speech_detected"));
              recognizer.close();
              return;
            }

            const pronunciationResult =
              sdk.PronunciationAssessmentResult.fromResult(result);
            resolve(pronunciationResult);
            recognizer.close();
          },
          (error) => {
            reject(error);
            recognizer.close();
          }
        );
      }
    );

    // Extract word-level details
    const words: WordAssessment[] = [];
    const detailedResult = result.detailResult;

    if (detailedResult && detailedResult.Words) {
      for (const word of detailedResult.Words) {
        const wordAssessment: WordAssessment = {
          word: word.Word,
          score: word.PronunciationAssessment?.AccuracyScore || 0,
          accuracyScore: word.PronunciationAssessment?.AccuracyScore || 0,
          errorType: word.PronunciationAssessment?.ErrorType || "None",
        };

        // Extract phoneme-level details
        if (word.Phonemes) {
          wordAssessment.phonemes = word.Phonemes.map((phoneme) => ({
            phoneme: phoneme.Phoneme || "",
            score: 0, // Phoneme-level scores not available in this SDK version
            accuracyScore: 0,
          }));
        }

        words.push(wordAssessment);
      }
    }

    // Generate summary
    const summary = generateSummary(
      result.pronunciationScore,
      result.accuracyScore,
      result.fluencyScore,
      result.completenessScore,
      words
    );

    const assessmentResult: PronunciationAssessmentResult = {
      score: Math.round(result.pronunciationScore),
      accuracyScore: Math.round(result.accuracyScore),
      fluencyScore: Math.round(result.fluencyScore),
      completenessScore: Math.round(result.completenessScore),
      words,
      summary,
    };

    return NextResponse.json(assessmentResult);
  } catch (error) {
    if (error instanceof Error && error.message === "no_speech_detected") {
      return NextResponse.json(
        { error: "No speech detected. Please check your microphone and try again." },
        { status: 422 }
      );
    }
    console.error("Pronunciation assessment error:", error);
    return NextResponse.json(
      { error: "Failed to assess pronunciation. Please try again." },
      { status: 500 }
    );
  }
}

function generateSummary(
  overallScore: number,
  accuracyScore: number,
  fluencyScore: number,
  completenessScore: number,
  words: WordAssessment[]
): string {
  const parts: string[] = [];

  // Overall assessment
  if (overallScore >= 90) {
    parts.push("Excellent pronunciation! Very clear and natural.");
  } else if (overallScore >= 80) {
    parts.push("Good pronunciation with minor areas for improvement.");
  } else if (overallScore >= 70) {
    parts.push("Fair pronunciation. Some words need more practice.");
  } else if (overallScore >= 60) {
    parts.push("Pronunciation needs improvement. Focus on clarity.");
  } else {
    parts.push("Significant pronunciation challenges detected.");
  }

  // Specific feedback
  if (accuracyScore < 70) {
    parts.push("Focus on pronouncing individual sounds more accurately.");
  }

  if (fluencyScore < 70) {
    parts.push("Try to speak more smoothly with fewer pauses.");
  }

  if (completenessScore < 70) {
    parts.push("Make sure to pronounce all words completely.");
  }

  // Highlight mispronounced words
  const mispronounced = words.filter(
    (w) => w.errorType === "Mispronunciation" && w.score < 70
  );
  if (mispronounced.length > 0) {
    const wordList = mispronounced.map((w) => `"${w.word}"`).join(", ");
    parts.push(`Words to practice: ${wordList}`);
  }

  return parts.join(" ");
}
