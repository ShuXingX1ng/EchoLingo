# EchoLingo

EchoLingo is a PTE Academic practice platform. Learners practice individual task types or take full mock exams, receive AI-generated feedback, and track progress by task-type weakness.

## Language

### Exam structure

**PTE Academic**:
The target exam. Has three sections: Speaking & Writing, Reading, and Listening. EchoLingo covers a subset of task types from each section.
_Avoid_: PTE, Pearson test

**Task Type**:
A named exercise format within PTE Academic (e.g. Read Aloud, Write Essay, Write from Dictation). Each Task Type has fixed input stimulus, response format, and feedback dimensions.
_Avoid_: question type, exercise type, mode

**Section**:
One of the three top-level PTE Academic divisions: Speaking & Writing, Reading, Listening.
_Avoid_: part (reserved for IELTS, which this app no longer covers)

### Practice

**Practice Task**:
A single completed attempt at a Task Type. The core domain object. Contains the stimulus presented, the learner's response, and the Feedback produced.
_Avoid_: session (legacy IELTS term), exercise, attempt

**Stimulus**:
The content presented to the learner before they respond. For text Task Types (Read Aloud, Summarize Written Text, Write Essay) the Stimulus is AI-generated. For audio Task Types (Repeat Sentence, Write from Dictation) the Stimulus is Azure TTS audio generated and cached ahead of time.
_Avoid_: prompt, question, content

**Response**:
What the learner submits for a Practice Task. May be spoken audio, typed text, or a selection, depending on Task Type.
_Avoid_: answer, submission, input

**Task Bank**:
The pool of Stimuli available for a given Task Type. Text Task Types draw from AI-generated Stimuli (for the corpus-grounded path, generation is seeded by retrieved **Stimulus Exemplars**); audio Task Types draw from pre-cached Azure TTS recordings. Note: `src/lib/task-bank.ts` is only a client-side localStorage *cache* of already-served Stimuli — it is not the authoritative pool.
_Avoid_: question bank, content library

**Stimulus Exemplar**:
A piece of real or open-source PTE-style source text (a "机经" recall item or an open-corpus passage) ingested into Supabase to seed Stimulus generation. It is **retrieval-only**: the corpus-grounded generation path retrieves the most similar Exemplars for a Task Type and uses them as few-shot anchors so the LLM produces an original Stimulus in matching style, difficulty, and topic — the Exemplar text itself is never served verbatim to a learner on the default path. Distinct from **Stimulus** (what the learner actually receives). Stored gitignored / out of the public repo when sourced from copyrighted recall material.
_Avoid_: scraped question, 机经 (use in prose only), seed (overloaded), sample

### Modes

**Task Practice**:
A learner-directed session where the learner picks a Task Type and completes one or more Practice Tasks of that type. Timing is enforced but at practice pace.
_Avoid_: free practice, drill mode

**Mock Exam**:
A full simulated PTE Academic exam following the official task sequence and strict timing. Covers all supported Task Types in order. The learner cannot choose a topic; Stimuli are selected randomly (Exemplar-grounded generation with topic conditioning off) to preserve authenticity.
_Avoid_: full test, simulation mode

**Theme Practice**:
A Task Practice variant where the learner types a theme (e.g. "environment", "technology") and the system generates Stimuli on that theme. Backed by hybrid retrieval over **Stimulus Exemplars** — dense (pgvector) + sparse (Postgres `tsvector`) fused with RRF — so the theme keyword drives few-shot selection for topic-controllable generation. The only mode where topic conditioning (and therefore hybrid retrieval) is active.
_Avoid_: topic mode, custom practice, keyword practice

### Feedback

**Feedback**:
The AI-generated evaluation produced after a Practice Task is submitted. Has a fixed generic envelope (summary, strengths, weaknesses, suggestions) and a task-specific `details` object.
_Avoid_: score, result, assessment (overloaded with Azure pronunciation)

**Speech Evaluator**:
EchoLingo's planned dedicated model for assessing spoken Responses against current public PTE Academic criteria using raw audio, task context, reference content when applicable, and calibrated human-labelled evidence.
_Avoid_: Native Speech Model, Pronunciation Assessment, Scoring Agent, Azure score

**Speech Evidence**:
The non-scoring representation of a spoken Response supplied to the **Speech Evaluator**, including acoustic features plus task-aligned transcript, timing, and pronunciation alignment where available.
_Avoid_: sound vector, score, Speech Evaluation Label, Pronunciation Assessment

