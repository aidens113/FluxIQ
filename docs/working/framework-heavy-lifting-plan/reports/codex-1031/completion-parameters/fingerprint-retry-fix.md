# Unacted target ambiguity retry correction

Status: Done. Safety follow-up implemented and frozen; updated extension and Domain owner/retry checks passed.

## Ownership and invariant

Down source: `domain/src/runtime/failure/codes.ts`; `apps/extension/src/content/action-runtime/recovery/fault.ts`, `budget.ts`, and, after the additional explicit approval, `record.ts`. `account.ts` needs no change because it joins fault words generically. Core source/tests, identity/scoring/veto/resolve-target/place, browser specs, shared docs, versions and git are not owned.

Owning tests: Domain `runtime/failure/tests/codes.test.ts`, `runtime/tests/adapter.test.ts`, `runtime/llm-evidence/node-run/retries/tests/{dispatch,lasting-act,reacquire}.test.ts`; extension `content/action-runtime/recovery/tests/{fault,budget,attempt,record}.test.ts`.

An ambiguity proven to occur before dispatch may wait for a unique fresh resolution and use Core's existing first attempt plus three retries and source-refresh rung. No candidate may be chosen while ambiguous. Permanent denials stay permanent. A possibly landed lasting act is never repeated; explicit original ambiguous effect survives every annotation and outranks an unacted code default. No attempt/time/cost budgets or public native/intent contracts change.

The added `record.ts` ownership is necessary because its old factory rebuild discarded explicit effect and retry controls when annotating recovery counts; a later uncertain or permanent terminal result after an earlier absorbed fault must not be relabelled unacted/retryable. The lead approved annotation-only copying of the original failure: the factory sanitizes only the new `actual` text. Valid original category/stage/retryable/effect controls stay exact, the original failure object is not mutated, and invalid original controls stay invalid for Core's strict parser. This avoids importing the Node-only Core barrel into browser code or creating a second contract parser/public seam.

## Implementation and exact files

- `domain/src/runtime/failure/codes.ts`: target ambiguity is retryable and explicitly unacted at target resolution, where its producer refuses before any gesture. It still refuses tied candidates.
- `apps/extension/src/content/action-runtime/recovery/fault.ts`: adds the ambiguity fault and permits its wait only with explicit matching category, target-resolution stage, retryable true and unacted effect. Explicit uncertainty, permanence or malformed controls cannot open this wait. Ambiguity never dismisses layers or chooses a candidate.
- `apps/extension/src/content/action-runtime/recovery/budget.ts`: reuses the existing target wait ladder and command deadline without increasing either.
- `apps/extension/src/content/action-runtime/recovery/record.ts`: adds bounded count text without rebuilding original control authority.
- `domain/src/runtime/failure/tests/codes.test.ts`
- `domain/src/runtime/tests/adapter.test.ts`
- `domain/src/runtime/llm-evidence/node-run/retries/tests/dispatch.test.ts`
- `domain/src/runtime/llm-evidence/node-run/retries/tests/lasting-act.test.ts`
- `domain/src/runtime/llm-evidence/node-run/retries/tests/reacquire.test.ts`
- `apps/extension/src/content/action-runtime/recovery/tests/fault.test.ts`
- `apps/extension/src/content/action-runtime/recovery/tests/budget.test.ts`
- `apps/extension/src/content/action-runtime/recovery/tests/attempt.test.ts`
- `apps/extension/src/content/action-runtime/recovery/tests/record.test.ts`

The integration test dispatches three explicitly unacted ambiguity failures, then Core invokes the real remembered-list reread before attempt four. The item moves to a different row position; the final command uses the refreshed values for the same item and the saved identity stays unchanged. Only the fourth command acts. Public LLM runtime tests independently prove a transient tie can succeed on attempt four, persistent ambiguity stops after exactly four failed node attempts, and invalid descriptor/permission/unsupported refusals dispatch once. Lasting-act tests prove explicit uncertainty never opens another dispatch, including after an earlier safe retry.

