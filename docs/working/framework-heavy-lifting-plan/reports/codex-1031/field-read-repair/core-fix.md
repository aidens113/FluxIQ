# Core unconfirmed inspection repair — t838

Outcome: Done. Source edits frozen; lead owns typecheck, structure, SDK build and integration.

The actual missing-row claim remains unconfirmed. The locator now distinguishes a named row/column whose cell was not measured from a located defect, an actually refuted claim and an unknown/unspecified row. After the normal mandatory re-prompt, only that typed missing-cell case can produce a separate inspection hint; unsupported model observed/advice remains discarded.

The pure private hint module binds issued hints to the current summary and its unchanged content, the actual tested Flow, replay, round and judge invocation. The existing unsupported-no locator caller passes its exact typed unmeasured result; the hint module has no runtime dependency on the locator or another runtime feature. Copied/forged hints, another summary, changed evidence, older rounds/Flows and an earlier invocation cannot buy a repair. The helper is not exported through the agreement/public barrels; nothing adds permission, effect or acceptance authority.

The build judge carries the hint separately from a `no`'s fields. The round judgement and model-facing resume explicitly label the structured allegations unconfirmed and require a fresh inspection/read before deciding whether to change a condition. An actionable current hint buys the existing first-stall grace only; the next stalled round still ends `no_progress`. Unknown stays unaccepted, normal final Flow-signature/model-yes gates and purse/call/duration/cancellation behavior remain. Existing fully-refuted-after-reprompt agreement semantics are unchanged.

Changed production paths, relative to `packages/fluxiq/src/programs/automation-studio/runtime/`:

- `result-verification/located-defects/located-defects.ts` — optional typed `unmeasured` result from the exact missing-cell branch, separate from `refuted`.
- `result-verification/contracts/verification.ts` — explicit unconfirmed inspection shape with screened structured allegations.
- `result-verification/agreement/unsupported-no.ts` — issue only from current re-asked unmeasured defects; retain existing advice stripping and verdict rules.
- `result-verification/unconfirmed-inspection/{hint,index}.ts` — pure private issuance, provenance, freshness and generic model-facing inspection text.
- `result-verification/build-test/judge.ts` — forward only the current summary's issued hint on unknown.
- `flow-bootstrap/unfinished-build/contracts.ts`, `judgement.ts`, `phases.ts` — carry and serialize the hint apart from no/advice; guard the actual judge invocation; allow only the existing first-stall grace.

Changed owning tests/support:

- `result-verification/located-defects/tests/unmeasured-cell.test.ts`.
- `result-verification/unconfirmed-inspection/tests/{fixture,hint.test}.ts`.
- `result-verification/build-test/tests/judge-unsupported-no.test.ts`.
- `flow-bootstrap/unfinished-build/tests/unconfirmed-inspection/tests/inspection.test.ts`.

Validation, from the private Core `packages/fluxiq` directory:

`pnpm.cmd exec vitest run src/programs/automation-studio/runtime/result-verification/located-defects/tests/unmeasured-cell.test.ts src/programs/automation-studio/runtime/result-verification/unconfirmed-inspection/tests/hint.test.ts src/programs/automation-studio/runtime/result-verification/build-test/tests/judge-unsupported-no.test.ts src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tests/unconfirmed-inspection/inspection.test.ts src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tests/judgement-value.test.ts src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tests/no-progress-ending.test.ts src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tests/repair-rounds.test.ts src/programs/automation-studio/runtime/result-verification/located-defects/tests/located-defects.test.ts src/programs/automation-studio/runtime/result-verification/tests/reask-route/tests/unsupported-no-route.test.ts`

Observed after the pure-module relocation: **9 files passed, 69 tests passed, 32.23 seconds**. Includes actual unsupported-no → build-test → judgement/resume, the extra repair then bounded stop, no-hint/not-judged/yes-advice controls, copied/stale hints, cost/duration and cancellation. The subsequent final test-only placement move was checked separately: `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tests/unconfirmed-inspection/tests/inspection.test.ts` → **5 passed, 27.74 seconds**.

Final plain audit: `node scripts/structure-audit.mjs` → **passed (483 warnings, 1141 baselined)**, exit 0. No baseline edit. The lead's first audit found 43 violations: the new locator import closed an existing runtime import chain, the hint was one directory too deep, a test reached across a feature without its barrel, and the direct test directory had 26 files. The pure helper/typed caller handoff and relocation removed those; the first repeat left one test-placement violation, corrected by the final nested test path above.

Earlier checks: plain `pnpm` launch failed because this PowerShell environment blocks its `.ps1`; switching to `pnpm.cmd` ran the tests. The first 7-file run passed 30 tests and failed 10 because the new synthetic fixtures omitted required Flow shape and did not propose their read. Those fixtures were corrected; the next affected 4-file run passed 12 tests. The final 9-file run above includes the subsequent judge-invocation and yes-advice controls.

The lead reported package types and an initial SDK build passed before the structural relocation (SDK 122.124 seconds). That SDK output is stale after the source move; the lead owns its fresh type/build acceptance. Not verified by this worker: package typecheck, SDK build, production browser behavior, downstream field identity fix, oracle/replay, or a live model build. No provider/browser/paid run, full suite, git mutation, package/version change or shared-document edit was made. All test evidence is unrelated invented unit data.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/field-read-repair/core-fix.md`.
