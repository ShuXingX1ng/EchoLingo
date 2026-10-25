# Run the Speech Evaluation Worker on the development Mac

## Context

ADR-0013 placed the private Speech Evaluation Worker beside training on a local GPU, and ADR-0014 moved training to a rented Linux GPU instance and left the Worker's location to M4. A rented instance is paid by the hour and can be released at any time, so it cannot host a service that the local FastAPI backend calls during everyday development. The M3 evaluator (3.2c) keeps the encoder frozen: inference is one Wav2Vec2 Base forward pass, a small scoring head, and a Montreal Forced Aligner run per recording.

Measured on 2026-10-25 on the development Mac (Apple M4, 16 GB, CPU only), over the 260 SpeechOcean validation recordings: the encoder took a median of 75 ms per recording, `mfa align_one` about 2.9 s, and a whole evaluation a median of 3.0 s (p95 3.3 s, max 4.6 s). This is well within the 30-second synchronous budget of ADR-0012.

## Decision

During personal development the Speech Evaluation Worker runs on the development Mac, on CPU, from its own Python 3.11 environment outside the repository, with MFA in a separate `aligner` conda environment. It listens on localhost, and only the local FastAPI backend calls it. Training, preprocessing and evaluation stay on the rented Linux GPU (ADR-0014). The only artifact that crosses between the two machines is an exported Evaluator Checkpoint Bundle.

Both machines use the torch and torchaudio release the evaluator was trained with (2.5.1): CUDA wheels on Linux and PyPI wheels elsewhere, from one `uv.lock`. Before a bundle is served, the Worker's own decoding and encoder path must reproduce the bundle's recorded validation metrics when given training's alignments.

The Worker keeps ADR-0013's other rules. It loads one explicitly configured bundle (`worker_bundle_id`) and verifies it at startup, it is never exposed to the browser, and the public `backend/` gains no PyTorch, Transformers, MFA or MLflow dependency.

## Consequences

- Development needs no running GPU instance. The Mac holds the bundle (2 MB), the pinned encoder in a Hugging Face cache (360 MB), and MFA's pretrained and extracted models (about 200 MB), plus about 2.3 GB of Python and conda environments.
- On 2026-10-25, given training's TextGrids, the Worker path matched the recorded validation metrics of `speech-evaluator-v0.1.0` within 0.0001. The full request path costs about 0.03 word-error average precision and about 0.01 phoneme average precision, and leaves the sentence-level metrics unchanged. That cost comes from aligning each recording alone and from taking dictionary pronunciations as the canonical phones.
- Latency is dominated by MFA. If an M5 measurement shows the synchronous contract is too slow, the first step is to keep MFA resident or move the Worker to a GPU host. The bundle and the HTTP contract do not change.
- A future production Worker on another host is a new deployment decision. The bundle format, the Worker contract and the FastAPI boundary already allow it.
