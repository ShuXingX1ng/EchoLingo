# Train the Speech Evaluator on a rented Linux GPU instance

## Context

ADR-0013 fixed the standard speech environment as an isolated WSL2 Ubuntu environment using a local RTX 4070, and M0–M2 were built and run there. That machine is no longer available. The SpeechOcean762 corpus, MFA alignments, the Wav2Vec2 feature cache, the MLflow runs, and both A0 checkpoints lived on it outside Git, as ADR-0013 intended, so none of them are currently accessible.

## Decision

Speech Evaluator training, preprocessing, and evaluation run on a rented Linux GPU instance (Ubuntu, a single 24 GB-class card), paid by usage. The `speech/` package, the pinned encoder revision, the dataset registration record, and the `uv.lock` dependency set are unchanged; only the machine changes. `data_root` and `artifact_root` point at the instance's persistent data disk.

Because an instance can be released at any time, the manifest, MLflow runs, checkpoints, and benchmark results are copied off the instance at the end of every stage. Raw audio, alignments, and feature caches are treated as rebuildable from the committed code and dataset record.

After any change of machine, the previous stage's baseline is reproduced before new experiments are compared against it.

This amends only the training-environment paragraph of ADR-0013. The private Speech Evaluation Worker, the FastAPI boundary, the Checkpoint Bundle contract, and the single shared `speech/` package from ADR-0013 remain in force. Where the worker runs is decided at M4.

## Consequences

- The WSL2-specific setup (DrvFs virtualenv workaround, Windows host driver) is no longer the documented path; it remains as a historical note in `speech/README.md`.
- 24 GB removes the 12 GB constraint that shaped the A1 adapter plan in ADR-0011, but the frozen-encoder-first order stays, since it is justified by label scarcity, not by memory.
- Training has a running cost and depends on network access to OpenSLR and the Hugging Face Hub from the instance.
- M2's reported numbers cannot be re-inspected until A0 is re-run; a reproduction within tolerance is the entry condition for M2.5 and M3.
- Off-instance backup becomes a required step, not an optional one.
