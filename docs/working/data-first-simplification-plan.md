# Data-First Simplification: Core Execution

Status: Active
Status detail: P0 and fixed-model P4 accepted, integrated and pushed in both repositories. Retained extraction, automatic processing and recorded proof active.
Created: 2026-11-22
Last updated: 2026-11-22
Owner: Senior supervisor agent
Scope: Shared Flow authoring, permissions, judging, retained data, deterministic processing and replay for FluxNodes and extension clients.
Paired document: ../!FluxIQWebExtension/docs/working/data-first-simplification-plan.md
Related: [FluxNodes](./fluxnode-plan.md), [Answer First](./answer-first-plan.md)

## Current State

**Execution active, 2026-11-22.** The paired downstream Data-First Simplification Plan is the approved plan of record. The user requested agents and durable progress; lead owns integration, shared documents and verification. Reports below are claims until independently checked.

| Unit | Accepted evidence / current state | Next |
| --- | --- | --- |
| P0 t979 judge recovery | Integrated and pushed; lead 125/125 tests, types/audit and 70/70 merge contracts. Same-model recovery preserves paid receipts. | Included in combined parent checks. |
| P0 t981 repeat-safe repair | Integrated and pushed; lead 281/281 tests, types/audit and 70/70 merge contracts. | Recorded replay acceptance remains later. |
| P0 t976 start-only permission | Integrated and pushed; lead 161 Core, 66 Lab and 13 catalog tests, types/builds/audits, 70/70 merge contracts. | Included in fixed-model checks. |
| P4 t983 fixed model | Integrated and pushed, fluxiq 0.51.0; lead 140/140 combined tests, types/build/audit and 70/70 merge contracts. One starting model survives repair/replay; Haiku default. | Do not reopen completed model/permission units. |
| P1 t982 retained extraction | Core frozen and lead-accepted: 111 retention/store/rows/public-export tests and 69 schema-contract tests. Published package metadata contracts 0.23.0 / fluxiq 0.52.0; five-library build passes, no registry publication. | Downstream focused fixture/type/audit corrections, paired integration. |
| P2 t984 automatic processing | Independent operator/binding/provenance source checkpointed; lead 77/77 and 79/79 tests pass. Latest accepted P1 source/version/baseline synced; p0_permission resumes runtime. | Interpreter/task-memory declaration, one clock, atomic retained answer persistence and readiness before success. |
| P5 t985 replay continuity | F24 successful unchanged retry no longer invalidates replay proof. Lead combined 55/55 tests, types and audit pass. Source checkpointed, not integrated. F23 exact target/repair cause unproven. | Finish recorded diagnosis; never infer zero calls from null counts or no saved repairs from partial evidence. |
| P6 t987 smaller judge | Paired trees and written brief prepared; p0_repair doing read-only intake during P1 gates. | All three trail sources share a compact semantic contract retaining all rows, removal accounts and uncertain effects. |
| S1/S2/S6 t986 offline proof | Public strict trace scope passes worker 11 tests/types/audit/build; lead acceptance pending. Runner types/build pass. F25 has 57 verified artifacts but an open trace; original binding/capture correlation is under investigation. | Named owner tests, actual public-entry preflight/capture and exact recorded parity. Prefixes are not whole-task acceptance. |
| S7 t988 one plan | Integrated both sides. Only this implementation plan stays Active; historical unresolved work preserved in paused plans and five exact archives. Downstream structure gate and Core 70/70 contracts pass. | Paired dev backup with this refreshed state. |
| S8 shared heavy gate | MeritPrompts source59341fc, lead94/94 full suite passes; current machine gate unchanged. Windows kernel ownership, strict FIFO, fresh physical/commit reservations. | Tooling integration, then quiet compatibility switch only when holders and queue drain. |

Stable retained-row interface: JsonObject plus RecordSchema/RecordBatch; optional semanticType and mark, actual JSON valueType, validated identity primaryKey. Keep original values and all safe fields; process.columns alone selects display. Exclusions remain authoritative, overflow explicit, detector samples never replace row truth. Core owns neutral storage/processing/judging/replay; DOM, browser and Lab stay downstream. Internal collected/answer paging differs from public projected output. Migration0040 keeps private exclusions and explicit full-answer readiness; legacy projected rows are never guessed into full rows.