The extension's existing target ladder polls resolution within one command at most five times (four waits totalling 3,750 ms inside its existing 5,000 ms budget); these pre-dispatch polls are distinct from Core's four node command attempts. No count, timeout, wait or call ceiling increased.

## Validation plan

Provider-free owning unit files only while the independent engine worker edits disjoint source. No whole suite, compiler, build, repository audit, browser or model execution. Root owns final strict checks, build stamps and the actual installed persistent-ambiguity/four-Native-attempt proof after source freezes.

Meaningful coverage: wait then act only after uniqueness; persistent ambiguity exhausts four Core node attempts; existing source finder reruns before attempt four and preserves identity; cancellation/gone/unavailable do not add attempts; explicit ambiguous effect prevents a second committing dispatch, including after recovery annotation; invalid descriptor/permission/unsupported records remain permanent.

## Observed validation

From Down `domain`, `$env:DOMAIN_TEST_BUILD_LABEL = 't837-target-ambiguity-retry'; node scripts/test-domain.mjs runtime/failure/tests/codes.test runtime/tests/adapter.test runtime/llm-evidence/node-run/retries/tests/dispatch.test runtime/llm-evidence/node-run/retries/tests/lasting-act.test runtime/llm-evidence/node-run/retries/tests/reacquire.test` -> exit 0, 88/88 passed, 51,279.7576 ms.

Initial extension run from `apps/extension`, `$env:EXTENSION_TEST_BUILD_LABEL = 't837-target-ambiguity-retry'; node scripts/test-extension.mjs content/action-runtime/recovery/tests/fault.test content/action-runtime/recovery/tests/budget.test content/action-runtime/recovery/tests/attempt.test content/action-runtime/recovery/tests/record.test` -> exit 1, 77/78 passed, 4,467.8767 ms. The sole failure was the existing transient-fault totality fixture: it fabricated `action_failed`/execution/no-effect for every code, so the deliberately strict new ambiguity gate refused that malformed ambiguity. The proper-factory wait, persistent tie, mixed terminal refusals and record safety cases all passed. Corrected only that owning fixture to use the real factory and include the new safe fault; no production relaxation.

After the lead signalled fresh Domain build/host/check completion, repeated the exact extension four-file command above -> exit 0, 78/78 passed, 4,594.4537 ms. No source/test edits occurred after the freeze.

From Core `packages/fluxiq`, `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/executor/outside-graph/tests/retries.test.ts src/programs/automation-studio/runtime/executor/outside-graph/tests/reacquire.test.ts src/programs/automation-studio/runtime/executor/target-reacquire/tests/stale-failure.test.ts src/programs/automation-studio/runtime/executor/target-reacquire/tests/step-reacquire.test.ts src/programs/automation-studio/runtime/executor/tests/ladder-run.test.ts --maxWorkers=1 --minWorkers=1` -> exit 0, five unchanged files/62 tests passed, 38.05 s. This verifies the existing generic retry/reacquire rungs and genuine permanent/uncertain-effect guards without changing any Core source or tests.

Source/test freeze was sent to the lead immediately after this test-only correction. Four production and nine test files stay read-only; no Core, account, engine, version, public export, shared documentation or git edits.

## Authorized safety follow-up after installed run seven

The lead's read-only question was answered **yes**: the inner loop could override unsafe original controls for `TARGET_NOT_FOUND`. Before the correction, `fault.ts:350` checked original controls only for ambiguity; not-found then used the code table's retryable default and `DECIDED_BEFORE_DISPATCH`. `attempt.ts:106` classifies the first result before waiting and invoking the dispatcher again, so preserving controls later in `recordRecovery` could not prevent this repeat.

