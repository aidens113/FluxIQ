# MVP Final Month Plan - Core implementation

Status: Active
Status detail: P0 acceptance and cancellation tasks assigned; candidate-authoring implementation follows the readiness gate.
Created: 2026-10-06
Last updated: 2026-10-06
Owner: Codex senior supervisor
Scope: Generic Core acceptance, candidate authoring/execution/promotion, cancellation and uncertain-outcome contracts required by the downstream MVP plan. Browser behavior and live qualification remain downstream.
Paired document: C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/mvp-final-month-plan.md
Related: [authoring](./flow-authoring-and-defensive-runtime-plan.md), [version history](./flow-version-history-plan.md)

---

## Current State

The user authorized implementation of the audited plan on 2026-10-06 locally,
with continuous documentation so Claude can resume. Downstream owns the phase
schedule, worker briefs and live qualification; this document owns generic Core
contract state. Starting Core dev `e9b7d691`.

P0 in progress: t296 isolated paired worktrees implement fail-closed confirming
verdicts and refuse unsupported apply-before-judged repair topology; t298 isolated
paired worktrees implement build cancellation and downstream reachable Stop.
Downstream t297 implements running build identity independently.

Task t296 now requires affirmative confirmation for a build yes and refuses
unsupported held reauthor topologies before apply/dispatch/writes. Supervisor
reviewed the source and independently observed 29/29 changed-owner tests passing;
worker directory regressions passed 391 tests and fluxiq check/audit passed.
Revalidated after integrating dev. This completes these two fences, not the entire
P0 evidence/readiness/control gate. Start-rerun decline wording remains t298 wiring.
Existing Flow schema, executor, signatures, validation, held promotion and graph
storage are retained. Unknown evidence does not authorize automatic promotion.

Next: finish P0 readiness/control, then feature-flagged explicit candidate submission
with discovery evidence separated from authored graphs, declared-start candidate
execution and shared revision-scoped promotion. Preserve permission/policy and
generic Core boundaries. No browser-specific semantics added here.

No full suite or live/provider run performed in this implementation session yet.
Use owning tests/types/audit per task; full sweeps at most twice daily under the
user's downstream instructions. Workers never commit or merge; supervisor verifies
and closes downstream task first, then Core under Core's own task gate.

## Work Ledger

### 2026-10-06 - t296 acceptance fences verified
- Agent: Codex supervisor; p0-acceptance worker.
- Changed: affirmative confirmation agreement, unsupported held-topology refusal, owning tests, authored architecture; source commit 1736ba81.
- Why: unknown/silent confirmation is insufficient proof; unsupported topology must not replace accepted graph before verification.
- Validation: fail-first 10 failures reported; worker owning directories 391 passed, fluxiq check and audit passed; supervisor source/test review and independent 29/29 test run passed. Only docs arrived in dev integration; owning checks rerun before close. No live/provider calls.
- Outcome: Accepted
- Follow-up: t298 preserve decline reason; remaining P0 readiness/control/requirement receipts; t299 candidate path.

### 2026-10-06 - Implementation authorized and paired tasks assigned
- Agent: Codex supervisor.
- Changed: this paired contract ledger; downstream implementation briefs.
- Why: user requested full execution with durable handoff for Claude.
- Validation: intake trees clean; relevant audit and current Core instructions read; no product tests yet.
- Outcome: Partial
- Follow-up: t296/t298 reports, independent checks, downstream t297 readiness.