Automatic processing uses exact field IDs or unique labels, one real run reference clock, deterministic selection once, framework-stamped source/revision/bindings and explicit missing evidence. No fuzzy schema guesses, new terminal failure, or model ladder. Action-row selection remains distinct from broad collection.

No paid calls, browser acceptance or completed full FluxIQ sweep. A default t988 finish inadvertently started pnpm check after contracts; lead stopped only that identified owned check during script tests, verified its processes gone, then finished with the prior narrow document audit and mandatory contracts. The interrupted check is not a pass. No main promotion. Final paid acceptance requires provider-free proofs, four attempts, predecessor Flow continuation and zero calls on attempts2-4, within the approved total$50 ceiling.

Assignments: p0_repair owns P1 downstream then P6; p0_permission owns P2 runtime after its finished S8 source report; p0_judge owns offline proof. Root owns P5, verification, documentation and git. Main downstream briefs and task-local reports under data-first-simplification-plan/ are the handoff. Main user edits remain untouched.

## Work Ledger

### 2026-11-22 ? Fixed-model paired integration

- Validation: downstream `pnpm task finish t983` -> structure audit passed, merged and worktree removed. Core `pnpm task finish t983 --skip-checks` -> mandatory contract gate 70/70 passed, merged and detached/deleted task branch. Independent 140 tests/typecheck/build/audit are recorded below. Core 0.51.0; paired dev push next. No main promotion or paid/live acceptance.

### 2026-11-22 ? t983 combined lead acceptance

- Merged accepted permission source and current dev; semantic auto-merge preserves taskActs and fixed-model interpretation. Core version 0.51.0. Final parent sync changed documentation only.
- Validation: `pnpm --filter fluxiq exec vitest run src/framework/automation-service/service/answer-first/task-model/tests/resolve.test.ts src/framework/automation-service/service/answer-first/attempt/tests/caller-seams.test.ts src/framework/automation-service/service/answer-first/attempt/tests/caller-replay.test.ts src/framework/automation-service/service/answer-first/chat-permission/tests src/runtime/conversations/instructions/tests/unanswered-task.test.ts src/runtime/conversations/instructions/tests/recorded-chat-requests.test.ts src/runtime/conversations/instructions/tests/interpret.test.ts src/runtime/conversations/instructions/tests/acts.test.ts src/runtime/llm/anthropic/tests/panel-command-climb.test.ts src/runtime/llm/role-routing/tests src/runtime/llm/role-routing/ladder/tests/state.test.ts src/runtime/llm/decision-handlers/tests/loop-decision.test.ts src/runtime/llm/attempt-loop/tests/run.test.ts --maxWorkers=1 --minWorkers=1 --fileParallelism=false` -> 20 files, 140/140 tests passed, 152.82 s.
- Validation: `pnpm --filter fluxiq check` -> exit 0, 90624 ms. `node scripts/structure-audit.mjs` -> passed, 564 warnings, 909 baselined. All through machine heavy-slot gate in t983 Core.
- Validation: `pnpm --workspace-concurrency=1 --filter @fluxiq/contracts --filter @fluxiq/sdk --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` -> exit 0; fluxiq build 155364 ms, UI build 17430 ms, other libraries reused current stamps. Paired integration next. No paid/live/full-sweep claim.


### 2026-11-22 ? Permission paired integration

- Validation: downstream `pnpm task finish t976` -> structure audit passed, merged, worktree removed. Core `pnpm task finish t976 --skip-checks` -> mandatory contract gate 70/70 passed; merged and task branch detached/deleted. Independent acceptance commands/results recorded below.
- Next: paired dev push, fixed-model final acceptance, remaining data/replay/offline units.

### 2026-11-22 ? t976 independent acceptance in progress

