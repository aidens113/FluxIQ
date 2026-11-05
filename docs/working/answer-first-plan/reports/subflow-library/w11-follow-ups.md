# w11 follow-ups: five open defects in the library's repair and trust code

## Outcome
Done. All five fixed, each tested through the real service with the repair-isolation fixture. Nothing committed.

## What changed and why
Paths are under `packages/fluxiq/src`.

1. **A version that passed serves the run again.** `project-parts/repair/newer-versions.ts`: `candidates` now skips only versions that failed in this run (`failedHere`, added in `failed`). `taken` no longer retires a version. **Test edited:** "a run tries a version once: a second step ... is not given it again" pinned the old reading (presses `go, works, go`, run failed, model asked). It is replaced by "a version that passed in this run serves a second step ... at no model call" (presses `go, works, go, works`, no requests, both steps move to v2). A new test keeps the other half: a version that failed in the run is not tried again.
2. **A version's last verdict decides the offer.** New `runtime/project-parts/trust/last-verdict.ts` (`lastAutomationStudioPartVerdict`: newest confirmed or refuted entry wins, a tie reads as a failure). `stores.ts` gets `verdictOf`, sharing `evidenceOf` with `cardOf`. `newer-versions.ts` and `run-facts.ts` (what `get` tells callers) now test `verdictOf !== "failed"` in place of `counts.failures === 0`. The failure count on the card is unchanged.
3. **An unreachable judge is not a failure.** `refuted-trial.ts` records a failure only when the run's own `resultVerification` is a real no, meaning `performed`, `verdict: does_not_answer` and basis `model` or `core_observation` (`automationStudioRecordedVerdictIsNo`, in `runtime/result-verification/run-record.ts`). `AutomationStudioProjectParts.refutedTrial` reads the run's session for it, so `judged-promotion` and its decision are untouched. An unreadable session records nothing.
4. **A pinned version earns trust from a judged run, revision or not.**
   - `parts/migration.ts`: nullable `judged` column on `project_part_runs` (`'yes'`/`'no'`), edited in place, id unchanged. `types.ts`, `rows.ts` and `store.ts` carry it.
   - `engine/automation/frames/newer-part.ts`: `automationStudioPinsRanAsSaved(trace)` lists the pinned frames the run ran as saved. A pin is excluded if it, or a frame inside it, held, dropped or replaced a fix, or if a part-level repair named it.
   - `run-record.ts`: at the verdict, a yes or a real no hands those pins to the port as `pinnedRan: { judged, versions }`. `run-outcome.ts` has the port type only.
   - `flow-graph-judgements.ts` writes one run row per pin (`succeeded` or `failed`, `modelCalls` 0 when the run asked no model, else 1). The existing judgement-row write is unchanged.
   - `trust/evidence.ts`: judged yes is confirmed, judged no is refuted, and a yes at zero model calls is also a replay.
   - `stores.ts` `evidenceOf`: a judged run row is skipped when a judgement row of the same run is read for the version, so nothing is counted twice.
   - `service.ts`: one existing line's annotation, with the line count still 4304.
5. **No model for a pinned call that stopped safely.** `newer-part.ts` gets `automationStudioPinnedCallStoppedSafely`, which reads the call attempt's own child trace for a permission category or `executor.target.gone`, pinned calls only. `early-refusal.ts` refuses the detached recovery with gate code `llm.gate.stopped_safely`. The call step's failure and its other readers are unchanged. `engine/automation/step-loop/incident-repair.ts` still has its own private copy of the same check (not owned, not touched).

Also: `frames/index.ts` got the new exports (not on the owned list, one line). `tests/repair-isolation-fixture.ts`: the judge's "no" was not a real no. The fixture sent a bare `answersRequest: "no"` with no defects, so the run recorded `unsure` / `model_unavailable`, and the old "refuted" tests only passed because failure was recorded for any non-answer. "no" now sends one defect Core can find (`act_missing`), which gives `does_not_answer` / basis `model`. `unknown` (the judge throws) is the unreachable case.

New tests, all in the repair-isolation file unless noted:
- last verdict (failure retires, a later success offers again, `get` agrees);
- unreachable judge (`failures: 0`, still offered);
- a kept lasting part with no revision goes `unproven` to `provisional` after one judged run and is then in `shortlist`;
- judged no counts against a version that ran as saved, and a fix held in it earns it nothing;
- permission gate and gone item ask no model after the run (`requests` is `[]`, `llmGate.code` is `llm.gate.stopped_safely`);
- a real broken step inside a called part still reaches repair (one `runtime_patch`);
- unit tests: `trust/tests/last-verdict.test.ts`, `recovery/annotation/tests/early-refusal.test.ts`, and a judged-run row case in the parts `store.test.ts`.

## Commands run and observed results
From `packages/fluxiq`:
```
pnpm.cmd exec vitest run src/framework/automation-service/service/project-parts src/runtime/project-parts/trust src/framework/persistence/automation/project/parts src/engine/automation/frames/tests src/runtime/result-verification/tests/zero-provider-run.test.ts src/runtime/adaptation/recovery/annotation/tests/early-refusal.test.ts src/runtime/adaptation/recovery/annotation/tests/annotate.test.ts src/runtime/adaptation/recovery/annotation/tests/permissions.test.ts --minWorkers 1 --maxWorkers 2
 Test Files  27 passed (27)
      Tests  291 passed (291)
```
The repair-isolation file alone was 42 of 42 before the last structure-only edits and is inside the 291 above.

From the Core root:
```
pnpm.cmd --filter fluxiq check          -> {"build-cache":"build","step":"fluxiq:check",...,"ms":91637,"source":"command"} (no tsc errors printed)
node scripts/structure-audit.mjs        -> structure-audit: passed (511 warning(s), 1097 baselined).
pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build
  contracts: reuse ... Done; fluxiq: build ... "ms":202653 Done; client-gateway-websocket: reuse ... Done; ui-components: build ... Done
```
The audit failed twice on the way and was fixed: an import cycle (I had imported the result-verification barrel from `refuted-trial.ts`; it now imports `run-record.ts` directly), then `as never`, `failure-as-empty` and `swallowed-failure` findings in my own code.

## Not verified
- No browser, Lab, provider or paid call. The detached-recovery fix (5) is proved through the fixture's mock models, not a live run.
- Part-level replace and nested pins in `automationStudioPinsRanAsSaved` are covered only by the existing fix tests (v1 earns nothing after a held fix), not by a test of each shape. A pin is excluded whenever any repair other than `none` touched its frame, which is conservative.
- `modelCalls` on a judged non-zero-model run row is a nominal 1, since the real count is not available at that point. Only zero versus non-zero is read.
- The judge-outage case is tested via a throwing judge. The old fixture "no" (unreadable reply) is the same class and is now also not recorded.
- Full package suites were not run (narrow checks only, per the brief). Tests of other directories that read `project_part_runs` rows were not run.

## Open questions or contradictions found
- Fixture "no" was an unreadable reply, not a refutation, so older assertions that relied on it passed for the wrong reason. The fixture now sends a real no.
- `incident-repair.ts` `stoppedForGoodInside` duplicates `automationStudioPinnedCallStoppedSafely`. It could import the shared one in a later change.
