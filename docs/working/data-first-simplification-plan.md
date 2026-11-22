# Data-First Simplification: Core Execution

Status: Active
Status detail: P0 resumed 2026-11-22 in existing paired tasks t976, t979 and t981; no resumed change accepted yet.
Created: 2026-11-22
Last updated: 2026-11-22
Owner: Senior supervisor agent
Scope: Shared Flow authoring, permissions, judging, retained data, deterministic processing and replay for FluxNodes and extension clients.
Paired document: ../!FluxIQWebExtension/docs/working/data-first-simplification-plan.md
Related: [FluxNodes](./fluxnode-plan.md), [Answer First](./answer-first-plan.md)

## Current State

The downstream paired plan is the approved plan of record (2026-11-20).
The user requested execution with agents and durable progress on 2026-11-22.
P0 resumes interrupted paired task trees under C:/Users/osrs_/FluxStuff/fxwork/.

| Task | Worker | Owned change | Acceptance |
| --- | --- | --- | --- |
| t976 | p0_permission | Declare consequential act classes in chat interpretation; ask once at start; retain grants/refusals; close all mid-Flow permission paths | Start-only permission, no added chat model call, continuation/repair/legacy/project tests plus downstream Lab |
| t979 | p0_judge | Recover unreadable replies on the same model; native standalone format and accurate feedback | Judge recovery/cancel/purse tests plus affected framework mocks |
| t981 | p0_repair | Refuse invalid repeat amendments and rebind reruns before withdrawal | Recorded-failure-shaped tests, valid assembly and rerun regression |

Workers own only their task trees and reports; lead owns shared documents, verification and git.
Written briefs are in the downstream main checkout's data-first-simplification-plan/briefs/.
Reports are in each downstream task tree's data-first-simplification-plan/reports/.
**t979 lead acceptance, 2026-11-22:** after synchronizing current dev (including
t978 trail deduplication), the lead ran 12 focused files: 125/125 tests passed
in 87.51 s. `pnpm --filter fluxiq check` passed in 72.209 s. This covers same-model
native fallback, billed malformed replies, aggregate purse, settled spend at
deadline and parent trail-size compatibility. Source is checkpointed at 0.50.3;
final structure/merge gates remain. No paid runs or full sweeps launched.

After P0: establish a retained-row contract before parallel extraction and processing work.
The lead froze that contract on 2026-11-22 after source discovery: keep JsonObject
rows and RecordSchema/RecordBatch; optional RecordField semanticType
(text/number/currency/count/date/datetime/url/id/flag) and mark (badge/flag/state);
valueType is the actual JSON type and primaryKey the validated identity fields.
Keep original display values; shared parsers derive typed comparisons against the
run reference time. Parsed column samples are not row truth. Full safe schemas
survive live/saved bindings and replay; process.columns alone selects display.
Explicit exclusions stay authoritative and schema overflow must not silently trim.
Implementation is active in paired t982; worker reports the schema seam stable with 60 record-set tests and contracts typecheck passing. Lead acceptance remains pending. P4 compatibility preserves historical
attempt records and attempt identity, but old escalation cannot change serving;
automation defaults to Haiku and all its roles retain its explicit starting model.
Core owns domain-neutral storage, processing, judging, models and replay.
Browser reads/DOM extraction and Lab scenarios remain downstream.
Build, repair and judging stay on Haiku; no model escalation.
Paid acceptance follows provider-free proofs, four attempts per task and the $50 campaign ceiling.

## Work Ledger

