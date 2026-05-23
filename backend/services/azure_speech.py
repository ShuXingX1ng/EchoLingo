"""
Azure Speech Service

Encapsulates Azure Speech SDK for TTS and Pronunciation Assessment.
"""

import os
from typing import List, Optional
from dataclasses import dataclass
import azure.cognitiveservices.speech as speechsdk
from models.schemas import (
    WordAssessment,
    PhonemeAssessment,
    PronunciationAssessmentResult,
)


@dataclass
class AzureSpeechConfig:
    """Azure Speech service configuration."""
    key: str
    region: str


class AzureSpeechService:
    """Service for Azure Speech SDK (TTS + Pronunciation Assessment)."""

    def __init__(self):
        self.key = os.getenv("AZURE_SPEECH_KEY")
        self.region = os.getenv("AZURE_SPEECH_REGION")

    def is_configured(self) -> bool:
        """Check if Azure Speech service is properly configured."""
        return bool(self.key and self.region)

    def _get_speech_config(self) -> speechsdk.SpeechConfig:
        """Create SpeechConfig from credentials."""
        if not self.is_configured():
            raise ValueError("Azure Speech credentials not configured")
        return speechsdk.SpeechConfig(subscription=self.key, region=self.region)

    async def synthesize_speech(
        self,
        text: str,
        voice: str = "en-US-AriaNeural",
        rate: float = 1.0,
    ) -> bytes:
        """
        Synthesize speech from text using Azure Neural TTS.

        Args:
            text: Text to synthesize
            voice: Azure Neural voice name
            rate: Speech rate (0.5 to 2.0, where 1.0 is normal)

        Returns:
            WAV audio data as bytes

        Raises:
            ValueError: If Azure is not configured or synthesis fails
        """
        speech_config = self._get_speech_config()
        speech_config.speech_synthesis_voice_name = voice

        # Build SSML for better control
        rate_percent = round((rate - 1) * 100)
        rate_str = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"

        # Escape text for XML
        escaped_text = (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

        ssml = f"""
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
            <voice name="{voice}">
                <prosody rate="{rate_str}">
                    {escaped_text}
                </prosody>
            </voice>
        </speak>
        """

        # Create synthesizer
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config)

        # Synthesize
        result = synthesizer.speak_ssml_async(ssml).get()

        if (
            result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted
            and result.audio_data
        ):
            return result.audio_data
        else:
            error_details = (
                result.cancellation_details.error_details
                if result.cancellation_details
                else "Unknown error"
            )
            raise ValueError(f"Speech synthesis failed: {error_details}")

    async def assess_pronunciation(
        self,
        audio_data: bytes,
        reference_text: str,
    ) -> PronunciationAssessmentResult:
        """
        Assess pronunciation using Azure Speech SDK.

        Args:
            audio_data: WAV audio data as bytes
            reference_text: The text that was spoken

        Returns:
            PronunciationAssessmentResult with detailed assessment

        Raises:
            ValueError: If Azure is not configured or assessment fails
        """
        speech_config = self._get_speech_config()
        speech_config.speech_recognition_language = "en-US"

        # Create audio config from WAV data
        audio_config = speechsdk.AudioConfig(stream=speechsdk.PushAudioInputStream())
        audio_stream = audio_config.stream
        audio_stream.write(audio_data)
        audio_stream.close()

        # Create pronunciation assessment config
        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True,
        )

        # Create recognizer
        speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, audio_config=audio_config
        )

        # Apply pronunciation assessment config
        pronunciation_config.apply_to(speech_recognizer)

        # Perform assessment
        result = speech_recognizer.recognize_once_async().get()

        if result.reason != speechsdk.ResultReason.RecognizedSpeech:
            error_details = (
                result.cancellation_details.error_details
                if result.cancellation_details
                else "Recognition failed"
            )
            raise ValueError(f"Pronunciation assessment failed: {error_details}")

        # Get pronunciation assessment result
        pronunciation_result = speechsdk.PronunciationAssessmentResult(result)

        # Extract word-level details
        words = self._extract_words(pronunciation_result)

        # Generate summary
        summary = self._generate_summary(
            pronunciation_result.pronunciation_score,
            pronunciation_result.accuracy_score,
            pronunciation_result.fluency_score,
            pronunciation_result.completeness_score,
            words,
        )

        return PronunciationAssessmentResult(
            score=round(pronunciation_result.pronunciation_score),
            accuracyScore=round(pronunciation_result.accuracy_score),
            fluencyScore=round(pronunciation_result.fluency_score),
            completenessScore=round(pronunciation_result.completeness_score),
            words=words,
            summary=summary,
        )

    def _extract_words(
        self, pronunciation_result: speechsdk.PronunciationAssessmentResult
    ) -> List[WordAssessment]:
        """Extract word-level assessment details."""
        words = []

        if not pronunciation_result.detail_result:
            return words

        detail = pronunciation_result.detail_result
        if "Words" not in detail:
            return words

        for word_data in detail["Words"]:
            word_assessment = WordAssessment(
                word=word_data.get("Word", ""),
                score=word_data.get("PronunciationAssessment", {}).get(
                    "AccuracyScore", 0
                ),
                accuracyScore=word_data.get("PronunciationAssessment", {}).get(
                    "AccuracyScore", 0
                ),
                errorType=word_data.get("PronunciationAssessment", {}).get(
                    "ErrorType", "None"
                ),
            )

            # Extract phoneme-level details if available
            if "Phonemes" in word_data:
                word_assessment.phonemes = [
                    PhonemeAssessment(
                        phoneme=p.get("Phoneme", ""),
                        score=0,  # Not available in this format
                        accuracyScore=0,
                    )
                    for p in word_data["Phonemes"]
                ]

            words.append(word_assessment)

        return words

    def _generate_summary(
        self,
        overall_score: float,
        accuracy_score: float,
        fluency_score: float,
        completeness_score: float,
        words: List[WordAssessment],
    ) -> str:
        """Generate human-readable summary of pronunciation assessment."""
        parts = []

        # Overall assessment
        if overall_score >= 90:
            parts.append("Excellent pronunciation! Very clear and natural.")
        elif overall_score >= 80:
            parts.append("Good pronunciation with minor areas for improvement.")
        elif overall_score >= 70:
            parts.append("Fair pronunciation. Some words need more practice.")
        elif overall_score >= 60:
            parts.append("Pronunciation needs improvement. Focus on clarity.")
        else:
            parts.append("Significant pronunciation challenges detected.")

        # Specific feedback
        if accuracy_score < 70:
            parts.append("Focus on pronouncing individual sounds more accurately.")

        if fluency_score < 70:
            parts.append("Try to speak more smoothly with fewer pauses.")

        if completeness_score < 70:
            parts.append("Make sure to pronounce all words completely.")

        # Highlight mispronounced words
        mispronounced = [
            w for w in words
            if w.errorType == "Mispronunciation" and w.score < 70
        ]
        if mispronounced:
            word_list = ", ".join(f'"{w.word}"' for w in mispronounced)
            parts.append(f"Words to practice: {word_list}")

        return " ".join(parts)


# Singleton instance
azure_speech_service = AzureSpeechService()
