# Simulated-environment continuation intake

## Finding

The stopped lane is `feat/fluxnode-sims` at `68161d1f496a3102ce6c19f8945c16a7a6fb512a` (`WIP: stopped mid-round because usage ran out ...; unvalidated`). The working tree is clean. P8a's generic binding is already in its parent commit `72becab` and is described in `reports/sim-bindings.md`; do not redo it. The WIP delta since that baseline is 77 binding-package files, +2,848/-24 lines. This inventory is not a validation of that WIP.

The P8 plan's completion target remains a provider-free explore, zero-call replay, and repair after perturbation for each simulated environment, with P11 examples. The plan's current-state P8 row still records P8a only. In the plan's report directory, `sim-bindings.md` is the only P8 binding continuation report; there is no newer lane report to substantiate replay/repair/data-read acceptance. It explicitly says those were not proved.

## Existing work and dependencies

- The WIP already adds `src/read/` row extraction and output-recording modules, an evidence read tool, and the Linux `largest-files` read FluxNode. `src/fluxnode/linux/tests/largest-files-fluxnode.test.ts` describes and asserts an exploring run, a second-input replay with no requests/cost, and repair after `linux.updates-dialog`; its task oracle checks each result. `examples/linux-read/tests/run-linux-read-fluxnode.test.ts` runs the example as a subprocess and asserts explore/replay/repair results and oracle acceptance. These are source claims only; neither test was run in this intake.
- The smallest independent P8 continuation is to validate and finish the Linux read-only path once the Core result-to-read lineage seam owned by t905 is available. Keep ownership to `packages/fluxiq-binding/src/read/**`, `src/evidence/read.ts` and its test, `src/fluxnode/linux/{largest-files-node.ts,largest-files-scripts.ts,tests/largest-files-fluxnode.test.ts}`, and `examples/linux-read/**`. Do not alter shared sim-kit contracts or other environments. Confirm the stable Core interface with the lead before dispatch; t905 is unfinished in the plan, and read-derived outputs need that interface.
- Existing action-based acceptance is not independently clear to fix here: Android send-message and Linux append-line mark replay/repair TODO for Core t909's run-level lasting-act carry (`attempt.act_already_done`); Windows display-scale marks replay TODO for input-bound lasting acts being skipped and instruction-authority calls preventing zero-call replay, and repair TODO because forward continuation after a failed saved step is unavailable (`core.run_flow` without `draft.replay`). Do not weaken these assertions or patch around the Core causes in this repository. They need the respective Core fix/interface before those environment acceptance items can close.
- P2c's one-domain-per-engine limitation is recorded in the P8a report, but does not block independent per-environment runs. No t905/t902 private or runtime state was accessed.

## Exact narrow checks for the proposed Linux read-only unit

Not run during this read-only intake. After the Core read-lineage seam is stable, run from `C:/Users/osrs_/FluxStuff/!FluxIQTestEnvironments`:

1. `node --test packages/fluxiq-binding/src/read/tests/*.test.ts packages/fluxiq-binding/src/evidence/tests/read.test.ts packages/fluxiq-binding/src/fluxnode/linux/tests/largest-files-fluxnode.test.ts`
2. `node --test packages/fluxiq-binding/examples/linux-read/tests/run-linux-read-fluxnode.test.ts`
3. `pnpm --filter @fluxiq-test-env/fluxiq-binding typecheck`

Acceptance is the existing test contract: all list rows are read from the observation, typed outputs trace to those rows and pass the task oracle, replay is the saved Flow on another folder with zero model requests/cost, and a simulated updates dialog is repaired with an achieved oracle-passing result. If a check fails, trace the Core contract or binding cause; do not change the task oracle to accept it.

## Return contract

Outcome: Done
Changed: `C:/Users/osrs_/FluxStuff/!FluxIQ/docs/working/fluxnode-plan/reports/codex-sim-continuation-intake.md`
Validation: No checks run (read-only discovery brief).
Not verified: No WIP test, typecheck, build, browser, provider, or runtime behavior was executed; all WIP test descriptions remain claims until the lead runs the checks.
Report: `C:/Users/osrs_/FluxStuff/!FluxIQ/docs/working/fluxnode-plan/reports/codex-sim-continuation-intake.md`
Notes: Branch/head `feat/fluxnode-sims` / `68161d1`; prior report `reports/sim-bindings.md`; recommended next ownership is the Linux read-only binding/example paths above, after t905's read-lineage contract is stable..

