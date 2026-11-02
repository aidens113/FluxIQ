# Observe actual host expectation and fact calls

Outcome: Done. The four released production seams and two immediate test/support files are frozen. All worker processes ended; explicit last-guard completion was sent to the lead. Source/kernel algorithms, presence guard, purity registries, configuration/service/cohort, native act proof, C's reset/metadata/classifier and B's producer owners were not edited.

## Applied four-file cut

- `engine/automation/transitions/comparison.ts`: the effect check pins the original host and its original evaluator before observation awaits, then calls it through `invokeAutomationCallback`. Its four arguments retain the original conditions array, mode, timeout and context, including the existing string stateRef. No freshly generated forwarding closure is credentialed.
- `engine/automation/recovery/run.ts`: readiness observes the original host method directly through the same Core wrapper. State/evaluator absence, deadline calculation, clock, signal, return shape, existing catch/error message and readiness outcome remain intact. The separate availability helper elsewhere in this file is unchanged.
- `engine/automation/step-loop/{entry,success-check}.ts`: both real fact observations now pass `automationCallbackObservation(ctx.options)` to the existing helper's private second parameter. Host implementations still receive only their original conditions/context tuple; no observer fields or arguments were added.
- Broad presence-based unverified marking remains. No callback is trusted from its property/name/status, and no page expectation or fact answer becomes a native act-completion witness. Actual unsupported returns remain usable as public read results while their coverage stays unverified; unsupported throw/abort/late history remains pending.

## Reproduction and direct evidence

- New `engine/automation/tests/observed-host.ts` captures canonical callback configuration before creating/configuring the real engine Source, applies only its manage-only registrar before registration/first reserve, and deliberately opens the fixture scope as unverified. It changes no production scope default.
- New `host-observation.test.ts`: 17 cases cover original private receiver and unchanged tuple; original callback pinning before an actual held entry await; real entry before invocation; unsupported first verdict retained without closure; an actual fixture-side change then throw refusing a second invocation; declared no-direct read retry after throw; late answer after actual reservation abort staying pending; no-state/no-host absence producing no receipt; both actual entry/success fact callbacks; unsupported fact results retained without completion; and empty condition batches invoking no host.
- Before production edits: exact new subject -> 13 failed/4 passed, 8.84s. The detached effect evaluator lost its private receiver; readiness bypassed Source and repeated after throw/abort; both fact paths lacked the callback descendant. Log `.fluxiq/refactor/host-callback-observation-before.log`.
- First after-run -> 16 passed/1 failed, 8.08s. The remaining issue was only the new tuple fixture: unchanged `currentStateRef` returns a string, while the fixture expected the full snapshot-ref object. Corrected that new expectation to the actual original string; production argument behavior was preserved. Log `.fluxiq/refactor/host-callback-observation-after.log`.

## Exact focused acceptance

From Core repository root:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/tests/host-observation.test.ts src/engine/automation/tests/transition-comparison.test.ts src/engine/automation/tests/recovery-ladder.test.ts src/engine/automation/tests/effect-check/tests/host-act-landed.test.ts src/engine/automation/tests/effect-check/tests/expected-facts.test.ts src/engine/automation/tests/effect-check/tests/required-outcome.test.ts src/engine/automation/tests/effect-check/tests/uncertain-act.test.ts src/engine/automation/node-execution/tests/recorded-effect.test.ts src/engine/automation/node-execution/tests/action-effect-frames.test.ts src/engine/automation/step-loop/tests/lifecycle-plumbing.test.ts src/programs/automation-studio/runtime/executor/lifecycle-run/tests/success-check.test.ts src/engine/automation/execution-admission/tests/producers.test.ts --maxWorkers 2 --minWorkers 1
```

Observed exit 0: 12 files / 92 tests passed, 31.97s. This includes unchanged required-outcome/unknown-act/effect-fact/node/producer/lifecycle oracles. Log `.fluxiq/refactor/host-callback-observation-final.log`.

Static checking then found only new-test issues: the wrong type barrel for NodeAttemptTrace, a missing generic registrar parameter annotation, and direct-file imports instead of existing barrels. Fixed those test/support imports/annotation; production files did not change. Final affected owner command:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/tests/host-observation.test.ts --maxWorkers 1 --minWorkers 1
```

Observed exit 0: 17/17, 14.09s. Log `.fluxiq/refactor/host-callback-observation-owner-final.log`. The remaining 75 tests' subjects and all four production files were unchanged after the 92-case run; the lead explicitly requested no repeat92.

- `node --max-old-space-size=4096 .fluxiq/refactor/host-callback-observation-types.cjs` -> final exit 0: strict source-closed NodeNext, 7 owned/actual-Service consumer roots, full 4,616-module source closure, 0 errors, 0 own built-output edges. An intermediate read caught Root's in-flight service tool-observer argument mismatch; the lead completed its separately owned integration, then this strict read passed. No external file was fixed by this worker.
- `node .fluxiq/refactor/host-callback-observation-structure.mjs` -> exit 0: 6 owned files, 0 failures, 1 advisory, 0 unchanged-baseline findings. Advisory is existing comparison module size (442 lines versus 400 advisory); no hard-budget, baseline or configuration changes. Includes scoped repository rules, barrels and whitespace/EOF/BOM checks.

Changed source: exactly the four named leaves; new adjacent `engine/automation/tests/{host-observation.test.ts,observed-host.ts}`; this report. Ignored validation scripts/logs hold the exact static commands/results. No new parent/package exports.

Not verified: lead independent acceptance, remaining callback gaps from the earlier read-only inventory, real downstream/host/native integration, package builds/checks, full suites, browser/provider behavior. These tests use isolated in-memory admission persistence with the actual canonical engine/Source; they do not claim new live SQL/browser/native acceptance. No user data, git, provider, browser, panel, baseline/config or shared-document operations occurred. No further owned guards or edits are planned.
