# PRD: PTE Academic Pivot

## Problem Statement

EchoLingo was built for IELTS Speaking practice — a single-skill, dialogue-driven exam format. Learners preparing for PTE Academic have no suitable AI practice tool: PTE covers Speaking, Writing, and Listening across seven distinct task types, each with different stimulus formats, response modes, and feedback dimensions. The current app's data model, UI, and AI feedback are all hardwired to IELTS, leaving PTE candidates without actionable, task-specific practice.

## Solution

Convert EchoLingo into a PTE Academic practice platform. Learners select a task type, receive a timed stimulus, submit a spoken or written response, and get AI-generated feedback with task-specific dimensions. A mock exam mode sequences all supported task types in PTE order with strict timing. Progress is tracked per task type; a daily learning plan surfaces the learner's weakest task types. The IELTS content and data model are fully replaced.

## User Stories

1. As a PTE candidate, I want to select a specific PTE task type to practice, so that I can focus on the skills I need to improve.
2. As a PTE candidate, I want to see a task stimulus (text or audio) before I respond, so that I can practice exactly as I would in the real exam.
3. As a PTE candidate, I want a countdown timer for each task, so that I build the time-awareness the real exam demands.
4. As a PTE candidate practicing Read Aloud, I want to receive a passage of text and speak it aloud, so that I can practice oral fluency and pronunciation together.
5. As a PTE candidate practicing Read Aloud, I want word-level and phoneme-level pronunciation feedback, so that I know exactly which sounds to fix.
6. As a PTE candidate practicing Repeat Sentence, I want to hear an audio sentence and then repeat it, so that I can train short-term memory and oral fluency.
7. As a PTE candidate practicing Repeat Sentence, I want pronunciation assessment on my recording, so that I can compare my delivery to the reference.
8. As a PTE candidate practicing Answer Short Question, I want to hear or see a question and give a brief spoken answer, so that I can practice quick-response fluency.
9. As a PTE candidate practicing Summarize Written Text, I want a passage to read and then a text box to write a one-sentence summary, so that I can practice identifying key information under pressure.
10. As a PTE candidate practicing Write Essay, I want a prompt and a text area with a word count, so that I can practice building coherent arguments within the exam's word limit.
11. As a PTE candidate practicing Personal Introduction, I want an open-ended prompt and a recording interface, so that I can warm up before the exam begins.
12. As a PTE candidate practicing Write from Dictation, I want to hear an audio sentence and type what I hear, so that I can train listening accuracy and spelling.
13. As a PTE candidate, I want to receive AI feedback after every practice task, so that I know my strengths, weaknesses, and what to do next.
14. As a PTE candidate, I want feedback broken down by the relevant dimensions for each task type (e.g. oral fluency and pronunciation for Read Aloud; content, grammar, vocabulary for Write Essay), so that I know specifically what to improve.
15. As a PTE candidate, I want to replay the audio stimulus for a task during practice, so that I can study it before responding.
16. As a PTE candidate in mock exam mode, I want the audio stimulus to play only once, so that I practice under real exam conditions.
17. As a PTE candidate, I want to take a full mock exam that sequences all supported task types in PTE order, so that I can simulate the real exam experience.
18. As a PTE candidate, I want the mock exam to enforce strict per-task timing, so that I build exam stamina and time management.
19. As a PTE candidate, I want to see an end-of-exam summary after a mock exam, so that I can review my performance across all task types at once.
20. As a PTE candidate, I want to browse my practice history filtered by task type, so that I can review past attempts for a specific skill.
21. As a PTE candidate, I want to replay my spoken responses from history, so that I can hear my own progress over time.
22. As a PTE candidate, I want to see my performance trend per task type on the stats page, so that I understand where I'm improving and where I'm stalling.
23. As a PTE candidate, I want the daily learning plan on the home page to recommend the task types I'm weakest at, so that my practice time is focused where it matters most.
24. As a logged-in PTE candidate, I want my task-type weakness data stored in the cloud, so that my daily plan is consistent across devices.
25. As a logged-out user, I want to see general practice entry points rather than a personalized plan, so that the app is still usable without signing in.
26. As a PTE candidate, I want AI-generated text stimuli for text-based task types, so that I always get fresh practice material.
27. As a PTE candidate, I want audio stimuli for Repeat Sentence and Write from Dictation to sound natural, so that I practice with realistic listening input.
28. As a PTE candidate using a mobile device, I want the practice UI to be fully usable on a small screen, so that I can practice anywhere.
29. As a PTE candidate who prefers Chinese, I want the app UI to be available in Chinese, so that I can navigate the platform without language barriers.
30. As a PTE candidate, I want to export my practice history, so that I can keep a personal record of my progress.

