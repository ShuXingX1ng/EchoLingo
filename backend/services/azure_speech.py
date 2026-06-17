"""
Azure Speech Service

Encapsulates Azure Speech SDK for TTS and Pronunciation Assessment.
"""

import asyncio
import os
import tempfile
from typing import List
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

        # audio_config=None: synthesize to memory only, do not play through system speakers
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)

        # Synthesize — run blocking SDK call off the event loop thread
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: synthesizer.speak_ssml_async(ssml).get())

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

        # Write WAV to a temp file so AudioConfig can parse the RIFF header correctly.
        # PushAudioInputStream expects raw PCM (no header), so writing the full WAV blob
        # to it corrupts the audio and causes "No candidate response was captured".
        tmp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp_path = tmp_file.name
        try:
            tmp_file.write(audio_data)
            tmp_file.flush()
            tmp_file.close()

            audio_config = speechsdk.AudioConfig(filename=tmp_path)

            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=reference_text,
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
                enable_miscue=True,
            )

            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config, audio_config=audio_config
            )
            pronunciation_config.apply_to(speech_recognizer)

            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: speech_recognizer.recognize_once_async().get())
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        if result.reason != speechsdk.ResultReason.RecognizedSpeech:
            error_details = (
                result.cancellation_details.error_details
                if result.cancellation_details
                else "Recognition failed"
            )
            raise ValueError(f"Pronunciation assessment failed: {error_details}")

        pronunciation_result = speechsdk.PronunciationAssessmentResult(result)
        words = self._extract_words(pronunciation_result)
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
            recognizedText=result.text or None,
        )

    def _extract_words(
        self, pronunciation_result: speechsdk.PronunciationAssessmentResult
    ) -> List[WordAssessment]:
        """Extract word-level assessment details."""
        words = []

        if not pronunciation_result.words:
            return words

        for word_data in pronunciation_result.words:
            accuracy = round(word_data.accuracy_score or 0)
            error_type = word_data.error_type or "None"

            word_assessment = WordAssessment(
                word=word_data.word,
                score=accuracy,
                accuracyScore=accuracy,
                errorType=error_type,
            )

            if word_data.phonemes:
                word_assessment.phonemes = [
                    PhonemeAssessment(
                        phoneme=p.phoneme,
                        score=round(p.accuracy_score or 0),
                        accuracyScore=round(p.accuracy_score or 0),
                    )
                    for p in word_data.phonemes
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
