# Full pivot to PTE Academic; IELTS Speaking removed

EchoLingo was originally an IELTS Speaking practice app. We pivoted to PTE Academic and removed all IELTS-specific content, routes, and logic. The decision was to do a clean full pivot rather than support both exams side-by-side. Supporting two exam formats would double the content surface area, complicate navigation ("which exam are you for?"), and split product focus. PTE's well-defined task taxonomy maps better to an AI-driven platform. Existing IELTS session data is retained in Supabase but not surfaced in the UI; no migration script is needed at this user scale.

## Considered Options

- **Keep both IELTS and PTE** — rejected because it doubles content management complexity and dilutes the product without a clear user benefit at this stage.
- **IELTS + PTE toggle** — same problem; two exam domains require two content strategies, two feedback rubrics, and two navigation trees.