## Implementation Decisions

### 1. Full pivot — IELTS removed

EchoLingo becomes PTE-only. All IELTS-specific routes (`/practice/exam`, `/practice/shadowing`, IELTS mode identifiers), components, and API parameters are removed. Existing IELTS session data is retained in Supabase but not surfaced in any UI. No migration script is needed at current user scale.

### 2. Generic `PracticeTask` data model

A single `PracticeTask` type replaces `SpeakingSession`. Shape:

```ts
type PracticeTask = {
  id: string
  taskType: PteTaskType   // 'read_aloud' | 'repeat_sentence' | 'answer_short_question' | ...
  stimulus: TaskStimulus  // { kind: 'text' | 'audio'; content: string }
  response: TaskResponse  // { kind: 'audio' | 'text'; content: string }
  feedback?: TaskFeedback
  durationSeconds: number
  createdAt: string
  endedAt?: string
}
```

`TaskFeedback` has a fixed generic envelope (`summary`, `strengths`, `weaknesses`, `suggestions`) and a `details` object whose shape is narrowed by `taskType`. The generic envelope drives all shared UI (history list, stats, daily plan); `details` is consumed only inside each task's feedback component.

### 3. No official PTE 10–90 score simulation

EchoLingo does not attempt to replicate Pearson's scoring algorithm. AI feedback is qualitative and task-specific. Azure Pronunciation Assessment produces objective word/phoneme scores for spoken tasks independently of AI feedback. If score calibration becomes a future priority, it can be layered over the existing feedback structure without a schema change.

### 4. Stimulus generation strategy

- **Text task types** (Read Aloud, Answer Short Question, Summarize Written Text, Write Essay): DeepSeek generates stimulus on demand, parameterised by task type and optional topic.
- **Audio task types** (Repeat Sentence, Write from Dictation): Azure TTS generates audio from pre-written sentences; audio is cached to avoid repeated synthesis costs. A Task Bank holds the pool of cached audio stimuli per task type.

### 5. Azure Pronunciation Assessment scope

Pronunciation Assessment runs for Read Aloud and Repeat Sentence only. It runs in parallel with AI feedback generation and its results are merged into `details` before the Practice Task is saved. It is not used for other task types.

### 6. Timing model

Each task type has defined preparation and response windows. In Task Practice mode, timers are enforced but the learner can see the countdown and manage their own pace. In Mock Exam mode, timers are strict: when the response window expires, the response is submitted automatically. Audio stimuli play once in Mock Exam mode; replaying is allowed in Task Practice mode.

### 7. Modules to build or modify

**Data layer (modify):**
- Type definitions — replace IELTS types with PTE types
- Storage adapters — adapt unified-history, local-history, supabase-history to read/write `PracticeTask`
- Task-type weakness — replace IELTS error-pattern storage with task-type weakness signals derived from `TaskFeedback` history
- Recommendations — update daily plan logic to consume task-type weakness

**API layer (modify/extend):**
- Feedback endpoint — replace IELTS-specific prompt with a task-type-aware prompt that returns the generic envelope + task-specific details
- Examiner/stimulus endpoint — generate text stimuli per task type
- TTS and Pronunciation endpoints — unchanged interface; called from new task components

**UI — new:**
- Task Practice pages (one per task type): stimulus display, timer, response capture, feedback display
- `/practice` task-type selection page
- `/mock` mock exam orchestrator and summary report
- Timing engine component (shared, configurable for practice vs mock)

**UI — modify:**
- Home page daily plan — wire to task-type weakness
- History page — display `PracticeTask` records grouped/filtered by task type
- Stats page — task-type weakness trends replace IELTS band score trends
- Navigation — remove Shadowing link; add Mock Exam link

