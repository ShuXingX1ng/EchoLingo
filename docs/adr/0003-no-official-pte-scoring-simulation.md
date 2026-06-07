# Scoring strategy: objective dimensions use 10–90 scale; Speaking scores are labelled estimates

EchoLingo's Scoring Agent outputs scores on a 10–90 scale (matching PTE Academic's reporting range) but applies different confidence levels by section:

**Reading and Writing** — scoring dimensions are objectively measurable. Each score component has an explicit calculation basis:
- Writing: Content (keyword coverage rate via RAG), Form (word count within target range), Grammar (error count by type), Vocabulary (diversity index, academic word ratio)
- Reading: Fill in the Blanks and Re-order Paragraphs are right/wrong; Multiple Choice is partial credit

These scores are defensible in an interview because the calculation method can be explained precisely.

**Speaking** — Pearson's fluency, pronunciation, and content weights are unpublished. Azure Pronunciation Assessment provides objective word/phoneme accuracy data, but the aggregation into a 10–90 band uses estimated weights. Speaking scores are displayed with a "For reference only — not an official PTE score" label. This distinction is proactively communicated to learners.

## Why 10–90 and not an internal scale

Learners are preparing for PTE Academic and are already calibrated to the 10–90 range. Using an unfamiliar internal scale adds cognitive overhead without improving accuracy. The trade-off is accepted: use the familiar range, be explicit about confidence level per section.

## Considered Options

- **Qualitative only (original decision)** — rejected for the portfolio design because learners need quantifiable progress signals and the 10–90 range is familiar. Retained for the Speaking section where estimation risk is highest.
- **Internal 0–100% scale** — rejected because learners must translate to PTE bands anyway; adds friction.
- **Simulate 10–90 for all sections without disclaimer** — rejected; indefensible when asked how Speaking weights were derived.
