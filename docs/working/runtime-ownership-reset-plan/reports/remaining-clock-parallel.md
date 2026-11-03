# Remaining clocks, retry inputs and repair/parking callbacks

Status: Nine owned source files implemented and frozen. First owner run: 125 passed / 1 identified copy-contract conflict; Root-approved reconciliation now passes all five boundary cases. Final frozen registry observation seam forwarded for lead acceptance. No composed run.

## Exact source manifest

All paths under `packages/fluxiq/src/engine/automation/`:

- `composite/boundary.ts`: guarded original parent clock closure and command-port method selection; forwards actual parent options into child bounds.
- `composite/child-bounds.ts`: observed native fallback selection, captured original command-port checks on each use, guarded clocks retained through timer/abort completion. Timestamp exceptions now reach the existing race rejection instead of becoming an ignored rejected `.then` while leaving the bound promise unresolved. Optional sixth options argument preserves existing callers.
- `composite/execution.ts`: actual children-kernel clock/port guards for normal, invalid-region/composition and cycle traces; guarded closure forwarded through child bounds.
- `resume.ts`: public resume enters an existing driver children kernel before clock/checkpoint work; original saved-state settlement and no-repeat path remain in the body.
- `node-execution/failure.ts`: diagnostic clock refusal retains its actual unknown marker, primary action fault and prior started-at timestamp rather than calling a replacement clock or masking the primary error.
- `lifecycle-run/dispatch/dispatch.ts`: guarded subflow/host/route property selection and a pinned clock preserving each original call receiver; failed-handler timestamp fallback retains the body failure and unknown marker.
- `outside-graph/retries.ts`: descriptor-safe callback selections before actual use, original retry/backend series and receiver/tuple retained, native default checked at each phase. Module registration uses descriptor-captured bootstrap native identity, never the mutable current `Date.now`.
- `step-loop/incident-repair.ts`: guarded repair/learning presence and post-await selection, original observed callback invocations on the original options receiver, guarded command/run-control methods.
- `step-loop/ask-or-park.ts`: guarded parking container/open/wait selections, observed callbacks on the original parking owner, guarded post-answer timestamp and command methods.

Shared helpers were consumed from callback_guards' frozen seam. No shared helper, SQL/bulk-proof, Flow contract, other callback source, git or shared working document was changed.

## Red evidence before fixes

First coordinated reader:

```text
pnpm.cmd exec vitest run src/engine/automation/outside-graph/tests/properties.test.ts src/engine/automation/composite/tests/clock-properties.test.ts src/engine/automation/node-execution/tests/failure-clock.test.ts --minWorkers 1 --maxWorkers 1
```

Exit 1: **13 expected failures / 1 legacy pass**, 9.77 s. Observed own/inherited retry/composite getter delegates executed; fresh reacquired dispatch getter executed; changed native cancellation clock was accepted; failure timestamps used replacement values and a clock throw masked the original action error.

Second coordinated reader, before editing repair/parking production:

```text
pnpm.cmd exec vitest run src/engine/automation/step-loop/tests/incident-repair-properties.test.ts src/engine/automation/step-loop/tests/parking-properties.test.ts --minWorkers 1 --maxWorkers 1
```

Exit 1: **6 expected failures / 2 positive passes**, 8.69 s. Own/inherited open/repair getters executed; a wait getter installed by awaited delivery ran; the next learning layer ran a getter installed by its predecessor. Original private parking receiver/tuple and unobserved presence compatibility passed.

## First owner acceptance

```text
pnpm.cmd exec vitest run src/engine/automation/outside-graph/tests src/engine/automation/composite/tests/clock-properties.test.ts src/engine/automation/composite/tests/run.test.ts src/engine/automation/composite/tests/boundary-options.test.ts src/engine/automation/node-execution/tests/failure-clock.test.ts src/engine/automation/step-loop/tests/incident-repair-properties.test.ts src/engine/automation/step-loop/tests/parking-properties.test.ts src/engine/automation/step-loop/tests/learned-interruption.test.ts src/engine/automation/tests/resume.test.ts src/engine/automation/tests/resume-properties.test.ts src/engine/automation/tests/person-needed.test.ts src/engine/automation/lifecycle-run/tests/dispatch.test.ts src/engine/automation/lifecycle-run/tests/clock-properties.test.ts --minWorkers 1 --maxWorkers 1
```

Observed exit 1: **125 passed / 1 failed** across 18 files, 33.05 s total (24.70 s collection, 500 ms tests). All new tests passed, including actual resume entry, native mutation between retry phases and after awaited answer, captured command stop getter during child wait, private parking receiver and exact tuples, and durable pending after independent reopen/no second reservation. Existing resume 21, dispatch 12, person-needed 15, retry/reacquire/effect, composite run and interruption learning passed.

