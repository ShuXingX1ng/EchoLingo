"""Speech Evaluation Worker (M4, `worker/`): audio decoding and refusal,
layered degradation, the HTTP contract, timeouts and busy handling, and the
`align_one` wrapper. The encoder and aligner are fakes unless a test says
otherwise; MFA is only run by the `mfa`-marked test."""

from __future__ import annotations

import io
import json
import sys
import threading
import time
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
import torch

from echolingo_speech.alignment.mfa import MFA_BIN_ENV_VAR, TextGridSpan
from echolingo_speech.bundles.bundle import load_bundle
from echolingo_speech.worker.aligner import Alignment, AlignmentError, MfaAligner
from echolingo_speech.worker.pipeline import (
    EncodedAudio,
    EvaluationError,
    Limits,
    SpeechEvaluationPipeline,
    aligned_words,
    decode_audio,
    reference_character_coverage,
    reference_coverage,
    reference_sentences,
    sentence_segments,
)

# The `bundle_inputs` fixture's encoder and layers.
ENCODER_ID = "test/tiny-wav2vec2"
ENCODER_REVISION = "a" * 40
LAYERS = (4, 12)
FRAMES_PER_SECOND = 50


def _wav(seconds=2.0, sample_rate=16000, channels=1, amplitude=0.1):
    t = np.arange(int(seconds * sample_rate)) / sample_rate
    tone = (amplitude * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32)
    buffer = io.BytesIO()
    sf.write(buffer, np.stack([tone] * channels, axis=1), sample_rate, format="WAV",
             subtype="PCM_16")
    return buffer.getvalue()


class FakeEncoder:
    model_id = ENCODER_ID
    revision = ENCODER_REVISION

    def __init__(self, recognized_text="we call it bear", layers=LAYERS):
        self.recognized_text = recognized_text
        self.layers = layers

    def encode(self, waveform):
        frames = max(1, int(waveform.shape[-1] / 16000 * FRAMES_PER_SECOND))
        generator = torch.Generator().manual_seed(0)
        hidden = torch.randn(len(self.layers), frames, 768, generator=generator)
        return EncodedAudio(hidden.half().float(), self.recognized_text)


def _span(start, end, text):
    return TextGridSpan(start, end, text)


WE_CALL_IT_BEAR = Alignment(
    words=[_span(0.2, 0.5, "we"), _span(0.5, 0.9, "call"), _span(0.9, 1.1, "it"),
           _span(1.1, 1.6, "bear")],
    phones=[_span(0.2, 0.3, "W"), _span(0.3, 0.5, "IY1"), _span(0.5, 0.6, "K"),
            _span(0.6, 0.8, "AO1"), _span(0.8, 0.9, "L"), _span(0.9, 1.0, "IH1"),
            _span(1.0, 1.1, "T"), _span(1.1, 1.3, "B"), _span(1.3, 1.6, "EH1")],
)


class FakeAligner:
    name = "fake-aligner"

    def __init__(self, alignment=WE_CALL_IT_BEAR, error=None):
        self.alignment = alignment
        self.error = error
        self.texts = []

    def version(self):
        return "0.0"

    def align(self, waveform, sample_rate, text):
        self.texts.append(text)
        if self.error is not None:
            raise self.error
        return self.alignment


@pytest.fixture
def make_pipeline(bundle_dir):
    bundle = load_bundle(bundle_dir)

    def make(encoder=None, aligner=None, limits=None):
        return SpeechEvaluationPipeline(
            bundle, encoder or FakeEncoder(), aligner or FakeAligner(), limits
        )

    return make


# --- decoding and refusals ------------------------------------------------------------


def test_decode_resamples_and_mixes_down_like_the_training_cache():
    waveform = decode_audio(_wav(seconds=2.0, sample_rate=8000, channels=2), Limits())

    assert waveform.shape == (1, 32000)
    assert waveform.dtype == torch.float32


