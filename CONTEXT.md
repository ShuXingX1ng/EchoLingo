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

**Feedback Envelope**:
The generic, task-agnostic fields present in every Feedback: `summary`, `strengths`, `weaknesses`, `suggestions`. Drives shared UI (history list, stats, daily plan).
_Avoid_: base feedback, common feedback

**Feedback Details**:
The task-specific section of a Feedback object. Shape varies by Task Type (e.g. Write Essay has per-dimension scores; Write from Dictation has word-level accuracy).
_Avoid_: extended feedback, metadata

**Pronunciation Assessment**:
The Azure-powered word-level and phoneme-level scoring applied to spoken Responses. Used in Read Aloud and Repeat Sentence. Distinct from AI Feedback — it runs in parallel and feeds into Feedback Details. Azure is the authoritative source for pronunciation data on these two task types; Whisper (speech-to-text transcription) is a separate tool used only where Azure Pronunciation Assessment does not apply (e.g. Describe Image, Answer Short Question) to produce a transcript for AI Feedback.
_Avoid_: pronunciation score, Azure score

### Study Aids

**Word Lookup**:
A helper available on Task Practice pages (never in a Mock Exam) that translates a word or short phrase the learner selects from any on-page text. The learner selects text and taps the "译" pill that appears beside the selection (all platforms); the result card opens with the translation. (Earlier versions also offered a persistent floating button with a desktop drag-and-drop route — both were removed because the selection pill alone is sufficient.) Single English words resolve against the ECDICT dictionary database (instant, offline); phrases — and dictionary misses — fall through to the DeepSeek LLM. It is a learning aid only and does not produce Feedback.
_Avoid_: translator, dictionary, assistant, chat helper, glossary (reserved for CONTEXT.md term list)

**Vocabulary List**:
The learner's saved collection of looked-up words. A word enters the Vocabulary List only by explicit action (a save/star control on the Word Lookup card) — looking a word up does not add it. Stored per learner in Supabase when logged in, with localStorage fallback when not. Viewed on the `/vocabulary` page (view and delete only; no spaced-repetition review in v1).
_Avoid_: word book, saved words, flashcards, SRS deck

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
- A **Pronunciation Assessment** is attached to the **Feedback Details** of spoken Task Types only
- A **Mock Exam** is a sequence of **Practice Tasks** covering all supported **Task Types** in order
- A **Daily Plan** is derived from **Task-Type Weaknesses** across recent **Practice Tasks**

## Example dialogue

> **Dev:** "When the learner finishes a Repeat Sentence, do we run the Pronunciation Assessment before or after generating Feedback?"
> **Domain expert:** "In parallel — Pronunciation Assessment hits Azure directly from the audio Response; AI Feedback runs at the same time using the transcript. Both results are merged into Feedback Details before we save the Practice Task."

> **Dev:** "For the Daily Plan, do we look at all Practice Tasks or just recent ones?"
> **Domain expert:** "Recent ones — Task-Type Weakness is a rolling signal, not a lifetime average. Old Practice Tasks should decay in weight."

## Flagged ambiguities

- "session" previously meant an IELTS speaking dialogue. This app no longer has IELTS. The canonical term is now **Practice Task** for a single completed attempt.
- "score" is avoided because EchoLingo does not simulate official PTE 10–90 scoring. Use **Feedback** or **Pronunciation Assessment** depending on context.
- "part" was used for IELTS Part 1/2/3. It is not used for PTE. Use **Task Type** and **Section** instead.
