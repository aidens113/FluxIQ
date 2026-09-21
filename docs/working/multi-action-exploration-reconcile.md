# Optional Multi-Action Exploration Reconciliation

Status: Active
Status detail: Strict contract and shared transition pass behind default one; permission visibility and ordered state integration are active before production opt-in.
Created: 2026-09-20
Last updated: 2026-09-20
Owner: Senior supervisor agent
Scope: Own the domain-neutral ordered multi-action evidence-decision, state-window, per-action permission, refusal, and accounting contracts for optional exploration batching.
Paired document: `F:\fxwork\t033\!FluxIQWebExtension\docs\working\multi-action-exploration-reconcile.md`
Related: [LLM-assisted deterministic automation expansion](./llm-assisted-deterministic-automation-expansion-plan.md)

---

## Current State

The stale t021 Core prototype allowed one evidence decision to contain an
ordered action list, but its live run never completed a second action in any
batch and created no Flow. The branch is substantially behind current `dev`
and its uncommitted diff must not be merged.

Current Core owns the generic decision shape, ordered reduction, evidence
window, per-action permission/refusal, accounting, and compatibility parsing.
The downstream web repository owns concrete browser tools, field entry, and
truthful `targetsUnchanged`. The completed downstream reconciliation rejected
mechanical porting of all stale integration and retained only the generic
singleton-or-ordered-list concept. Current permission observation, eligible
tools, evidence windows, state recording, usage, and diagnostics remain the
owners that later slices must preserve.

**Done:** fresh paired t033 worktree built from current Core `dev`; all 21
prototype files mapped to port/drop/rewrite; strict schema/parser controls and
one test-only feature value now drive authenticated schema plus a shared
singleton/list transition with atomic preflight, ordered actions, collision-safe
IDs, one-use provider accounting, and conservative target-stability stops.
Focused slice-2 proof passes 101 tests plus Core check/build. Production still
defaults to one and no caller opts in.

**Next:** make model-visible evidence explicit at the permission gate and prove
per-action permission termination plus ordered same-iteration recovery state
records/reduction. Diagnostics/limits/caller opt-in remain slice 4.

**Blockers:** provider execution remains blocked until permission/state and
diagnostics/caller slices pass review.

## Worker Briefs

### Brief: w2-multi-action-contract-slice
- Repository: paired t033 worktrees; product edits in Core only, report downstream.
- Task: implement slice 1 from the downstream `w2-multi-action-current-map.md`: strict canonical `tool_calls` decision surface and explicit effective max-actions-per-decision defaulting to one, with no executor behavior change.
- Required reads: this Current State; downstream current-map sections `File-by-file disposition`, `Collision and regression risks`, and slice 1; current direct counterparts named there.
- Owns Core: `runtime/llm/evidence-batch/` new files; `runtime/llm/harness/{provider-result,structured-response,output-validation}.ts`; `runtime/llm/index.ts`; `runtime/loop-limits/evidence-loop.ts`; their nearest focused tests only. Owns downstream report only.
- Must not touch: evidence executor/loop behavior, `service.ts`, permission gate, state recorder, downstream product source, t021, user data/port 3000, provider/browser APIs, shared `dev`, or other reports.
- Required contract: lists are 2-16; each item uses the same tool-specific closed input schema; unknown/ineligible/invalid later items reject the whole decision before execution; max=1 omits list schema and rejects list responses; metadata summaries expose kind/count/tool IDs only, never inputs.
- Definition of done: focused schema/parser/validation tests pass; current singleton fixtures remain behaviorally unchanged; no production path can execute a list yet; diff and report identify the exact seam for slice 2.
- Report to: downstream `docs/working/multi-action-exploration-reconcile/reports/w2-multi-action-contract-slice.md`

### Brief: w2-multi-action-transition-slice
- Repository: paired t033 worktrees; Core product/tests only, downstream unique report only.
- Task: implement slice 2: one feature-control value wires decision schema, DeepSeek schema authentication, provider parsing, and singleton/list execution through one shared current action transition; default remains one.
- Required reads: Current State; downstream contract-slice `Exact slice-2 seam`; current-map `Ordered actions, evidence, and state`, `Collision and regression risks`, and slice 2; current direct owners.
- Owns Core: `runtime/llm/evidence-loop.ts`; `runtime/llm/evidence-batch/`; `runtime/llm/harness/{run,task-request,provider-result,output-validation}.ts` only as needed; `runtime/llm/deepseek-provider.ts`; loop-limit wiring; nearest focused tests. Downstream owns report only.
- Must not touch: `service.ts`, permission gate, recovery/state recorder/reduction, Flow Bootstrap caller opt-in, downstream product source, t021, provider/browser/user state, shared `dev`, git history.
- Atomic preflight: whole list against exact eligible tools, tool inputs, repeat constraints, action/evidence budgets, and bound before action 1; invalid later item executes none.
- Ordered execution: Core assigns unique call IDs; every item uses the shared singleton transition/accounting; provider usage once; stop on refusal/failure, non-applied mutation, or missing/false `targetsUnchanged`; observations may continue.
- Feature gate: default one emits/accepts/executes no list and preserves singleton behavior; explicit test-level >1 exposes all gates together; no production caller opts in.
- Definition of done: focused default/atomic/order/ID/usage/budget/repeat/stability tests and package check/build; no live/provider call.
- Report to: downstream `docs/working/multi-action-exploration-reconcile/reports/w2-multi-action-transition-slice.md`

---

## Work Ledger

### 2026-09-20 — Reconciliation boundary established
- Agent: supervisor
- Changed: paired working document only.
- Why: keep generic one-or-many decision semantics in Core while leaving browser actions/evidence downstream.
- Validation: current Core production packages built during paired t033 setup.
- Outcome: Partial
- Follow-up: downstream-owned read-only map.

---

## Open Questions

- What is the minimal compatibility representation that keeps one-action decisions unchanged while permitting an ordered list? Owner: senior supervisor after the reconciliation report.