Remaining failure: existing `composite/tests/boundary-options.test.ts` supplies enumerable passive cursor getters on an observed parent and requires historical getter reads. The unchanged boundary copy call now rejects them at `assertAutomationEnumerableData`, as the already-committed `copyAutomationExecutionOptions` requires. `git show HEAD:.../execution-admission/copy.ts` confirms this guard predates this unit. No clean-baseline runtime pass/fail is asserted.

Root explicitly approved reconciliation: retain observed cursor-stripping/private-authority inheritance with data properties, retain exact historical getter ordering in a separate unobserved compatibility positive, and add observed accessor refusal. The generic copier/security contract was not changed.

## Approved boundary contract reconciliation

Old fixture combined two contracts: legacy excluded-cursor getter evaluation and observed private-authority inheritance. The first guard batch already made an observed copy reject enumerable accessors, while unobserved copies retain their historical reads. The revised fixture keeps the full original start/stop order `["start", "stop", "start", "stop"]`, cursor stripping, child fields, diagnostic/retry companions and successful child assertion in an unobserved positive; the observed data positive keeps all original genuine parent/foreign authority assertions. Three actual entered-frame negatives cover `startNodeId`, `stopAfterNodeId` and `invocation` getters, with zero getter/child actions and pending after reopening/refused new reservation.

Before the boundary source correction, ran:

```text
pnpm.cmd exec vitest run src/engine/automation/composite/tests/boundary-options.test.ts --minWorkers 1 --maxWorkers 1
```

Red exit 1: **3 failed / 2 passed**, 11.28 s. Each getter ran once in the boundary's unused destructuring before the copier could reject it. The two preserved positives passed.

The owned boundary now performs that historical destructuring only on unobserved calls; observed calls reach the existing copier preflight before reading an accessor. No getter is labelled pure and no helper is weakened. Repeating the exact command -> **exit 0, 5 / 5 passed**, 9.25 s. The earlier 125 passing cases were not rerun after this isolated correction; Root's combined acceptance remains required.

`git diff --check -- <nine owned source paths>` -> exit 0. No package-wide typecheck/build/structure, whole-runtime positive, provider or browser run.

Final cross-owner integration is the exact optional observation forwarding requested after callback_guards froze its registry seam:

```typescript
await automationStudioActiveLifecycleRegistrations(run, AutomationExecutionPorts.subflowGraphs(input.options), automationCallbackObservation(input.options));
```

This retains the actual original entered caller through the registry's awaited recovery-property selection. No helper, registry, receiver or completion owner was replaced. It was applied after the focused runs; Root's combined check must cover this final line. No further reader was launched against the other worker's active Group 7/8 edits.

Root's diagnostic review found the initial failure-clock fallback also caught unobserved custom clock throws, which changed legacy error behavior. After callback_guards confirmed ownership, the narrow follow-up retains the exact original unobserved `options.now?.() ?? Date.now()` expression outside the catch. Only an actual observation enables guarded primary-fault/prior-timestamp fallback. One immediate regression asserts the unobserved getter is read once, its private receiver and empty tuple are preserved, and the exact original thrown clock error propagates. Both files are frozen; this follow-up test awaits the shared reader freeze and is not included in the earlier passing counts.

## Test/support manifest

New files under the same engine automation tree:

- `tests/observed-frame.ts`: actual registered children kernel, original observation and durable store reopen/refused-reservation checks.
- `tests/resume-properties.test.ts`.
- `composite/tests/clock-properties.test.ts`.
- Existing `composite/tests/boundary-options.test.ts`, reconciled exactly as Root approved above.
- `node-execution/tests/failure-clock.test.ts`.
- `outside-graph/tests/properties.test.ts`.
- `step-loop/tests/property-context.ts`: abbreviated passive step data only; execution observation remains the real entered engine frame.
- `step-loop/tests/incident-repair-properties.test.ts` and `parking-properties.test.ts`.
- `lifecycle-run/tests/clock-properties.test.ts`.

Outcome: Done
Changed: nine production paths, nine new test/support paths and one existing boundary fixture above; this report.
Validation: red 13/14 and 6/8 expected failures; first owner acceptance 125/126; approved boundary red 3/5 -> green 5/5.
Not verified: combined lead acceptance after the isolated correction and final forwarding line, package/structure checks or complete-runtime/browser acceptance.
Report: docs/working/runtime-ownership-reset-plan/reports/remaining-clock-parallel.md.
Notes: No active reader; all nine production files frozen. Shared helpers and previous bulk unit untouched.