### 2026-11-22 - Independent repeat-repair acceptance
- Agent: Senior supervisor.
- Changed: t981 repeat-safe amendments, rerun reference/order repair, refusal feedback and architecture note; package version 0.50.4. Parent synced through accepted judge unit.
- Validation: `pnpm --filter fluxiq exec vitest run src/runtime/flow-authoring/draft/amendment/tests src/runtime/flow-authoring/draft/loop-covered/tests/loop-covered.test.ts src/runtime/llm/evidence-loop/tests/rerun-replacement.test.ts src/runtime/llm/evidence-loop/tests/held-amendments.test.ts src/runtime/llm/tests/draft-amendment-feedback.test.ts src/runtime/llm/draft-amendment-feedback/tests/repeat-refusal.test.ts src/runtime/llm/decision-handlers/tests/refusal-way-out.test.ts src/runtime/flow-authoring/bootstrap/tests/evidence-loop-steps.test.ts src/runtime/flow-authoring/bootstrap/authoring/tests/draft-routing.test.ts --maxWorkers=1 --minWorkers=1 --fileParallelism=false` -> 16 files, 281/281 tests passed, 67.68 seconds.
- Validation: `node scripts/structure-audit.mjs` -> passed (563 warnings, 909 baselined). `pnpm --filter fluxiq check` -> exit 0, rebuilt changed package inputs in 87,253 ms; no live/full-sweep acceptance claimed.
- Outcome: Accepted by lead narrow checks; paired integration follows.
- Follow-up: finish paired task after remaining gate; P5 replay continuity follows.


### 2026-11-22 ? Judge integrated and next lanes dispatched
- Agent: Senior supervisor.
- Changed: t979 merged into both dev branches; t982 extraction and t983 fixed-model implementations active in isolated paired trees. t981 checkpointed and synced for lead verification.
- Validation: `pnpm task finish t979 --skip-checks` -> mandatory contract tests 70/70 passed and merge completed. Downstream `pnpm task finish t979` -> structure audit passed and paired merge completed. Earlier independent 125 tests, package typecheck and audit recorded below.
- Outcome: Partial: judge unit accepted; remaining plan continues.
- Follow-up: repair acceptance, permission review/validation, retained-row plumbing, fixed-model execution, then dependent processing and offline proofs.


### 2026-11-22 — Resume approved P0 tasks
- Agent: Senior supervisor.
- Changed: paired execution record.
- Why: preserve assignments and progress across sessions while workers resume interrupted changes.
- Validation: `git status --short` in main Core -> no output; in task trees -> existing changes for all three P0 units. No product acceptance run yet.
- Outcome: Partial.
- Follow-up: independently verify workers, integrate P0, then fix retained-row contract.

### 2026-11-22 — t979 independent acceptance after parent sync
- Agent: Senior supervisor.
- Changed: judge recovery, usage receipts and architecture note; source checkpoint 021b1f631 followed by parent merges.
- Why: unreadable replies must recover on the same model without losing billed usage or exceeding the shared purse.
- Validation: `pnpm --filter fluxiq exec vitest run --maxWorkers=1 --minWorkers=1 --fileParallelism=false src/runtime/result-verification/build-test/tests/judge.test.ts src/runtime/result-verification/flow-less/tests/judge-unreadable.test.ts src/runtime/result-verification/tests/judge-reply/tests/unreadable-reply.test.ts src/runtime/result-verification/tests/run-outcome.test.ts src/runtime/llm/harness/tests/paid-refusal.test.ts src/runtime/llm/build-purse/tests/refused-unbilled.test.ts src/runtime/llm/role-routing/tests/judge-same-model.test.ts src/runtime/llm/anthropic/tests/judge-continuation.test.ts src/runtime/models/providers/anthropic/tests/judge-trail-references.test.ts src/runtime/result-verification/build-test/tests/request-size.test.ts src/runtime/result-verification/flow-less/tests/judge-size.test.ts src/runtime/result-verification/run-trail/tests/repeats.test.ts` -> Test Files 12 passed; Tests 125 passed; 87.51 s. `pnpm --filter fluxiq check` -> exit 0, build-cache fluxiq:check 72209 ms.
- Outcome: Partial.
- Follow-up: final structure audit and paired task integration; live acceptance remains later.

## Open Questions

- Resolved: retained-row interface frozen; implementation underway in t982.
- Lead: verify recorded-run offline replay coverage before any paid test.
