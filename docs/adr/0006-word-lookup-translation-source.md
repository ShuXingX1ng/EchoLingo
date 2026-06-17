# Word Lookup translation source and Vocabulary List storage

## Context

We are adding **Word Lookup** — a floating helper on Task Practice pages that translates a word or short phrase the learner selects from any on-page text (drag the selection into the helper on desktop, or tap a "译" button beside the selection on all platforms). It is a learning aid only and never appears in a Mock Exam, where a translation tool would break exam realism and pollute Task-Type Weakness signals.

Two decisions here are non-obvious and worth recording:

1. **Where translations come from.** A reasonable reader would assume "just call DeepSeek for everything" (the LLM is already wired up via `backend/services/llm_chain.py`) or "use a translation API." We chose neither as the sole path.
2. **Where the Vocabulary List is stored.** The project's default convention is localStorage-first (see the `unified-*` libs), so a future reader will wonder why this feature does cloud sync from v1.

## Decision

### Translation source: dictionary-first, LLM fallback

Route by input shape after cleaning (strip surrounding punctuation, collapse whitespace):

```
single English word?
  ├─ yes → ECDICT lookup
  │          ├─ hit  → dictionary card (instant, offline)
  │          └─ miss → DeepSeek fallback
  └─ no (phrase / short sentence) → DeepSeek
```

- **ECDICT** is an open-source English→Chinese dictionary database (~770k entries with phonetics, part-of-speech-grouped meanings, and exam tags). It is imported into a local SQLite database and queried server-side — zero cost, zero latency, no new external dependency. The data file is **not** committed to git; an import script in `backend/scripts/` fetches and loads it on first deploy.
- **DeepSeek** (existing `llm_chain.py`) handles phrases and dictionary misses. Single-word lookups deliberately **do not** use the LLM's context-disambiguation ability — `bank` lists all senses and the learner picks. Speed is prioritised over disambiguation; the response schema reserves `text`/`source` fields so a future "translate in context" affordance can be added without a redesign.

Unified response schema across both sources:

```json
{
  "source": "dictionary" | "ai",
  "text": "bank",
  "phonetic": "bæŋk",
  "entries": [{ "pos": "n.", "meaning": "银行;河岸;堤" }],
  "tags": ["雅思", "托福"]
}
```

### Vocabulary List: Supabase cloud sync from v1

The **Vocabulary List** (saved words, entered only by an explicit save control — looking a word up does not add it) is stored in **Supabase when logged in, with localStorage fallback when not**, following the `unified-task-history.ts` pattern. This deviates from the project's usual localStorage-first MVP convention because cross-browser / cross-device persistence is a stated requirement for this feature: a vocabulary list that vanishes when the learner switches browsers has little value. A new Supabase migration adds the table with RLS; the list is also added to `BackupData` in `src/lib/backup.ts`.

## Considered Options

- **DeepSeek for everything** — simplest routing, best disambiguation, but every single-word lookup costs an LLM round-trip (~1–3s). Rejected: the core value is *instant* lookup, and a local dictionary delivers that for the common case.
- **Third-party translation/dictionary API** (Youdao, Baidu, Azure Translator, Free Dictionary) — Youdao/Baidu dictionary tiers are paid; Azure Translator's free tier gives only the translation, not phonetics/POS/exam tags; Free Dictionary is English→English. All add a new dependency and/or key. Rejected in favour of bundling ECDICT.
- **ECDICT for everything** — instant but cannot handle phrases or sentences and gives no context. Rejected; phrases fall through to DeepSeek.
- **ECDICT + DeepSeek hybrid (chosen)** — instant for the common single-word case, LLM quality for phrases and misses, no new external service.
- **Vocabulary List localStorage-first** — matches project convention, less work, but fails the cross-device requirement. Rejected for this feature specifically.

## Consequences

- New `backend/routers/word_lookup.py`; ECDICT import script in `backend/scripts/`; SQLite data file gitignored.
- DeepSeek fallback reuses `llm_chain.py` with a new prompt in `backend/prompts/`; constrained to low `max_tokens`, low temperature, JSON mode.
- New frontend proxy route under `src/app/api/`.
- New floating `WordLookup` component (drop zone + selection "译" button) mounted on Task Practice layout only, never on Mock.
- New `src/lib/unified-vocabulary.ts` + `supabase-vocabulary.ts` + local variant; new Supabase migration (table + RLS); `/vocabulary` page (view and delete only, no spaced-repetition in v1); `vocabulary` field added to `BackupData`.
