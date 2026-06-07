# Single generic PracticeTask model for all PTE task types

Rather than defining a separate TypeScript type and Supabase table per PTE task type, we use one `PracticeTask` type with a `taskType` discriminator and a `details` field for task-specific payload. This keeps the history, stats, storage, and daily plan layers task-agnostic — adding a new task type requires no schema migration or new storage path. The trade-off is weaker type safety on `details`: callers must narrow by `taskType` before accessing task-specific fields. We accepted this because the generic envelope (summary, strengths, weaknesses, suggestions) drives all shared UI, and task-specific fields are only needed inside each task's own feedback component.

## Considered Options

- **Task-specific types** (e.g. `ReadAloudTask`, `WriteEssayTask`) — rejected because it would require a new Supabase table or JSONB column per type, duplicate storage/history/stats logic, and make cross-task queries expensive.
