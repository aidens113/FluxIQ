# t588 returns-and-amend: worker report

## Outcome

Partial. Item 1 (returns give the cause) and item 2 (returns carry receipt refs) are done. In item 3, the `predecessor_not_done` issue now names the subflow and says why. Two parts of item 3 are not done, because they cannot be done correctly inside this brief's ownership:

- **Keeping unchanged subflows' proposals across an amendment.** The plan digest is part of each proposal's identity, and two places that this brief does not own refuse a proposal from an earlier plan. Making `state.latestDone()` keep such proposals would let dispatches through, and then the builders would fail. Details are under "Open questions".
- **Saying in the amend's answer which proposals were kept and which dropped.** That answer is built in `supervisor/plan-tool.ts`, which this brief does not own. A one-line hook for it now exists (`state.doneUnderEarlierPlans()`).

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/project-agents/`.

- `dispatch/ending.ts` (C1)
  - When a loop returns failed, `stopReason` now adds three things after the loop code:
    - an invalid configuration's check, its figures and its sentence (t584's `configuration`);
    - the guard's codes (`exhaustion.lastIssueCodes`);
    - the calls the loop stopped on.
  - When the builder throws one of Core's own `AutomationStudioFlowBootstrapGenerationError`s (the bigbox case, read with `parseAutomationStudioFlowBootstrapGenerationError`), `thrown` now adds the diagnostic's `issueCodes` as the guard and its `evidenceLoop.steps` as the calls.
  - How the calls are listed:
    - the last 8 answered calls, latest first;
    - each by tool, node, result code and reason;
    - a run of the same answer is said once, with "(N in a row)";
    - only values matching `/^[a-z0-9_.:-]{1,120}$/i` are said, so a tool name the model made up falls back to the decision kind and no model text gets out.
  - Any other throw keeps its wording. The reset path shares `stopReason`, so it gains the same wording.
- `supervisor/dispatch-tool.ts` (C2)
  - The compact return's `trials` is now a list of `{kind, receiptId, digest}` refs instead of a count, so a repair brief can name one as its `failingReceipt`.
  - `dispatch-order` is now also passed `state.doneUnderEarlierPlans()`.
- `supervisor/state.ts` (C4): new `doneUnderEarlierPlans(): Set<string>`. It returns the subflows that have a done build or repair return with a proposal only under a plan other than the one in force, which is what an amendment left with nothing.
- `supervisor/dispatch-order.ts` (C4)
  - New exported type `AutomationStudioProjectSupervisorPredecessorIssue`, which is `{code, path}` plus `predecessor` and `why`.
  - A third parameter `earlier` (default empty).
  - Each refused predecessor names its subflow, with one of three reasons:
    - it was dropped by the amendment;
    - it has no done proposal and no brief in the call builds it;
    - its brief in the call is a reset.
  - Each reason ends with the move to make: send a build or repair brief for it first, or in the same call.
  - The cycle result is unchanged.
- Tests:
  - `dispatch/tests/brief-return-reason.test.ts`: 3 new tests (configuration named; guard and calls run counted, with a made-up tool name filtered; a thrown GenerationError named, and a plain Error unchanged). The `outcome` helper also gained an optional `failed` field.
  - `supervisor/tests/dispatch-order.test.ts`: updated the exact-issue expectation and added an amendment-dropped test.
  - New `supervisor/tests/amend-dispatch.test.ts`, run through the supervisor loop on a stub provider:
    - a return lists its receipt ref;
    - after `amend_plan`, a brief waiting on the earlier-plan subflow is refused, naming it and the amendment;
    - a predecessor that was never built is named with its own reason;
    - nothing more is dispatched after the refusals.

## Commands run and observed results

All were run in `packages/fluxiq` of the Core worktree unless noted. Nothing was run that could reach a model provider.

- `npx vitest run .../dispatch/tests/brief-return-reason.test.ts .../supervisor/tests/dispatch-order.test.ts .../supervisor/tests/amend-dispatch.test.ts`: `Test Files 3 passed (3)`, `Tests 12 passed (12)`.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`: `Test Files 36 passed (36)`, `Tests 238 passed (238)`.
- `npx tsc --noEmit -p .`: no output, `TSC_EXIT=0`.
- `node scripts/structure-audit.mjs` (repository root): `structure-audit: passed (356 warning(s), 1156 baselined).` This is the same warning count t584 reported.

## Not verified

- I did not check a live run or a real builder's stored trace, so I have not seen the exact wording a real `not_at_start_location` stall produces. The tests use trace and diagnostic shapes built from the types.
- The supervisor guidance (`guidance.ts`, not owned) still describes `failingReceipt` and `predecessorNotDone` in the old terms, and `tools.ts:64` still gives `failingReceipt` as `{type: "object"}`.

## Open questions or contradictions found

1. **Keeping proposals across an amendment needs files outside this brief.** A proposal is bound to its plan digest in:
   - `service/project-build/entry-preparation.ts:64-65`, which refuses `project.entry_predecessor_stale` when `proposal.scope.planDigest !== scope.planDigest`;
   - `supervisor/assembly.ts:74`, which refuses `project.assemble_proposal_stale`;
   - the proposal's own digest (`flow-bootstrap/subflow-candidate/subflow-digest.ts:13,29`) and the trial identity (`subflow-trial-gate.ts:183-199`, `verification/detached-subflow.ts:291-301`).

   If `latestDone()` kept them, the dispatch would pass and the successor's builder would then come back "entry never prepared (stale)" after spending money. That is worse than today's refusal, so I did not do it. To do it properly:
   - **(a)** In `state.ts`, keep a done proposal when the old and new plans give its subflow the same key, parts (`partOf`), interface and `after` chain. Compare `structure.plan.subflows[...]` and `partOf` between the record's consecutive plans; `load` would need the record's earlier plans, not only `plans.at(-1)`.
   - **(b)** Relax the plan-digest check in `entry-preparation.ts` and `assembly.ts` to "an earlier plan of this build under which the subflow is unchanged". The supervisor would pass the kept set, or a per-subflow plan digest.
   - **(c)** Make sure the detached trial and the proposal digest still verify. They carry the old plan digest, which stays self-consistent, so they probably need no change. Not checked.
2. **The amend's answer is in `supervisor/plan-tool.ts` (not owned).** The change for it: after `state.structure = read.structure;`, add `...(mode === "amend" && dropped.size ? { proposalsDropped: [...dropped] } : {})` to the answer, where `const dropped = state.doneUnderEarlierPlans();`. Once (1) lands, also add `proposalsKept`. `GUIDANCE.next.afterPlan` could then say to resend the dropped subflows first.
3. **One exported thing per file.** `dispatch-order.ts` now exports its issue type beside its function. The audit passed, but if the convention is strict for types, move the type to its own file.