**Spoken Task Score Estimate**:
A non-official 10–90 prediction from the **Speech Evaluator** for one completed spoken **Practice Task**, always presented with reference-only labelling and supporting evidence rather than as an overall PTE Academic Speaking score.
_Avoid_: PTE score, Speaking score, official score, guaranteed score, Azure score

**Speaking Dimension Estimate**:
A user-facing 10–90 estimate for one speaking trait such as Pronunciation, Oral Fluency, or Content, normalized from task-specific evidence so every displayed speaking dimension uses one scale.
_Avoid_: rubric level, 0–5 score, percentage, official subscore

**Provisional Score Normalization**:
The monotonic learning-phase mapping from foundational evaluator outputs to EchoLingo's 10–90 display scale before PTE-specific calibration evidence exists.
_Avoid_: PTE calibration, official conversion, predicted PTE score

**PTE Task Calibrator**:
The future task-specific model that maps raw **Speech Evaluator** outputs and task evidence to 10–90 estimates using PTE-relevant task-level labels.
_Avoid_: Speech Evaluator, provisional normalization, overall Speaking score

**Foundational Speech Label**:
A licensed corpus annotation for pronunciation, fluency, prosody, completeness, word, or phoneme quality that supervises the foundational **Speech Evaluator** without claiming PTE correspondence.
_Avoid_: PTE label, Azure score, pseudo-label

**PTE Task Label**:
A task-level Read Aloud judgement produced under a PTE-relevant rating protocol for training or testing a **PTE Task Calibrator**.
_Avoid_: Foundational Speech Label, Azure score, competitor score, aggregate official result

**Speech Evaluation Benchmark**:
The fixed, speaker-independent collection and acceptance measures used to compare **Speech Evaluator** candidates without contributing training supervision.
_Avoid_: training set, validation set, live user data, Azure baseline

**Speech Evaluation Mode**:
The Read Aloud learning-phase selection of EchoLingo-only evaluation or an explicit EchoLingo-versus-Azure comparison.
_Avoid_: model version, scoring standard, deployment environment

**Speech Evaluation Worker**:
The private model runtime that loads one accepted **Speech Evaluator** checkpoint and returns evaluation evidence to the authoritative FastAPI backend.
_Avoid_: public API, training process, Azure provider, Speech Evaluator

**Speech Evaluation Result**:
The provider-neutral task result containing one **Spoken Task Score Estimate**, dimension estimates, recognized content, available word or phoneme evidence, and explicit evidence availability.
_Avoid_: Azure response, Pronunciation Assessment, raw model output

**Speech Evaluation Comparison**:
The retained structured difference between EchoLingo and Azure results for one recording identity, excluding raw audio and reusable voice representations by default.
_Avoid_: training example, recording archive, Speech Evaluation Benchmark

**Evaluator Checkpoint Bundle**:
An immutable, identified package of accepted evaluator weights, schemas, normalization, provenance, licences, and benchmark results loadable by the **Speech Evaluation Worker**.
_Avoid_: latest model, model file, training run, deployment

**Evaluator Training Run**:
A reproducible tracked execution of one evaluator configuration against fixed dataset manifests, producing metrics and candidate artifacts but not an accepted model by default.
_Avoid_: Evaluator Checkpoint Bundle, model version, experiment note

**Speech Dataset Manifest**:
The immutable inventory of sample identity, speaker partition, source version, licence, consent class, and integrity hashes used to reproduce or audit evaluator data.
_Avoid_: dataset folder, split script, training log

**Speech Evaluator Acceptance**:
The minimum reproducibility, benchmark, failure-safety, and fallback gate a candidate must pass before becoming the learning-phase default **Speech Evaluator**.
_Avoid_: PTE calibration, public-release approval, model completion

**Feedback Envelope**:
The generic, task-agnostic fields present in every Feedback: `summary`, `strengths`, `weaknesses`, `suggestions`. Drives shared UI (history list, stats, daily plan).
_Avoid_: base feedback, common feedback

**Feedback Details**:
The task-specific section of a Feedback object. Shape varies by Task Type (e.g. Write Essay has per-dimension scores; Write from Dictation has word-level accuracy).
_Avoid_: extended feedback, metadata

