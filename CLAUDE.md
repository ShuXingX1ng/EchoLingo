@AGENTS.md

# EchoLingo

EchoLingo is a PTE Academic practice platform with a Next.js frontend and a FastAPI backend. FastAPI is the only business backend; the browser reaches it through `NEXT_PUBLIC_API_BASE_URL`.

## Commands

| Purpose | Command |
|---|---|
| Frontend dev | `npm run dev` |
| Frontend lint | `npm run lint` |
| Frontend typecheck | `npm run typecheck` |
| Frontend unit tests | `npm run test:unit:run` |
| Frontend build | `npm run build` |
| Frontend E2E | `npm run test:e2e` |
| Backend dev | `cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000` |
| Backend lint | `cd backend && ruff check .` |
| Backend tests | `cd backend && pytest tests/ -v --tb=short` |

Run the smallest relevant checks during development and the full affected-side gate before declaring a meaningful change complete. Paid external services must stay mocked in normal CI and E2E runs.

## Context Routing

Read only the context needed for the task:

- `CONTEXT.md`: canonical product language and domain boundaries.
- `docs/PROJECT_CONTEXT.md`: current product and runtime state.
- `docs/ROADMAP.md`: current phase and strategic priorities.
- `docs/adr/README.md`: decision index; open only relevant ADRs.
- `docs/SPEECH_EVALUATOR_ROADMAP.md`: only for speech-evaluator work.
- `docs/DEPLOYMENT.md`: only for environment, operations, or deployment work.
- `docs/DEVELOPMENT_LOG.md`: historical milestones; do not load by default.

## ECC Workflow

1. Inspect the current worktree and relevant source-of-truth files before planning.
2. Use `/plan` for broad or risky work; do not create a second plan when an accepted plan already exists.
3. Keep implementation scoped to the accepted change and preserve unrelated user edits.
4. Run the relevant verification loop; use `/code-review` for meaningful code changes.
5. Use `/update-docs` only when code-derived documentation changed, and update hand-written docs only when their stated trigger applies.
6. Report changed files, validation evidence, and any unverified assumptions.

Use `/save-session` for temporary handoff state. Session notes are not project documentation and must not be treated as completed work.
