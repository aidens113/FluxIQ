# MVP Week 2 Automation Loop Plan (Core share)

Status: Active
Status detail: Executing 2026-09-20. The downstream live-first campaign has proved the created-Flow runtime path; Core's empty-result verification fix is ready to integrate.
Created: 2026-09-15
Last updated: 2026-09-20
Owner: Senior supervisor agent
Scope: Core's share of the downstream MVP Week 2 automation loop (Phases 2.1-2.9): the runtime recovery coordinator, recovery context, deterministic diagnosis gate, recovery plan and trace, bounded runtime exploration, the recovery verdict, adaptation reduction, confidence tiers, persistence, resume, per-attempt adaptation provenance, and a test-only scripted provider for the Testing Lab.
Paired document: `F:\!FluxIQWebExtension\docs\working\mvp-week2-automation-loop-plan.md`
Related: [automation studio](../architecture/automation-studio.md), [code structure](../architecture/code-structure.md), [package boundaries](../architecture/package-boundaries.md), [data extraction plan](./first-class-data-extraction-plan.md)

---

## Current State

**Update, 2026-09-20:** the 2026-09-15 snapshot below is historical and the
paired downstream document is authoritative for current sequencing. Phases
2.1-2.8 have substantial landed implementation. In paired task t024, live
schedule-post creation exposed an empty dataset shell entering provider
resolution and hanging after successful 9/9 playback. Core now settles runs
with zero stored rows before provider resolution: zero stored and zero refused
records become `no_result`, while all-refused output remains a deterministic
failure. Downstream live run `run-muabdpmu-6c1f639d` returned normally and
persisted the outcome; `pnpm --filter fluxiq build` passed after all temporary
tracing was removed.

Paired task t026 adds an optional `targetsUnchanged` member to a domain tool
execution result. Core validates and preserves the boolean while remaining
compatible with domains that omit it. The downstream authoring runtime has
already proved the signal live in Chromium: opening a modal returned false,
then four form entries returned true. The field is the stop/continue seam for
the next optional multi-action exploration task; t026 integration gates are
still pending.

**Phase, as of 2026-09-15: the user reshaped the plan as L12-L16, approved the
five defect fixes, and instructed that they be planned and not started; no Core
code changed for the loop.** The downstream document owns the plan, decisions,
phases, and sequencing, and now carries L12-L16 plus three investigation
reports. Path prefix: `AS/` is `packages/fluxiq/src/programs/automation-studio/`.

**The user's direction, one line each; the full text is in the downstream
document.** L12: **one improvement loop with three entry points** — building a
new flow, a run failing, an edge case — not a recovery loop. L13: the model may
propose **anything a person can do to a flow**, used freely, with approval mode
gating *applying* a proposal rather than producing one. L14: exploration is a
**Core framework capability** with a registry of harness options an imported
domain extends. L15: a fixed stage order owned by Core, with stage instructions
a domain may extend or wholly override. L16: **the PIN guards destruction, not
authorship** — most writes lose it, deletes and destructive actions keep it,
enforced by an exhaustive classification and a test that fails on an
unclassified endpoint.

**What is true in Core today, corrected by the investigations:**
- The one runtime LLM caller, `maybeAnnotateRunDetailWithRuntimeLlm`
  (`AS/runtime/service.ts:2865-3169`), sends instructions, recent actions, a
  3,000-byte failure snapshot, and policy; the packet's other slots are never
  filled.
- **The loop L14 asks for already exists and is already domain-neutral**
  (`AS/runtime/llm/evidence-loop.ts`). Missing are a registry, any Core-owned
  neutral harness options — Core ships **zero**, every tool today comes from the
  downstream repository — and the other entry points:
  `execution-grants.ts:493-511` explicitly forbids the loop to a recovery run.
- **The repair target is a CSS selector**,
  `AutomationStudioRuntimeTargetOverrideTarget = { selector: string }`
  (`structured-response.ts:14-16`), hard-required at five Core sites including
  the JSON schema and the provider prompt. This blocks L14, so decision L2 is a
  **prerequisite**, not a preference.
- `runtimePatchRestoredExpectedState` (`live-patch.ts:324-330`) has **two**
  vacuous-true paths, not one — `!comparison` and `[].every()` on an empty
  expectation. Proved by executing Core's own code in a scratch copy.
- `applyRuntimePatchToFlow` has **no branch at all** for
  `temporary_action_sequence`, so a validation rerun executes the *unmodified*
  flow; `temporary_recovery_subflow_call` has the same hole.
- `decideAutomationStudioLlmInvocationGate` (`training-modes.ts:271-282`)
  implements L5 correctly, is tested, and has **zero production callers**.
- **Two earlier claims in this document were wrong.** A never-executed proposal
  does **not** auto-apply — `training-modes.ts:310` refuses high risk; the harm
  is that the fabricated success is indistinguishable from a verified one to a
  reviewer. And `failureSignature` being unwritten is **not** why matching
  fails: `conversions.ts:143` passes no adaptations at all, so the match set is
  always empty, and writing the signature alone would change nothing.
- The retry after an auto-applied patch reruns from the graph's start
  (`service.ts:3260-3343`) and is unreachable in the shipped app.
- Attempts carry no adaptation id; no scripted provider exists for the Lab.

**Done:** this document; the three investigations, whose reports live beside the
downstream document.

