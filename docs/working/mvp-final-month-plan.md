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

Current behavior still permits yes + unsure/silent as confirming success and
applies unsupported reauthor topologies before rerun. These source findings are
not fixed until worker edits are independently reviewed and owning tests pass.
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

### 2026-10-06 - Implementation authorized and paired tasks assigned
- Agent: Codex supervisor.
- Changed: this paired contract ledger; downstream implementation briefs.
- Why: user requested full execution with durable handoff for Claude.
- Validation: intake trees clean; relevant audit and current Core instructions read; no product tests yet.
- Outcome: Partial
- Follow-up: t296/t298 reports, independent checks, downstream t297 readiness.