**Pronunciation Assessment**:
The external Azure word-level and phoneme-level assessment available for spoken Responses as a switchable baseline and fallback, distinct from the **Speech Evaluator** and never a primary training label.
_Avoid_: pronunciation score, Azure score

### Study Aids

**Native Speech Model**:
EchoLingo's planned English-first, PTE-focused model that accepts learner speech directly and produces intelligible spoken tutoring responses in one consistent, neutral international-English tutor voice without requiring a text transcript as its primary interface.
_Avoid_: voice assistant, ASR-TTS pipeline, GPT replacement, speech feature

**Tutor Conversation**:
A short, goal-directed, PTE-focused spoken dialogue in which the **Native Speech Model** acts as a tutor, may use the learner's recent **Practice Task**, **Feedback**, and **Pronunciation Assessment** as teaching context, and gently redirects unrelated conversation toward the learner's current goal.
_Avoid_: speaking task, voice feedback, oral explanation, Study Assistant

**Tutor Goal**:
The single learner-confirmed improvement outcome that focuses one **Tutor Conversation** and determines whether it can be concluded successfully.
_Avoid_: topic, prompt, session objective, Daily Plan

**Tutor Check**:
A brief before-and-after comparison within one **Tutor Conversation** that uses similar but non-identical material and observable evidence to classify progress toward the **Tutor Goal** without claiming an official PTE score.
_Avoid_: test, exam, score, Pronunciation Assessment

**Recovery Segment**:
The single brief extension allowed after a closing **Tutor Check** shows no improvement, using a different explanation and easier retry before the conversation concludes.
_Avoid_: extra session, remedial course, unlimited retry, failure

**Tutor Voice**:
The single neutral international-English voice produced by the **Native Speech Model** during a **Tutor Conversation**, evaluated separately for intelligibility, pronunciation, prosody, naturalness, and identity consistency.
_Avoid_: learner voice, Pronunciation Assessment, TTS voice, cloned voice

**Tutor Context**:
The learner-authorized context for a **Tutor Conversation**, consisting of one selected **Practice Task** with its **Feedback** and primary **Speech Evaluation Result** where applicable, plus a summary of longer-term **Task-Type Weaknesses**.
_Avoid_: full history, learner memory, conversation history, user profile

**Tutor Summary**:
The default persisted outcome of a **Tutor Conversation**, containing identified learning issues, agreed next actions, and useful progress signals without retaining the raw conversation audio.
_Avoid_: transcript, recording, chat history, Tutor Context

**Training Consent**:
The learner's separate, explicit permission for eligible conversation audio or transcripts to be processed as **Native Speech Model** training data, independent of saving a **Tutor Summary** or optional transcript.
_Avoid_: account consent, privacy consent, conversation save

**Tutor Intervention**:
An immediate interruption during a **Tutor Conversation**, reserved for meaning-blocking errors, the active training target, or a complete learner turn confidently identified as non-English; other errors are deferred and prioritized after the learner finishes speaking.
_Avoid_: correction, Feedback, interruption, error list

**Word Lookup**:
A helper available on Task Practice pages (never in a Mock Exam) that translates a word or short phrase the learner selects from any on-page text. The learner selects text and taps the "译" pill that appears beside the selection (all platforms); the result card opens with the translation. (Earlier versions also offered a persistent floating button with a desktop drag-and-drop route — both were removed because the selection pill alone is sufficient.) Single English words resolve against the ECDICT dictionary database (instant, offline); phrases — and dictionary misses — fall through to the DeepSeek LLM. It is a learning aid only and does not produce Feedback.
_Avoid_: translator, dictionary, assistant, chat helper, glossary (reserved for CONTEXT.md term list)

**Vocabulary List**:
The learner's saved collection of looked-up words. A word enters the Vocabulary List only by explicit action (a save/star control on the Word Lookup card) — looking a word up does not add it. Stored per learner in Supabase when logged in, with localStorage fallback when not. Viewed on the `/vocabulary` page (view and delete only; no spaced-repetition review in v1).
_Avoid_: word book, saved words, flashcards, SRS deck

**Study Assistant**:
The learner-facing, tool-using conversational agent. It holds a multi-turn conversation (single session, not persisted) and decides which of its tools to call to help the learner. Reachable from a global floating entry point on every page **except during an in-progress Mock Exam** (same exclusion rule as **Word Lookup**). Answers follow the current UI language; preset "common question" buttons lower the barrier to entry. It is a tool-using agent in the technical sense, but it is **not** an **Agent** in this project's vocabulary — that term is reserved for the internal feedback/scoring pipeline stages (see `docs/agent-architecture.md`, ADR-0004), which the Study Assistant never invokes.

