# update-dev-log

## Purpose

Use this skill whenever a development task is completed.

The goal is to keep a persistent project development history in `docs/dev-log.md`, so completed work can be tracked clearly without relying only on chat messages.

## When to Use

Use this skill after completing any meaningful development task, including:

- Creating or modifying project files
- Implementing a feature
- Fixing a bug
- Refactoring code
- Adding API routes
- Updating UI
- Changing configuration
- Adding documentation
- Improving tests

Do not use this skill for very small chat-only explanations that do not change the project.

## Required Behavior

After finishing a development task:

1. Open or create `docs/dev-log.md`.
2. Append a new entry to the end of the file.
3. Use the structure below.
4. Keep the chat response short after updating the log.
5. Do not replace old entries unless explicitly asked.
6. Do not invent completed work. Only record what was actually done.

## Log Entry Format

Use this format:

```markdown
## Entry X: Short Task Title

### Date
YYYY-MM-DD

### Scope
Briefly describe the task scope.

### Files Created or Changed
- path/to/file.tsx — short description
- path/to/file.ts — short description

### Completed Work
- Completed item 1
- Completed item 2
- Completed item 3

### How to Test
- Step 1
- Step 2
- Step 3

### Notes and Assumptions
- Note 1
- Note 2

---