- Lead synchronized both parents and reviewed gate closure, startup concurrency, held declines and repair continuation. Core version is 0.50.5.
- Validation: `pnpm --filter fluxiq exec vitest run src/runtime/action-permission-requests/tests/task-start.test.ts src/runtime/flow-authoring/bootstrap/tests/action-permissions-task-start.test.ts src/framework/automation-service/service/answer-first/chat-permission/tests src/framework/automation-service/tests/service-bootstrap/tests/permission.test.ts src/framework/automation-service/tests/service-bootstrap/tests/permission-ask.test.ts src/framework/automation-service/service/answer-first/flow-run/tests/permission-start.test.ts src/framework/automation-service/service/answer-first/flow-run/tests/steps-ran-interruption.test.ts src/framework/automation-service/service/project-build/tests/project-build-brief-ports.test.ts src/framework/automation-service/service/answer-first/attempt/tests/caller-seams.test.ts src/framework/automation-service/service/answer-first/attempt/tests/caller-replay.test.ts src/runtime/adaptation/recovery/tests/runtime-exploration-permission.test.ts src/runtime/adaptation/recovery/annotation/tests/recovery-permissions.test.ts src/runtime/conversations/instructions/tests/interpret.test.ts src/runtime/conversations/instructions/tests/acts.test.ts src/runtime/conversations/commands/tests/build.test.ts src/framework/automation-service/service/conversation-requests/tests/append-turn.test.ts --maxWorkers=1 --minWorkers=1 --fileParallelism=false` -> 17 files, 161 tests passed, 214.68 s.
- Validation: `pnpm --filter fluxiq check` -> exit 0, 155667 ms. `node scripts/structure-audit.mjs` -> passed, 564 warnings, 909 baselined. All three through heavy-slot gate in t976 Core.
- Validation completed: Core five-library and downstream five-package dependency builds passed; scenario catalog build passed. Downstream `pnpm --filter @fluxiq-web-extension/test-runner check` -> exit 0, 26413 ms. `node --test dist/flow-lane/creation/tests/permission-point.test.js dist/person-simulation/tests/simulation.test.js dist/person-simulation/tests/asks.test.js dist/run-evaluation/permission-stop/tests/permission-stop.test.js dist/flow-lane/creation/tests/lane.test.js` in test-runner -> 66/66 passed, 14495.7023 ms. `node --test dist/scenarios/tests/live-instructions.test.js` in scenario-lab -> 13/13 passed. Downstream audit -> passed, 258 warnings/551 baselined. Paired integration next; no paid/live/full-sweep acceptance claimed.


### 2026-11-22 - Repeat repair integrated after lead acceptance
- Agent: Senior supervisor.
- Changed: t981 merged in both repositories; paired execution checkpoint updated.
- Validation: `pnpm task finish t981` downstream -> audit passed, merged and worktree removed. Core `pnpm task finish t981 --skip-checks` -> mandatory contract gate 70/70 passed, merged and branch detached/deleted. Independent 281 tests/typecheck/audit recorded in paired Core ledger.
- Outcome: Accepted for t981; whole plan remains active. No paid/full-sweep claim.
- Follow-up: paired dev push, t976 acceptance, P1/P4/P2/P5 and offline proof.


### 2026-11-22 - Independent repeat-repair acceptance
- Agent: Senior supervisor.
- Changed: t981 repeat-safe amendments, rerun reference/order repair, refusal feedback and architecture note; package version 0.50.4. Parent synced through accepted judge unit.
- Validation: `pnpm --filter fluxiq exec vitest run src/runtime/flow-authoring/draft/amendment/tests src/runtime/flow-authoring/draft/loop-covered/tests/loop-covered.test.ts src/runtime/llm/evidence-loop/tests/rerun-replacement.test.ts src/runtime/llm/evidence-loop/tests/held-amendments.test.ts src/runtime/llm/tests/draft-amendment-feedback.test.ts src/runtime/llm/draft-amendment-feedback/tests/repeat-refusal.test.ts src/runtime/llm/decision-handlers/tests/refusal-way-out.test.ts src/runtime/flow-authoring/bootstrap/tests/evidence-loop-steps.test.ts src/runtime/flow-authoring/bootstrap/authoring/tests/draft-routing.test.ts --maxWorkers=1 --minWorkers=1 --fileParallelism=false` -> 16 files, 281/281 tests passed, 67.68 seconds.
- Validation: `node scripts/structure-audit.mjs` -> passed (563 warnings, 909 baselined). `pnpm --filter fluxiq check` -> exit 0, rebuilt changed package inputs in 87,253 ms; no live/full-sweep acceptance claimed.
- Outcome: Accepted by lead narrow checks; paired integration follows.
- Follow-up: finish paired task after remaining gate; P5 replay continuity follows.


### 2026-11-22 - Judge integrated and next lanes dispatched
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
