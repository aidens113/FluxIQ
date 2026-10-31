# D1 final fresh-SDK corrections

Source status: **FROZEN** before this report. Only approved `node-run/run.ts` and `node-run/tests/replay.test.ts` changed; no tests/builds/type checks/audits/git or Core/paired-fixture edits.
Read actual `test-runs/t830-final-domain-{tests,types}.log`: package types rejected optional adapterValue at run.ts420; replay test160 observed four dispatches where its old assertion expected one. Other failures remain outside this brief.

The original capture call used `present<WebNodeFrozenCaptureInput>`, whose required-field contract excludes undefined even though the input declaration permits an unproven adapter value. Both original capture sites now require `frozen.kind === ordinary && adapterValue !== undefined` before attempting capture. No cast, fabricated value or default was added. Missing original adapter input stays unproven and the existing ordinary execution proceeds unchanged. Source line count remains 799.

Replay test160's gateway now honestly returns the owning complete `TARGET_NOT_FOUND` record. That record is retryable at target_resolution; the existing lasting-act statement establishes unacted before dispatch, so Core's existing default legitimately makes the first attempt plus three retries. The fixture has no positive scope provenance enabling a target-source rebind/early gone conclusion. Its old exact-one assertion was stale after the earlier complete-record fixture repair.
The test now asserts exact four, retaining its existing five page/target cases and failure fixture. It additionally requires every dispatched selector to equal the originally authored selector, including the same-words/different-selector case, so this correction cannot pass by acting on another subject. No production retry, target, verdict or refusal logic changed.

Lead-owned follow-up: domain types; owning replay test and frozen-execution tests; narrow structure audit. No successful check is claimed. Root's paired worker may validate against the now-stable source and current SDK.

Outcome: Done
Changed: approved run.ts capture guards, replay.test.ts exact retry/target assertions, this report.
Validation: not run — brief reserves validation to lead/paired worker; actual failure logs and final changed lines inspected.
Not verified: compilation, corrected/regression tests, structure audit or paired/browser execution.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d1-final-sdk-corrections.md`
Notes: Source frozen. Ordinary execution/safety preserved; no baseline or git changes.
