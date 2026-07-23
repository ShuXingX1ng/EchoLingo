<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:echolingo-project-rules -->
# EchoLingo Project Rules

- Use `CONTEXT.md` for canonical domain terminology and `docs/adr/` for durable decisions.
- Treat source code, manifests, schemas, and tests as the authority for code-derived facts.
- Do not duplicate feature task lists across documents. `docs/ROADMAP.md` is strategic; detailed Speech Evaluator work lives in its dedicated roadmap.
- Update `docs/PROJECT_CONTEXT.md` only when current product, architecture, data, or runtime facts change.
- Update `docs/DEVELOPMENT_LOG.md` only for completed milestones, and include validation actually performed.
- Update generated documentation only inside marked generated sections, preserving hand-written sections.
- Do not mark planned work as implemented. Keep commercialisation, payment, subscription, ranking, group, and social features in future scope unless explicitly requested.
- Before completing meaningful code work, run the smallest relevant verification during iteration and the full affected-side quality gate at completion.
<!-- END:echolingo-project-rules -->
