# No Router Agent — task type is always caller-supplied

The agent pipeline does not include a Router Agent that infers task type from user input. Task type is always explicitly known at call time — the learner selects it from the `/practice` hub before any agent is invoked. Adding a routing layer would imply ambiguity that does not exist, introduce an unnecessary failure surface, and add complexity with no user benefit.

Each Section Agent (Speaking, Writing, Reading, Listening) is invoked directly with a known `taskType` in the request payload. The Scoring Agent, Diagnosis Agent, Coach Agent, and LLM-as-Judge all receive `taskType` as a first-class input.

## Considered Options

- **Router Agent infers task type from input** — rejected because task type is always caller-supplied; there is nothing to infer.
- **Router Agent as dispatcher** — a thin layer that routes a known `taskType` to the correct Section Agent. Rejected because this is just a function call, not an agent; naming it an Agent overstates its role and confuses the architecture diagram.
- **No Router layer (chosen)** — callers invoke Section Agents directly. Simpler, easier to explain, no hidden failure modes.