def test_decode_keeps_pcm16_scaling():
    data = _wav(seconds=1.5)
    expected, _ = sf.read(io.BytesIO(data), dtype="float32")

    assert torch.equal(decode_audio(data, Limits())[0], torch.from_numpy(expected))


@pytest.mark.parametrize(
    ("data", "code", "status"),
    [
        (b"not audio at all", "invalid_audio", 422),
        (_wav(seconds=0.5), "audio_too_short", 422),
        (_wav(seconds=3.0), "audio_too_long", 422),
        (_wav(amplitude=0.0), "no_speech", 422),
        (b"x" * 200_001, "audio_too_large", 413),
    ],
)
def test_decode_refuses_unusable_audio(data, code, status):
    with pytest.raises(EvaluationError) as raised:
        decode_audio(data, Limits(max_duration_sec=2.5, max_upload_bytes=200_000))

    assert (raised.value.code, raised.value.status_code) == (code, status)


def test_reference_coverage_is_the_in_order_share_of_reference_words():
    assert reference_coverage(["a", "b", "c", "d"], ["a", "x", "c", "d"]) == 0.75
    assert reference_coverage(["a", "b"], ["b", "a"]) == 0.5
    assert reference_coverage(["a", "b"], []) == 0.0
    assert reference_coverage([], ["a"]) == 0.0


def test_character_coverage_credits_near_misses_and_ignores_spaces():
    assert reference_character_coverage(["born", "likes"], "borne legs") == 7 / 9  # b-o-r-n-l-e-s
    assert reference_character_coverage(["ab", "cd"], "a b c d") == 1.0
    assert reference_character_coverage(["ab"], "") == 0.0


def test_aligned_words_pair_by_position_and_mark_unknown_words():
    alignment = Alignment(
        words=[_span(0.0, 0.5, "we"), _span(0.5, 1.0, "<unk>")],
        phones=[_span(0.0, 0.2, "W"), _span(0.2, 0.5, "IY1"), _span(0.5, 1.0, "spn")],
    )

    words = aligned_words(alignment, ["we", "zorblax"])

    assert [word.text for word in words] == ["we", "zorblax"]
    assert [phone.text for phone in words[0].phones] == ["W", "IY1"]
    assert [word.out_of_vocabulary for word in words] == [False, True]
    assert aligned_words(alignment, ["we"]) is None
    assert aligned_words(alignment, ["me", "zorblax"]) is None


# --- layered degradation ----------------------------------------------------------------


def test_a_clean_recording_gets_every_level(make_pipeline, bundle_dir):
    result = make_pipeline().evaluate(_wav(seconds=2.0), "We call it, bear!")
    thresholds = load_bundle(bundle_dir).prediction_thresholds

    assert result.bundle_id == "speech-evaluator-v0.1.0"
    assert result.reference_text == "we call it bear"
    assert result.reference_word_coverage == result.reference_character_coverage == 1.0
    assert result.reference_character_coverage_corrected == 1.0
    assert {level: evidence.status for level, evidence in result.evidence_status} == {
        "sentence": "available", "word": "available", "phoneme": "available",
    }
    assert [word.text for word in result.words] == ["we", "call", "it", "bear"]
    assert [len(word.phonemes) for word in result.words] == [2, 3, 2, 2]
    for score in result.sentence.model_dump().values():
        assert 0.0 <= score <= 10.0
    for word in result.words:
        assert word.status == "scored"
        assert 0.0 <= word.accuracy <= 10.0
        assert word.is_error == (word.accuracy / 10.0 < thresholds["word"])
        for phoneme in word.phonemes:
            assert 0.0 <= phoneme.accuracy <= 2.0
            assert phoneme.is_error == (phoneme.accuracy / 2.0 < thresholds["phone"])
    assert result.timing.total_ms >= result.timing.alignment_ms >= 0
    assert result.warnings == []