**Not done:** every Core step below. Nothing is started, by instruction.

**Next steps:** Phase D — the five fixes in the order **1 → 3 → 2 → 5 → 4**.
Fixes 1-3 all edit `live-patch.ts` and are serial for one worker; 4 and 5 must
come **last**, or the loop will begin skipping the model on the strength of the
unverified `validated` records that 1-3 fabricate. Then the PIN
reclassification, then L2's target contract as L14's prerequisite.

**Blockers:** none. The user approved the fixes and asked that nothing be built
until he says go.

---

## Core steps by phase

Decisions are the downstream document's L1-L11. Files and tests are in the
downstream scoping reports.

| Phase | Core work | Key files |
| --- | --- | --- |
| D | Recovery verdict replacing `runtimePatchRestoredExpectedState`, with a node-definition expected transition; structural validation not counted as success; the apply gate refuses inert `edit_recovery`; each with a failing test first | `AS/runtime/recovery/recovery-verdict.ts` (new), `live-patch.ts`, `executor/expected-transition.ts`, `service.ts:5632-5654`, `storage/project/adaptation-store.ts:161` |
| R0 | Move the runtime LLM annotation into `AS/runtime/recovery/runtime-recovery-coordinator.ts`, no behaviour change | `service.ts:2865-3169` |
| 2.1 | `recoveryContext` builder and packet slot with counts-only `contextSummary` | `recovery/recovery-context.ts` (new), `llm/harness/context-packet.ts`, `task-request.ts`, `intervention.ts` |
| 2.2 | Deterministic diagnosis gate; structured diagnosis; recovery plan; `recoveryTrace`; run detail stages in the web UI | `recovery/{diagnosis,recovery-plan,recovery-trace}.ts` (new), `llm/harness/structured-response.ts`, `provider-result.ts`, `deepseek-provider.ts`, `apps/web/src/features/automation-studio/runtime/run-detail-model.ts` |
| 2.3 | Closed exploration outcomes; exploration budget with wall clock and domain-enforced scope policy; runtime exploration loop; task kind; recovery grant purpose | `recovery/{exploration-outcome,exploration-budget,runtime-exploration}.ts` (new), `llm/harness/task-kind.ts`, `llm/execution-grants.ts`, `docs/architecture/automation-studio.md` |
| 2.4 | The full verdict with records completeness, required evidence, and continuation | `recovery/recovery-verdict.ts` |
| 2.5 | `observedState`, `expectedState`, `failureSignature` on adaptations; exploration reduction; durable deterministic-path patch; opaque domain-owned target (L2) | `live-patch.ts`, `runtime/exploration-reduction/` (new), `model/flow-adaptation.ts`, `service/adaptations/patches.ts`, `storage/project/adaptation-store.ts`, `model/validation/adaptation.ts`, `llm/harness/structured-response.ts` |
| 2.6 | Validation kinds and confidence tier; provisional replay promotion | `runtime/adaptation-confidence.ts` (new), `service/adaptations/provisional.ts` (new), a new migration |
| 2.7 | Persisted confidence, signature, and evidence columns | `storage/project/adaptation-store.ts`, a new migration |
| 2.8 | Resume from the failed node with an input-state check; in-run use on the explicit-grant lane (L9) | `service/adaptations/resume.ts` (new), `service.ts` call sites `:3540-3547,3594-3600` |
| 2.9 | Test-only scripted provider for Lab hosts; per-attempt adaptation provenance | a `testing/` directory beside `runtime/llm/`, `executor/attempt-trace.ts`, `service/summaries/conversions.ts` |

Serial files: `service.ts` (extraction K4c.1-2, R0, 2.1, 2.2-2.4 integration,
2.8); the LLM harness contract files (2.1, 2.2, 2.3, 2.5); `model/flow-adaptation.ts`
and `adaptation-store.ts` (2.5, 2.6, 2.7, 2.9); `live-patch.ts` (D, 2.5, 2.6).

## Validation

Each step's tests and mutation targets as the downstream reports name them,
run with `--no-file-parallelism`; `pnpm check`, `pnpm test`, `pnpm docs:check`,
`pnpm build`, `pnpm package:validate` one at a time; Lab proofs downstream.
Authorization changes (L6, L9) update `docs/architecture/automation-studio.md`
in the same work, and observable behaviour changes carry a Migration Notes
entry.

## Worker Briefs

None yet; downstream scoping briefs are in the paired document.

## Work Ledger

### 2026-09-20 — Empty action results settle without a provider
- Agent: supervisor with downstream t024 live worker.
- Changed: result verification uses total stored rows, not dataset-shell count,
  to select its provider-free path; `no_result` requires zero stored and zero
  refused rows, preserving the all-refused failure.
- Validation: downstream live schedule-post run `run-muabdpmu-6c1f639d`
  returned normally after 9 actions and persisted `no_result`; Core package
  build passed after diagnostic tracing was removed.
- Outcome: Accepted for paired integration.

### 2026-09-15 — Core share of the loop plan recorded
- Agent: downstream supervisor; downstream workers `w2-scope-context-recovery`,
  `w2-scope-repair-reuse`
- Changed: this document
- Why: most Week 2 loop work is Core's, and cross-repository plans are paired
- Validation: not validated; planning document only
- Outcome: Accepted
- Follow-up: the user's review of the downstream plan

## Open Questions

None beyond the downstream document's.
