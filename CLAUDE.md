@AGENTS.md

# EchoLingo Development Rules

## Project Context
EchoLingo is a PTE Academic practice platform.

Tech stack:
- Next.js
- TypeScript
- TailwindCSS
- DeepSeek API

## Workflow

Before coding:
1. Read CONTEXT.md — canonical domain terminology, use these terms in all code and docs
2. Read docs/adr/ — key architectural decisions and why they were made
3. Read docs/PROJECT_CONTEXT.md
4. Read docs/TASKS.md
5. Read docs/DEVELOPMENT_LOG.md

After coding:
1. Update DEVELOPMENT_LOG.md
2. Update TASKS.md
3. Explain changed files

## Coding Rules

- Keep components modular
- Avoid over-engineering
- Mobile-first design
- Prefer MVP implementations
- Avoid duplicate planning documents