def test_withholding_words_never_changes_the_sentence_scores(make_pipeline):
    full = make_pipeline().evaluate(_wav(), "we call it bear")
    withheld = make_pipeline(encoder=FakeEncoder("um")).evaluate(_wav(), "we call it bear")

    assert withheld.evidence_status.word.reason == "reference_not_read"
    assert withheld.sentence == full.sentence


@pytest.mark.parametrize(
    ("aligner", "reason"),
    [
        (FakeAligner(error=AlignmentError("mfa failed")), "alignment_failed"),
        (FakeAligner(Alignment(words=WE_CALL_IT_BEAR.words[:3], phones=WE_CALL_IT_BEAR.phones)),
         "word_count_mismatch"),
    ],
)
def test_without_a_usable_alignment_only_degraded_sentence_scores_remain(
    make_pipeline, aligner, reason
):
    result = make_pipeline(aligner=aligner).evaluate(_wav(), "we call it bear")

    assert result.evidence_status.sentence.model_dump() == {"status": "degraded", "reason": reason}
    assert result.evidence_status.word.model_dump() == {"status": "unavailable", "reason": reason}
    assert result.evidence_status.phoneme.status == "unavailable"
    assert result.words == []


def test_a_wrong_passage_withholds_word_and_phoneme_evidence(make_pipeline):
    result = make_pipeline(encoder=FakeEncoder("oh no")).evaluate(_wav(), "we call it bear")

    assert result.reference_character_coverage == 0.0
    assert result.reference_character_coverage_corrected == 0.0
    assert result.evidence_status.word.reason == "reference_not_read"
    assert result.words == []


def test_a_badly_recognized_real_reading_keeps_its_words(make_pipeline):
    encoder = FakeEncoder("wee col et bare")
    result = make_pipeline(encoder=encoder).evaluate(_wav(), "we call it bear")

    assert result.reference_word_coverage == 0.0
    gate = Limits().min_reference_character_coverage_corrected
    assert result.reference_character_coverage_corrected > gate
    assert result.evidence_status.word.status == "available"
    assert len(result.words) == 4


def test_an_out_of_vocabulary_word_is_left_unscored(make_pipeline):
    alignment = Alignment(
        words=[*WE_CALL_IT_BEAR.words[:3], _span(1.1, 1.6, "<unk>")],
        phones=[*WE_CALL_IT_BEAR.phones[:7], _span(1.1, 1.6, "spn")],
    )
    result = make_pipeline(
        encoder=FakeEncoder("we call it zorblax"), aligner=FakeAligner(alignment)
    ).evaluate(_wav(), "we call it zorblax")

    assert result.evidence_status.word.model_dump() == {
        "status": "partial", "reason": "out_of_vocabulary",
    }
    last = result.words[-1]
    assert (last.text, last.status, last.accuracy, last.phonemes) == (
        "zorblax", "out_of_vocabulary", None, [],
    )
    assert all(word.status == "scored" for word in result.words[:3])


def test_no_recognized_speech_is_refused(make_pipeline):
    with pytest.raises(EvaluationError) as raised:
        make_pipeline(encoder=FakeEncoder("")).evaluate(_wav(), "we call it bear")

    assert raised.value.code == "no_speech"


def test_a_reference_without_words_is_refused(make_pipeline):
    with pytest.raises(EvaluationError) as raised:
        make_pipeline().evaluate(_wav(), " ... ")

    assert (raised.value.code, raised.value.status_code) == ("invalid_request", 400)


def test_a_recording_longer_than_training_audio_is_flagged(make_pipeline):
    result = make_pipeline().evaluate(_wav(seconds=13.0), "we call it bear")

    assert result.warnings == ["duration_outside_training_range"]


def test_the_aligner_gets_the_normalized_reference(make_pipeline):
    aligner = FakeAligner()
    make_pipeline(aligner=aligner).evaluate(_wav(), "We  CALL it -- bear.")

    assert aligner.texts == ["we call it bear"]