Its MVP tools are:
1. **Navigation / app help** — answers "how / where / what is" questions and returns clickable jump links drawn from a fixed route allow-list, grounded by a hand-authored knowledge file (app feature map + PTE FAQ), not RAG over dev docs.
2. **Generate practice on a topic** — produces an original **Stimulus** (text Task Types only at MVP) for a learner-named topic. Grounding defaults to the **Stimulus Exemplar** corpus (the existing **Theme Practice** path); it switches to live-news grounding only on explicit learner recency intent. Either way the source text is never served verbatim — the **originality guard** applies — so it stays consistent with ADR-0008.
3. **PTE knowledge Q&A** — answers exam-format, scoring-dimension, and study-tip questions.

**Action boundary**: the Study Assistant may generate practice content and navigate the learner into a **Practice Task**, but it never submits a **Response**, never scores, and never alters saved learner data on the learner's behalf. It produces no **Feedback** of its own.
_Avoid_: Agent (reserved for the feedback/scoring pipeline), assistant (bare — reserved by Word Lookup's avoid-list), chatbot, support bot, tutor, Coach (reserved for the Coach Agent)

### Progress

**Task-Type Weakness**:
A signal derived from a learner's Feedback history for a given Task Type, indicating below-average performance. Drives the Daily Plan.
_Avoid_: weak area, error pattern (legacy IELTS term), skill gap

**Daily Plan**:
The home-page set of recommended Practice Tasks, generated from Task-Type Weaknesses for logged-in learners. When surfaced as a dedicated practice entry point it is called **Targeted Practice** — the same weakness-driven engine, not a new concept; Stimulus selection there filters Exemplars by Task Type plus difficulty/feature metadata (no topic, no hybrid retrieval).
_Avoid_: learning plan, daily tasks, targeted practice (use only as the UI label for the Daily Plan engine)

## Relationships

- A **Practice Task** belongs to exactly one **Task Type**
- A **Practice Task** has one **Stimulus** and one **Response**
- A **Practice Task** produces one **Feedback**
- A **Feedback** has one **Feedback Envelope** and one **Feedback Details**
- A **Pronunciation Assessment** may be attached to the **Feedback Details** when the task retains its Azure flow or Read Aloud explicitly runs comparison
- A **Speech Evaluator** consumes **Speech Evidence** but remains distinct from the speech encoder and recognition/alignment capabilities that produce that evidence
- Read Aloud **Speech Evidence** combines free transcription, reference-conditioned word and phoneme alignment, and acoustic representations; no single evidence path independently determines its evaluation
- The **Speech Evaluator** may use a **Pronunciation Assessment** as a baseline feature but remains responsible for its own calibrated judgment
- The first validated **Speech Evaluator** scope is Read Aloud only; additional spoken Task Types require their own task-specific labels and calibration
- The first Read Aloud **Speech Evaluator** shares one learned representation across separate pronunciation, fluency, word, phoneme, prosody, and completeness judgements rather than predicting one opaque total
- Phoneme-level **Speech Evidence** is eligible for training only when its reference-conditioned alignment passes quality controls; an alignment is evidence location rather than a pronunciation label
- A runtime phoneme-alignment failure removes phoneme detail without inventing evidence, while failure of the minimum sentence and word evidence rejects evaluation rather than returning a plausible score
- Read Aloud Content is primarily derived from reference-conditioned lexical evidence, while its **Spoken Task Score Estimate** is produced by a separate task-specific calibration policy
- The **Speech Evaluator** produces evidence-backed trait results and one **Spoken Task Score Estimate** for each eligible spoken Practice Task, never an official or overall PTE Academic Speaking score from a single task
- Every user-facing speaking trait is a **Speaking Dimension Estimate** on the 10–90 scale, while raw rubric levels, calibration provenance, and uncertainty remain internal evaluation data
- **Provisional Score Normalization** may produce learning-phase **Speaking Dimension Estimates**, but it does not establish correspondence with PTE Academic scores
- The provisional Read Aloud **Spoken Task Score Estimate** weights Pronunciation and Oral Fluency at 40% each and Content at 20%, with severe content failure constraining or nullifying the result
- A validated Read Aloud **PTE Task Calibrator** eventually replaces provisional weighting without replacing or hiding the foundational evaluator's raw evidence
- The first **PTE Task Calibrator** is trained and validated independently against a frozen **Speech Evaluator**; joint training requires substantially broader task-level labels
- Foundational **Speech Evaluator** training proceeds with licensed broad speech and SpeechOcean supervision before PTE-specific task labels exist; absence of those labels delays the **PTE Task Calibrator**, not the foundational evaluator
- A **Spoken Task Score Estimate** is a task-specific calibrated result rather than a simple average of dimension estimates, and severe content failure or a non-response constrains the maximum result
- **Foundational Speech Labels** supervise the foundational **Speech Evaluator**, while **PTE Task Labels** supervise or test a **PTE Task Calibrator**
- Learner-authorized official PTE results are weak aggregate calibration evidence, while Azure and competitor outputs are comparison baselines only
- Aggregated SpeechOcean labels establish the first foundational baseline; individual-rater labels may later model disagreement internally without exposing confidence metadata to learners
- Every promoted **Speech Evaluator** must outperform or justify its trade-offs against the previous candidate on the same **Speech Evaluation Benchmark**
- A **Speech Evaluation Benchmark** is isolated by speaker from all training and validation material, and a future PTE-specific benchmark remains distinct from the foundational SpeechOcean benchmark
- A **Speech Evaluation Benchmark** combines rank and absolute score agreement, word and phoneme error detection, alignment coverage, acoustic robustness, and relevant speaker-subgroup results rather than selecting on one aggregate metric
- Foundational training may use adult and child SpeechOcean labels, but adult results govern target-domain promotion and age is never a learner scoring input
- Broad accent corpora may improve **Speech Evidence**, but only labelled accent-specific benchmarks can establish that a **Speech Evaluator** judges those speaker groups validly
- The first Read Aloud **Speech Evaluation Mode** is EchoLingo-only by default after acceptance, while comparison explicitly runs both providers and keeps Azure output as baseline evidence only
- **Speech Evaluator Acceptance** permits a personal-development default only and never implies PTE equivalence or readiness for real learners
- A **Speech Evaluation Worker** is called only by the authoritative FastAPI backend and remains separate from the process that trains and saves evaluator checkpoints
- A **Speech Evaluation Worker** loads exactly one explicitly selected **Evaluator Checkpoint Bundle**, never an implicitly newest training artifact
- Every **Evaluator Checkpoint Bundle** references the **Speech Dataset Manifests** that supplied its training, validation, and benchmark material
- An **Evaluator Training Run** is tracked locally with configuration, provenance, code identity, resource use, and multi-metric results; only an accepted run may export an **Evaluator Checkpoint Bundle**
- EchoLingo and Azure provider outputs are adapted by FastAPI into one **Speech Evaluation Result** rather than exposing provider-specific score fields to the learner UI
- A **Speech Evaluation Comparison** may retain provider results, differences, checkpoint identity, and an irreversible recording hash, but never implies raw-audio retention or **Training Consent**
- A **Speech Evaluation Comparison** is visible through a developer diagnostic surface, while the ordinary Read Aloud feedback surface presents exactly one primary **Speech Evaluation Result**
- A first-generation Read Aloud EchoLingo failure is explicit and never silently replaced by Azure; Repeat Sentence retains its existing Azure assessment until it receives a task-specific evaluator
- **Speech Evaluation Result** scores and factual findings are fixed before **Feedback** generation; an LLM may explain supplied evidence but cannot revise scores or invent unsupported speech errors
- Learner-facing Read Aloud feedback marks every reliably weak word and significant aligned fluency event, while phoneme-level scores and boundaries remain internal evidence rather than a default phoneme inventory
- A **Mock Exam** is a sequence of **Practice Tasks** covering all supported **Task Types** in order
- A **Daily Plan** is derived from **Task-Type Weaknesses** across recent **Practice Tasks**
- The **Native Speech Model** may use the **Study Assistant**'s tools and knowledge while remaining distinct from the existing ASR-to-text and text-to-speech pipeline
- The **Native Speech Model** consumes accepted **Speech Evaluation Results** for tutoring context and does not independently rescore the learner's completed Read Aloud response
- A spoken **Practice Task** keeps text-first **Feedback**, while an optional **Tutor Conversation** provides natural spoken follow-up
- A **Tutor Conversation** treats the primary **Speech Evaluation Result** as scoring evidence and may see Azure only through an available comparison baseline
- The **Tutor Voice** expresses the **Native Speech Model**'s spoken responses and is not evidence about the learner's pronunciation
- A **Tutor Conversation** receives one **Tutor Context** and does not automatically receive unselected raw history or recordings
- A **Tutor Conversation** pursues exactly one **Tutor Goal** before it concludes or offers another conversation
- The tutor recommends a **Tutor Goal** from the **Tutor Context** and explains why, but the learner must confirm or replace it before coaching begins
- A **Tutor Conversation** contains one baseline and one closing **Tutor Check**, whose evidence is captured in the **Tutor Summary**
- A **Tutor Conversation** may add at most one **Recovery Segment** when its closing Tutor Check shows no improvement
- A **Tutor Conversation** produces one **Tutor Summary** by default, while saving its complete transcript is optional and its raw audio is not retained by default
- A saved **Tutor Summary** or transcript never implies **Training Consent**
- A **Tutor Conversation** may briefly acknowledge an unrelated topic but returns the dialogue to PTE learning or the active Practice Task
- A **Tutor Intervention** does not trigger for an accent, hesitation, proper name, borrowed word, or isolated code-switch
- A **Tutor Intervention** first uses simpler English, then an English example, and only after repeated failure uses one brief Chinese explanation before requiring an English retry

## Example dialogue

> **Dev:** "When the learner finishes a Repeat Sentence, do we run the Pronunciation Assessment before or after generating Feedback?"
> **Domain expert:** "In parallel — Pronunciation Assessment hits Azure directly from the audio Response; AI Feedback runs at the same time using the transcript. Both results are merged into Feedback Details before we save the Practice Task."

> **Dev:** "For the Daily Plan, do we look at all Practice Tasks or just recent ones?"
> **Domain expert:** "Recent ones — Task-Type Weakness is a rolling signal, not a lifetime average. Old Practice Tasks should decay in weight."

## Flagged ambiguities

- "session" previously meant an IELTS speaking dialogue. This app no longer has IELTS. The canonical term is now **Practice Task** for a single completed attempt.
- "score" is ambiguous between Pearson's official result, a **Pronunciation Assessment**, and EchoLingo's **Spoken Task Score Estimate**; use the full term and never present the estimate as official, guaranteed, or an overall Speaking score.
- "speech label" is ambiguous between a **Foundational Speech Label** and a **PTE Task Label**; the former cannot train PTE score correspondence.
- "supports multiple accents" may describe recognition robustness but must not imply cross-accent scoring validity without labelled subgroup evidence.
- "replace Azure" means changing the default **Speech Evaluation Mode**, not removing the Azure baseline or treating its output as supervision.
- "disable Azure" currently applies to Read Aloud standalone evaluation and fallback only, not Repeat Sentence or Azure TTS.
- "sound vector" is too narrow for the **Speech Evidence** used by the evaluator because transcript, timing, and alignment evidence may accompany acoustic representations.
- Public PTE rubric levels such as 0–5 may guide calibration but are not displayed to learners; all speaking dimensions use **Speaking Dimension Estimate** values from 10–90.
- "part" was used for IELTS Part 1/2/3. It is not used for PTE. Use **Task Type** and **Section** instead.
- "model" is ambiguous between a hosted LLM, an ASR/TTS pipeline, and EchoLingo's planned **Native Speech Model**; use the full term when discussing the trainable speech-to-speech research track.
- "voice feedback" is ambiguous between spoken delivery of **Feedback** and a **Tutor Conversation**; individual Practice Tasks remain text-first, and the latter is a separate spoken dialogue.
- "pronunciation" can refer to the learner measurement or the model's output quality; use **Pronunciation Assessment** for the learner and **Tutor Voice** quality for the model.
- "learning history" must not imply unrestricted model access; a **Tutor Context** contains one selected Practice Task and only a summary of longer-term Task-Type Weaknesses.
- "save this conversation" is ambiguous between a **Tutor Summary**, a complete transcript, raw audio, and training use; each has a distinct persistence or consent rule.
- "natural conversation" does not mean unrestricted general chat; a **Tutor Conversation** remains anchored to a PTE learning goal.
- "not English" means a complete meaningful learner turn confidently identified as another language, not an accent or an isolated non-English word.
