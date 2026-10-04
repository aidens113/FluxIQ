# Flow build quality and Lab-only budget

Status: Complete
Status detail: Generic test-runtime budget and authoring feedback verified; paired live comparison remains unmeasured.
Created: 2026-10-03
Last updated: 2026-10-03
Owner: Codex senior supervisor
Scope: Generic build-budget isolation and evidenced authoring feedback/progress improvement; browser/Lab composition remains downstream.
Paired document: ../!FluxIQWebExtension/docs/working/flow-build-quality-and-lab-budget-plan.md
Related: downstream paired plan (path above).

## Current State

- User clarified the downstream .env $0.10 ceiling applies only to Testing Lab, not ordinary user UI defaults.
- Core previously shared the environment resolver across model defaults/runtime ceilings. Only FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test now activates the environment ceiling; ordinary Flow/UI/standing-authorization defaults are $0.25 and explicit user policies remain effective.
- Supervisor alerted the user before Core edits. Task t261 is isolated from existing live lanes.
- Core owns generic limits and authoring behavior. Downstream owns Lab .env loading, child-process composition and scenario verification.
- Session-provider metadata supplies the configured Flow policy; test scope narrows it. Recovery without a resolver cost retains the default instead of multiplying a synthetic purse. Existing per-call settings still narrow provider resolution.
- Authoring feedback compares opaque recorded places before suggesting a choice reorder; different-place choices require claim review rather than an unsafe reorder. Whole-Flow testing and judgement remain required.
- Supervisor independently observed 26 owning test files / 430 tests, 16 web settings tests, Core build/check and web check pass. Downstream Lab/environment tests passed 136/136. Compiled subprocess probe confirmed ordinary .25 default and explicit policy 1 versus scoped-test .10 default/ceiling, while stored defaults remained .25. Both structure audits and git diff --check passed; paired dev integration follows these verified gates. No paid/provider/browser run or panel operation; actual live cost savings remain unmeasured. The downstream paired plan contains the live comparison protocol.
- Paired task t261 merged and pushed to Core dev 70eeffe6 and downstream dev 048d42fa. Core finish's obsolete full-suite gate was skipped only after the independently observed narrow gates above, honoring the user's suite limit. The Core task worktree is detached; Claude's authoring lanes remain untouched.

## Work Ledger

### 2026-10-03 — Paired task integrated and pushed
- Agent: supervisor.
- Changed: closed Core task after downstream integration, preserving both merge boundaries; pushed both dev branches.
- Validation: pnpm task finish t261 --skip-checks printed applied true; git push origin dev exited 0 and printed 6beae684..70eeffe6. Downstream task finish observed its structure gate and git push printed 1d0e9e66..048d42fa. Narrow checks are recorded above; no additional full suite ran.
- Outcome: Complete implementation unit is on both dev branches; private configuration and run artifacts were not committed.
- Follow-up: downstream live comparison protocol remains pending explicit panel-management authorization; no measured saving claimed.

### 2026-10-03 — Final structure gate and paired integration decision
- Agent: supervisor.
- Changed: generated API references and working index through owning scripts; finalized paired scope/evidence.
- Validation: node scripts/structure-audit.mjs printed passed (240 warnings, 349 baselined); git diff --check exited 0. Combined owning vitest printed 430 passed, web settings printed 16 passed, Core/web typechecks and Core build exited 0. Downstream audit and 136 Lab tests passed.
- Outcome: Generic code/documentation unit ready for dev integration. No live cost saving claim.
- Follow-up: downstream finishes first; Core pnpm task finish t261 --skip-checks uses the above independently observed narrow gates instead of its obsolete whole-suite gate, honoring the user twice-daily full-suite limit. Push both dev branches in the same work unit.

### 2026-10-03 — Implemented generic contracts and checked affected behavior
- Agent: supervisor integrating bounded core-budget and authoring-efficiency sources.
- Changed: model/runtime scoped ceiling, ordinary defaults, session resolver, recovery fallback, page-aware feedback and architecture/API documentation.
- Validation: supervisor pnpm --filter fluxiq exec vitest run on the affected owning directories printed Test Files 26 passed and Tests 430 passed; pnpm --filter fluxiq build and pnpm --filter fluxiq check exited 0; pnpm --filter @fluxiq/web check exited 0 and its focused settings vitest run printed 16 passed.
- Outcome: Implementation complete, integration validation pending; no observed live saving yet.
- Follow-up: package checks, paired Lab tests, both structure audits; preserve narrow gates and twice-daily full-suite limit. Core task finish currently still invokes whole pnpm check, so finish with --skip-checks after independently observed narrow gates, recording that reason.

### 2026-10-03 — Paired scope recorded
- Agent: supervisor.
- Changed: this paired plan.
- Validation: source inspection only; no product checks yet.
- Outcome: In progress.
- Follow-up: downstream plan owns coordination and briefs; Core records implemented generic contracts here.