def test_an_encoder_with_other_layers_is_refused(make_pipeline):
    with pytest.raises(ValueError, match="layers"):
        make_pipeline(encoder=FakeEncoder(layers=(6, 12)))


def test_the_real_encoder_wrapper_rounds_layers_through_fp16(
    tmp_path, monkeypatch, tiny_wav2vec2_config, char_vocab
):
    import huggingface_hub
    from transformers import Wav2Vec2ForCTC

    from echolingo_speech.worker.pipeline import Wav2Vec2Encoder

    model_dir = tmp_path / "tiny"
    Wav2Vec2ForCTC(tiny_wav2vec2_config).save_pretrained(model_dir)
    (model_dir / "vocab.json").write_text(json.dumps(char_vocab.token_to_id))
    monkeypatch.setattr(
        huggingface_hub, "hf_hub_download", lambda *args, **kwargs: str(model_dir / "vocab.json")
    )

    encoder = Wav2Vec2Encoder(str(model_dir), "r" * 40, (1, 2))
    encoded = encoder.encode(torch.randn(1, 4000) * 0.1)

    assert encoded.hidden_states.shape[0] == 2
    assert encoded.hidden_states.dtype == torch.float32
    assert torch.equal(encoded.hidden_states, encoded.hidden_states.half().float())
    assert encoded.recognized_text == encoded.recognized_text.lower()


# --- HTTP service -------------------------------------------------------------------------


class SlowPipeline:
    """A real pipeline behind a `delay`-second sleep."""

    def __init__(self, pipeline, delay):
        self._pipeline = pipeline
        self.delay = delay
        self.bundle, self.encoder = pipeline.bundle, pipeline.encoder
        self.aligner, self.limits = pipeline.aligner, pipeline.limits

    def evaluate(self, audio, reference_text):
        time.sleep(self.delay)
        return self._pipeline.evaluate(audio, reference_text)


def _client(pipeline, **kwargs):
    from fastapi.testclient import TestClient

    from echolingo_speech.worker.app import create_app

    health = {"aligner_version": "0.0", "device": "cpu"}
    return TestClient(create_app(lambda: (pipeline, health), **kwargs))


def _post(client, audio=None, reference_text="we call it bear", **form):
    return client.post(
        "/v1/evaluate",
        files={"audio": ("answer.wav", audio if audio is not None else _wav(), "audio/wav")},
        data={"reference_text": reference_text, **form},
    )


def test_health_reports_the_loaded_bundle(make_pipeline):
    with _client(make_pipeline()) as client:
        body = client.get("/health").json()

    assert body["status"] == "ready"
    assert body["bundle_id"] == "speech-evaluator-v0.1.0"
    assert body["encoder_revision"] == ENCODER_REVISION
    assert body["aligner"] == "fake-aligner"
    assert body["limits"]["request_timeout_sec"] == 25.0


def test_evaluate_returns_the_result_contract(make_pipeline):
    with _client(make_pipeline()) as client:
        response = _post(client)

    assert response.status_code == 200
    body = response.json()
    assert body["evidence_status"]["word"]["status"] == "available"
    assert len(body["words"]) == 4


@pytest.mark.parametrize(
    ("kwargs", "status", "code"),
    [
        ({"audio": b"RIFF nonsense"}, 422, "invalid_audio"),
        ({"audio": _wav(amplitude=0.0)}, 422, "no_speech"),
        ({"reference_text": "?!"}, 400, "invalid_request"),
        ({"task_type": "repeat_sentence"}, 400, "invalid_request"),
    ],
)
def test_refusals_carry_an_error_code(make_pipeline, kwargs, status, code):
    with _client(make_pipeline()) as client:
        response = _post(client, **kwargs)

    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_an_unexpected_failure_is_an_internal_error(make_pipeline):
    aligner = FakeAligner(error=RuntimeError("boom"))
    with _client(make_pipeline(aligner=aligner)) as client:
        response = _post(client)

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "internal_error", "message": "the evaluation failed",
    }


