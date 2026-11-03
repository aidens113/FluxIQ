# Brief: thin-handlers

Goal: Automation Studio's endpoint handlers hold no logic. Move the logic out of the flagged functions into the framework so each handler reads its request, calls the service once and shapes the reply. Behaviour and wire responses stay exactly as they are.

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t845/!FluxIQ`, branch `task/t845-studio-controller`.

Flagged, under `packages/fluxiq/src/programs/automation-studio/api/handlers/`. Run `node scripts/structure-audit.mjs --rule program-controllers` for the current list:

- `llm-generation.ts`: an endpoint handler (102 lines) and `sanitizedFlowBootstrapGeneration` (42)
- `runtime-execution.ts`: an endpoint handler (91)
- `conversations.ts`: three endpoint handlers (34, 22, 21) and `commandContext` (21)
- `instructions.ts`: an endpoint handler (33)
- `flows.ts`: an endpoint handler (29)
- `llm-execution-settings.ts`: `assertFlowLlmExecutionSettings` (28)

Owned paths: those handler files and their tests; new or existing modules under `packages/fluxiq/src/framework/automation-service/service/**` for the moved logic, with their tests beside them.

Must not touch: `scripts/structure-audit/**` and `.structure-baseline.json` (do not raise a budget), `packages/fluxiq/package.json`, anything under `runtime/**` or `engine/**` except a one-line import a move requires, and the files named in the `dev-failures` brief. No git mutations and no commits.

Rules:

- A move, not a rewrite: keep each body's statements and order, and pass in what it used to reach from the handler's scope. Permission checks that are part of the endpoint contract (`permission`, `resource`, `classification`) stay in the handler registration.
- Validation that turns a bad request into an API error may stay in the handler if it fits the 20-line budget; otherwise it moves with the logic.
- No new behaviour, no new mechanism, no cleanup beyond the move. If moving something exposes a real defect, report it instead of fixing it here.
- Nothing under `framework/` or `runtime/` may import `programs/automation-studio`. Import boundaries enforce this.
- Tests live in a `tests/` folder beside their subject. One exported thing per file; a barrel in every directory.
- Never run full suites: the user caps them at twice a day. No paid model calls, no panel, no browser.

Context: `docs/working/studio-controller-plan.md`, Current State only, and `docs/architecture/code-structure.md`.

Acceptance checks, run and quote each:

1. `node scripts/structure-audit.mjs --rule program-controllers` -> no findings.
2. `pnpm.cmd --filter fluxiq check` -> 0 errors.
3. `pnpm.cmd exec vitest run src/programs/automation-studio/api --minWorkers 1 --maxWorkers 2` from `packages/fluxiq`, plus the tests beside the moved logic -> same results as before your change. Record the before and after counts.
4. `node scripts/structure-audit.mjs` -> no new findings from your files.

Report: `docs/working/studio-controller-plan/reports/thin-handlers.md`. End your final message with the return contract: Outcome, Changed, Validation, Not verified, Report, Notes.
