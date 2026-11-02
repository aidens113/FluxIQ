# Framework owner completion review

Bounded read-only review of the SHOP producer fixture and the five storage error-policy changes listed in `framework-storage-migration.md`. No source, test, configuration, shared document or git changes; no checks executed.

The raw SHOP completion mechanism is sound by inspection. One adjacent fixture registration needs correction before calling the entire completion configuration safe. Two inherited storage error-path gaps remain; neither is evidence that the extraction introduced a regression.

Follow-up after this review: Root reported removing the incorrect resolver read-only registration and assigned actual permission forwarding to B. The storage worker reported both cleanup/initializer fixes saved with focused fault cases, pending its next immutable acceptance window. The findings below describe the reviewed snapshot; this review has not independently verified those subsequent fixes.

## Actionable findings

1. **The resolver has an unconditional read-only contract while invoking an effect-capable supplied callback.** `service/project-build/tests/project-build-trial-reset.test.ts:305` registers `binding.resolvePlanNodeParameters` as `no_direct_effects`. Its exact helper, `tests/declared-step-resolution/resolution.ts:15`, awaits `input.permission`; the real permission projection forwards to its supplied callback in `runtime/action-permissions/plan/projection.ts:33`. The actual plan-step permission path may ask, observe or record a witness (`flow-bootstrap/action-permissions.ts:484`). This is not the self-contained snapshot read performed by `startState`. The registration gives this function `Source.isReadOnly` authority, while the helper itself does not establish an observed permission child. Keep this resolver an observed frame whose completion depends on the actual permission delegate; do not certify it from the returned plan status. No runtime counterexample was executed in this review, and the raw operation receipt below is unaffected. Exact forwarding: `brief-ports.ts:381` supplies `built.permissions.planStep`; `plan-parameter-resolution.ts:304` creates that per-step permission and `:415` supplies the projection wrapper. `planStep` calls `asking(...)` without an `originalCall`, so `asking` at `action-permissions.ts:335` selects the raw parking port, while `stepWitness` at `:624` directly invokes `siteReset.admitStep`. These are the original delegate entrances that require genuine current-scope observation.

2. **A final connection-close failure can erase the primary and rollback errors.** `framework/persistence/sqlite/repository.ts:148` unconditionally awaits `close(db)` in `getExistingReadOnlyMany`'s `finally`. Its immediate nonpooled helper does the same at `:254`, including for `transaction`. If SQL work and rollback fail, the new correct AggregateError is replaced when close also fails; even successful rollback loses the identical primary error. Retain the pending primary/rollback failure and aggregate a subsequent close error, preserving the original primary as cause. Add fault coverage for primary plus close and primary plus rollback plus close. Existing rollback-only handling is correct. This is an adjacent inherited cleanup gap, not a newly observed extraction regression.

3. **A throwing recovery initializer leaves the active state path archived without restoration.** `framework/persistence/state/json-store.ts:157` calls `this.empty()` after renaming the malformed file to its backup and before entering the restoration-protected `try`. A throwing initializer skips the new restoration handling, leaving the original path absent even though recovery rejected. Put initialization inside the same protected replacement operation, or construct it before the archive operation. Preserve the identical initializer error after successful restoration and expose both failures if restoration fails. Add a throwing-initializer case against an actual malformed temporary file. This gap is inherited; the approved write/restore handling is correct for `writeUnlocked` failures.

## SHOP authority and original oracles

The owner controls the actual isolated `site.cart` and `site.tab` mutations. Navigation, add and remove callbacks remain `managed_direct_effects`; they are not declared effect-free. Every raw call receives a fresh private token before the first await. The non-async wrapper returns the original Promise unchanged and privately connects that Promise to the token. Completion requires that original Promise, that token's receipt and the identical fulfilled output object. Successful consumption deletes both memberships, so copied output, swapped calls, a replacement Promise and reuse cannot clear. Rejected permission calls have no receipt. Status, `effectApplied`, `ok` and digest shape do not establish receipt membership. Child-frontier closure remains the actual observation source's responsibility.

The negative raw subject covers two invocations of the same request, swapped/copy/replacement-Promise refusal, one-use success, and an identical rejected permission error with no cart mutation. The original world/reset assertions remain present: first and second YES, exact first-run start navigation, carried `startedWith`/`stillThere`, exact undo ordering and settled act, the second builder's preparation and trial, the full twelve-act sequence, final cart `dish-soap/oat-milk/jam`, and no `undoes` field in domain inputs. `startState` itself only reads the controlled world and builds a detached snapshot/diff.

## Five approved storage policies

| Approved change | Review result |
| --- | --- |
| `sqliteStateForPath` root/config failures | Correct: actual resolver/read/JSON errors propagate; genuinely absent root still returns null. |
| `SQLiteRepository.databases` | Correct: only ENOENT is omitted, including a directory disappearing during enumeration; other IO errors escape. |
| `SQLiteRepository.transaction` rollback | Correct identical primary/rollback aggregation and cause, subject to finding 2's later close failure. |
| `getExistingReadOnlyMany` rollback | Same correct aggregation, with the same final-close gap. |
| `ProgramJsonStore.recoverMalformedState` restoration | Correct original write/restore aggregation and cause, subject to finding 3's initializer boundary. |

Inspection included only those methods, their immediate cleanup/root helpers, the exact resolver delegate needed to assess its contract, and the corresponding focused test bodies. Existing storage tests exercise normal rollback and injected rollback/restoration failures; this review did not run them or claim the additional compound failure cases are covered. Normal built-package acceptance, actual full Service behavior, downstream, live behavior and full suites were not verified.

Outcome: Done
Changed: docs/working/runtime-ownership-refactor/reports/framework-owner-completion-review.md
Validation: read-only source/test-body inspection -> raw receipt identity and unchanged substantive oracles confirmed; three bounded findings recorded; no checks run per brief
Not verified: runtime reproduction of findings; normal built-package/full Service/downstream/live/full-suite behavior
Report: docs/working/runtime-ownership-refactor/reports/framework-owner-completion-review.md
Notes: Source/tests remain frozen. Root owns integration and any follow-up source release. Storage gaps are inherited adjacent error paths, not claimed extraction regressions.