def test_a_slow_evaluation_times_out_and_blocks_the_next_until_it_ends(make_pipeline):
    slow = SlowPipeline(make_pipeline(), delay=1.0)
    with _client(slow, request_timeout_sec=0.3) as client:
        first = _post(client)
        second = _post(client)
        time.sleep(1.0)
        slow.delay = 0.0
        third = _post(client)

    assert (first.status_code, first.json()["error"]["code"]) == (504, "timeout")
    assert (second.status_code, second.json()["error"]["code"]) == (503, "worker_busy")
    assert third.status_code == 200


def test_evaluations_never_overlap(make_pipeline):
    running, seen = [0], []
    pipeline = make_pipeline()
    original = pipeline.evaluate

    def guarded(audio, reference_text):
        running[0] += 1
        seen.append(running[0])
        time.sleep(0.05)
        try:
            return original(audio, reference_text)
        finally:
            running[0] -= 1

    pipeline.evaluate = guarded
    with _client(pipeline) as client:
        threads = [threading.Thread(target=_post, args=(client,)) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

    assert seen and max(seen) == 1


def test_startup_fails_when_the_pipeline_cannot_load():
    from fastapi.testclient import TestClient

    from echolingo_speech.worker.app import create_app

    def broken():
        raise RuntimeError("bundle refused")

    with pytest.raises(RuntimeError, match="bundle refused"):
        with TestClient(create_app(broken)):
            pass


def test_the_worker_needs_an_explicit_bundle_id(tmp_path):
    from echolingo_speech.worker.app import resolve_bundle_dir

    with pytest.raises(ValueError, match="no bundle configured"):
        resolve_bundle_dir(tmp_path, None)
    with pytest.raises(ValueError, match="not a bundle id"):
        resolve_bundle_dir(tmp_path, "latest")
    assert resolve_bundle_dir(tmp_path, "speech-evaluator-v0.1.0") == (
        tmp_path / "bundles" / "speech-evaluator-v0.1.0"
    )


# --- align_one wrapper ----------------------------------------------------------------------

_FAKE_MFA = """#!{python}
import sys
from pathlib import Path
args = sys.argv[1:]
if args[0] == "version":
    print("9.9.9")
    sys.exit(0)
if "{mode}" == "fail":
    sys.stderr.write("dictionary missing")
    sys.exit(3)
if "{mode}" == "hang":
    import time
    time.sleep(5)
temporary = Path(args[args.index("--temporary_directory") + 1])
(temporary / "extracted_models").mkdir(parents=True, exist_ok=True)
Path({record!r}).write_text(str(Path(args[-5]).parent))
Path(args[-1]).write_text({textgrid!r})
"""


def _textgrid(words, phones):
    def tier(name, spans):
        intervals = "".join(
            f"        intervals [{i}]:\n            xmin = {start}\n            xmax = {end}\n"
            f'            text = "{text}"\n'
            for i, (start, end, text) in enumerate(spans, start=1)
        )
        return (f'        class = "IntervalTier"\n        name = "{name}"\n'
                f"        xmin = 0\n        xmax = 1.0\n"
                f"        intervals: size = {len(spans)}\n{intervals}")

    return ('File type = "ooTextFile"\nObject class = "TextGrid"\n\nxmin = 0\nxmax = 1.0\n'
            "tiers? <exists>\nsize = 2\nitem []:\n    item [1]:\n" + tier("words", words)
            + "    item [2]:\n" + tier("phones", phones))


def _fake_mfa(tmp_path, monkeypatch, mode="ok"):
    binary = tmp_path / mode / "mfa"
    binary.parent.mkdir()
    record = tmp_path / "work-dir.txt"
    textgrid = _textgrid(
        [(0, 0.2, "<eps>"), (0.2, 0.8, "hello"), (0.8, 1.0, "<eps>")],
        [(0, 0.2, "sil"), (0.2, 0.5, "HH"), (0.5, 0.8, "OW1"), (0.8, 1.0, "sil")],
    )
    binary.write_text(_FAKE_MFA.format(python=sys.executable, mode=mode, record=str(record),
                                       textgrid=textgrid))
    binary.chmod(0o755)
    monkeypatch.setenv(MFA_BIN_ENV_VAR, str(binary))
    return record


def test_align_one_drops_blanks_and_always_removes_its_files(tmp_path, monkeypatch):
    record = _fake_mfa(tmp_path, monkeypatch)
    aligner = MfaAligner(tmp_path / "mfa-cache")

    alignment = aligner.align(np.zeros(16000, dtype=np.float32), 16000, "hello")

    assert aligner.version() == "9.9.9"
    assert [(span.text, span.start, span.end) for span in alignment.words] == [
        ("hello", 0.2, 0.8)
    ]
    assert [span.text for span in alignment.phones] == ["HH", "OW1"]
    assert not Path(record.read_text()).exists()
    assert [path.name for path in (tmp_path / "mfa-cache").iterdir()] == ["extracted_models"]


def test_align_one_failure_and_timeout_raise_alignment_errors(tmp_path, monkeypatch):
    _fake_mfa(tmp_path, monkeypatch, mode="fail")
    with pytest.raises(AlignmentError, match="dictionary missing"):
        MfaAligner(tmp_path / "cache").align(np.zeros(16000, dtype=np.float32), 16000, "hi")

    _fake_mfa(tmp_path, monkeypatch, mode="hang")
    with pytest.raises(AlignmentError, match="exceeded"):
        MfaAligner(tmp_path / "cache", timeout_sec=0.5).align(
            np.zeros(16000, dtype=np.float32), 16000, "hi"
        )


@pytest.mark.mfa
def test_real_mfa_aligns_one_recording(tmp_path, monkeypatch):
    from echolingo_speech.alignment.mfa import CONDA_ENV, _resolve_mfa_invocation

    binary, _ = _resolve_mfa_invocation(CONDA_ENV)
    if binary[0] == "conda":
        pytest.skip("no MFA `aligner` env on this machine")
    t = np.arange(32000) / 16000
    tone = (0.1 * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32)

    alignment = MfaAligner(tmp_path / "cache").align(tone, 16000, "hello")

    assert [span.text for span in alignment.words] == ["hello"]
    assert alignment.phones
    assert all(span.text not in ("sil", "<eps>") for span in alignment.phones)


def test_a_passage_sharing_only_chance_letters_is_not_read(make_pipeline):
    # Raw letter coverage of an unrelated sentence is high; above chance it is not.
    encoder = FakeEncoder("a bee will tell her dad")
    result = make_pipeline(encoder=encoder).evaluate(_wav(), "we call it bear")

    assert result.reference_character_coverage >= 0.4
    assert result.reference_character_coverage_corrected < 0.10
    assert result.evidence_status.word.reason == "reference_not_read"


# --- multi-sentence passages ----------------------------------------------------------


def test_reference_sentences_follow_the_normalized_words():
    text = "We call it bear. Born likes green! Is it? The lake is very deep."

    assert reference_sentences(text) == [4, 3 + 2, 5]  # "is it" joins the one before
    assert reference_sentences("We call it bear") == [4]
    assert reference_sentences("Hi. We call it bear.") == [5]


def test_sentence_cuts_keep_padding_but_stop_at_the_gap_midpoint():
    words = aligned_words(WE_CALL_IT_BEAR, ["we", "call", "it", "bear"])

    assert sentence_segments(words, [2, 2], 2.0) == [
        (0, 2, 0.0, 0.9), (2, 4, 0.9, 2.0),
    ]
    spaced = Alignment(
        words=[_span(0.8, 1.0, "we"), _span(1.0, 1.4, "call"), _span(3.0, 3.2, "it"),
               _span(3.2, 3.6, "bear")],
        phones=WE_CALL_IT_BEAR.phones,
    )
    bounds = sentence_segments(aligned_words(spaced, ["we", "call", "it", "bear"]), [2, 2], 5.0)
    assert [(round(a, 2), round(b, 2)) for _, _, a, b in bounds] == [(0.3, 1.9), (2.5, 4.1)]


class CountingEncoder(FakeEncoder):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lengths = []

    def encode(self, waveform):
        self.lengths.append(waveform.shape[-1])
        return super().encode(waveform)


def test_each_reference_sentence_is_scored_from_its_own_cut(make_pipeline):
    encoder = CountingEncoder("we call it bear")
    result = make_pipeline(encoder=encoder).evaluate(_wav(seconds=2.0), "We call. It bear.")

    # "we call" and "it bear" are two words each, below MIN_SENTENCE_WORDS:
    # one segment, one pass over the whole recording.
    assert result.segment_count == 1
    assert len(encoder.lengths) == 1


def test_a_two_sentence_passage_is_scored_per_sentence(make_pipeline):
    alignment = Alignment(
        words=[_span(0.2, 0.4, "we"), _span(0.4, 0.6, "call"), _span(0.6, 0.8, "it"),
               _span(1.2, 1.4, "we"), _span(1.4, 1.6, "call"), _span(1.6, 1.8, "it")],
        phones=[_span(0.2, 0.3, "W"), _span(0.3, 0.4, "IY1"), _span(0.4, 0.5, "K"),
                _span(0.5, 0.6, "AO1"), _span(0.6, 0.7, "IH1"), _span(0.7, 0.8, "T"),
                _span(1.2, 1.3, "W"), _span(1.3, 1.4, "IY1"), _span(1.4, 1.5, "K"),
                _span(1.5, 1.6, "AO1"), _span(1.6, 1.7, "IH1"), _span(1.7, 1.8, "T")],
    )
    encoder = CountingEncoder("we call it we call it")
    result = make_pipeline(encoder=encoder, aligner=FakeAligner(alignment)).evaluate(
        _wav(seconds=2.0), "We call it. We call it."
    )

    assert result.segment_count == 2
    # The whole recording for the ASR, then one cut per sentence.
    assert encoder.lengths[0] == 32000 and sum(encoder.lengths[1:]) == 32000
    assert [word.index for word in result.words] == [0, 1, 2, 3, 4, 5]
    assert result.words[3].start_sec == pytest.approx(1.2)
    assert result.words[3].phonemes[0].start_sec == pytest.approx(1.2)
    for score in result.sentence.model_dump().values():
        assert 0.0 <= score <= 10.0


def test_the_duration_warning_follows_the_sentence_cuts(make_pipeline):
    # 14 s is longer than the fixture's 12 s training maximum; each 7 s
    # sentence is not.
    def sentence(start):
        words = [_span(start + 1.0 + i, start + 1.8 + i, w)
                 for i, w in enumerate(["we", "call", "it"])]
        phones = [_span(s.start, s.end, "IH1") for s in words]
        return words, phones

    first_words, first_phones = sentence(0.0)
    second_words, second_phones = sentence(7.0)
    alignment = Alignment(words=first_words + second_words, phones=first_phones + second_phones)
    pipeline = make_pipeline(
        encoder=FakeEncoder("we call it we call it"), aligner=FakeAligner(alignment),
        limits=Limits(max_duration_sec=60.0),
    )

    passage = pipeline.evaluate(_wav(seconds=14.0), "We call it. We call it.")
    whole = pipeline.evaluate(_wav(seconds=14.0), "We call it we call it")

    assert (passage.segment_count, passage.warnings) == (2, [])
    assert (whole.segment_count, whole.warnings) == (1, ["duration_outside_training_range"])