Read-only probes used `node --input-type=module` with stdin scripts that loaded existing compiled pure owner blocks from the worker's `t837-target-ambiguity-retry` test artifacts into `node:vm`, importing the already-built Domain client. No source/test/build/browser files were written and no test/model/browser run started. The classification probe returned `target_absent` for both click and pure read on each explicit ambiguous-effect, permanent-false, valid action-failed/execution, and inconsistent-target-stage variant. The actual-loop probe injected nonacting DOM intervention callbacks and an instant recorded pause. Each of these three click variants returned `dispatchCalls:2, pausedMs:[250], outcome:succeeded`: explicit ambiguous effect; explicit retryable false; strictly valid action-failed/execution/unacted original. This proves an actual second dispatcher call before Core sees the failure. The first loop-probe harness stopped before dispatch with `ReferenceError: __esm is not defined`; including the existing esbuild header and harmless initialization stubs corrected the probe, which exited 0. The product code was never changed during these probes.

Once the lead closed installed run seven and authorized implementation, changed only:

- `domain/src/runtime/failure/codes.ts`
- `domain/src/runtime/failure/tests/codes.test.ts`
- `apps/extension/src/content/action-runtime/recovery/fault.ts`
- `apps/extension/src/content/action-runtime/recovery/tests/fault.test.ts`
- `apps/extension/src/content/action-runtime/recovery/tests/attempt.test.ts`

Not-found now explicitly states unacted at its producer. The same default is safe for not-shown: `results.ts` maps only the hidden gate refusal to that code and explicitly documents that every such refusal occurs before a verb dispatches. Both already use the target-resolution stage. No act after dispatch was reclassified.

Both target codes now require original retryability before any obstruction branch. A mutating command additionally requires original target-not-found category, target-resolution stage and absent-or-unacted effect. Absent legacy effect is accepted only with those actual pre-dispatch controls. Explicit uncertainty, refusal, wrong stage or wrong category cannot become a safe mutation through a familiar code. Retryable pure reads retain their behavior, and the separate typed covered/disabled pre-dispatch exceptions remain unchanged. No Core, engine, matcher, spec, record source, public export, budget or account change was made.

Owning fixture helpers now use real factory records instead of labelling every target fault as generic execution. The older deterministic-refusal fixture now uses genuinely permanent invalid-parameter, since ambiguity is transient. New tests execute the recovery loop and assert a single dispatcher call, no pause and no layer probe for unsafe originals of either target code; a safe first wait followed by uncertain/permanent original stops without a third dispatch. Existing normal factory four-attempt and source-refresh regressions are retained.

After this five-file edit, sent a new source/test freeze before checks. From extension, `$env:EXTENSION_TEST_BUILD_LABEL = 't837-target-original-controls'; node scripts/test-extension.mjs content/action-runtime/recovery/tests/fault.test content/action-runtime/recovery/tests/budget.test content/action-runtime/recovery/tests/attempt.test content/action-runtime/recovery/tests/record.test` -> exit 0, 82/82 passed, 5,791.9977 ms.

From Domain, `$env:DOMAIN_TEST_BUILD_LABEL = 't837-target-original-controls'; node scripts/test-domain.mjs runtime/failure/tests/ runtime/tests/adapter.test runtime/llm-evidence/node-run/retries/tests/dispatch.test runtime/llm-evidence/node-run/retries/tests/lasting-act.test runtime/llm-evidence/node-run/retries/tests/reacquire.test` -> exit 0, 112/112 passed, 53,784.9735 ms. This expands only to every test beside the changed failure-code owner, plus the existing adapter/dispatch/lasting/reacquire owners. The real not-found factory still succeeds on attempt four when the target appears, stops at exactly four failures when absent, and retains the real source-refresh and uncertainty/permanent-refusal regression coverage.

Outcome: Done
Changed: Four Down source and nine owning test files listed above; own reports.
Validation: Initial unit: Domain five files 88 passed, extension four files 78 passed, unchanged Core five files 62 passed. Safety follow-up: extension four files 82 passed; Domain expanded owner/retry run 112 passed. Exact commands, proof and corrected initial fixture failure are recorded above.
Not verified: Worker did not run strict compilers, repository audits, full builds, browser or model tests; the lead owns those integration checks and installed four-attempt proof.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/fingerprint-retry-fix.md`
Notes: Existing completion Core implementation stays frozen. No provider or browser execution.