### 8. Route structure

```
/                          Home — daily plan
/practice                  Task-type selection
/practice/read-aloud
/practice/repeat-sentence
/practice/answer-short-question
/practice/summarize-written-text
/practice/write-essay
/practice/personal-intro
/practice/write-from-dictation
/mock                      Mock exam entry and orchestration
/history                   Practice Task history (task-type filtered)
/stats                     Task-type weakness and trends
```

Routes `/practice/exam`, `/practice/setup`, `/practice/shadowing` are removed.

### 9. Development order

Phase 1 — data model skeleton (types, storage, Supabase schema, recommendations)  
Phase 2 — per-task-type UI, vertical slices one at a time  
Phase 3 — practice infrastructure (task selection page, timing, Task Bank, history/stats updates)  
Phase 4 — mock exam mode  
Phase 5 — deferred task types (Describe Image, Re-tell Lecture)

## Testing Decisions

Good tests verify external behaviour through the module's public interface. They do not assert on internal implementation details (private functions, state shape, render internals). A test should still pass after an internal refactor that preserves observable behaviour.

**Modules to test:**

- **Type-narrowing utilities** — pure functions that narrow `TaskFeedback.details` by `taskType`; unit tests, no mocks needed
- **Task-type weakness derivation** — given a list of `PracticeTask` records with feedback, produces the correct weakness ranking; unit tests with fixture data
- **Recommendations logic** — given a weakness profile, produces a correctly prioritised daily plan; unit tests with fixture data
- **Storage adapters** — read/write round-trips for `PracticeTask`; existing unit test patterns in `backup.test.ts` and `api-client.test.ts` serve as prior art
- **Feedback endpoint** — given `{ taskType, stimulus, response }`, returns a `TaskFeedback` with a valid generic envelope; mock the LLM call, assert the response shape
- **Timing engine** — given a duration and a mode (practice / mock), counts down correctly and fires the submit callback on expiry; unit tests with fake timers
- **Mock exam orchestrator** — sequences task types in the correct PTE order and accumulates results; unit tests with stub task components

E2E smoke tests (Playwright, mock-first via `page.route()`):
- Complete a single Practice Task end-to-end (stimulus → response → feedback → history entry visible)
- Complete a mock exam and see the summary report

Existing E2E patterns in the current Playwright suite serve as prior art. Do not call real LLM, Azure, or Supabase APIs in CI.

## Planned Future Extensions (designed, not yet implemented)

These are architectural decisions already made — task types are designed and documented in `docs/agent-architecture.md`. Implementation is deferred to Phase 6–7.

- Reading section: Fill in the Blanks, Re-order Paragraphs, Multiple Choice
- Listening section: Summarize Spoken Text, Fill in the Blanks (Listening), Highlight Correct Summary
- Speaking section: Describe Image (requires image stimulus library), Re-tell Lecture (requires audio lecture library)
- Agent pipeline: Scoring Agent, Diagnosis Agent, Coach Agent, LLM-as-Judge
- Learning trajectory visualisation: radar chart, progress curve, gap analysis vs. target score

## Out of Scope

- Simulated PTE 10–90 total score without per-dimension basis (see ADR 0003 for nuanced scoring policy)
- Payment, subscriptions, or commercial operations
- Leaderboards, learning groups, or social sharing
- Public profile pages
- Real API calls in CI
- Migration of existing IELTS session data

## Further Notes

- `CONTEXT.md` at the repo root defines the canonical domain vocabulary for this pivot (PracticeTask, Stimulus, Feedback Envelope, Task-Type Weakness, etc.). All code and documentation should use these terms.
- ADRs 0001–0004 in `docs/adr/` record key architectural decisions: full IELTS pivot, generic data model, scoring strategy, and no Router Agent.
- The app name EchoLingo is retained. Rebranding is deferred until commercial intent is clearer.
- Personalization policy is unchanged: Supabase is authoritative for logged-in users; logged-out users see generic entry points; Supabase failure shows a temporarily unavailable state rather than falling back to localStorage personalization.
