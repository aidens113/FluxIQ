# Unacted target ambiguity retry discovery

Outcome: Done (read-only discovery; implementation is separately authorized in `fingerprint-retry-fix-brief.md`).

## Cause and distance

The supplied installed trace reached two successful navigation nodes, then one failed click: `web.target.ambiguous`, `target_resolution`, `effect: unacted`, `retryable: false`. No judge ran. This report did not rerun or independently inspect the browser artifact; those observed fields came from the lead's brief. The following control path is source-proven.

1. Down `domain/src/runtime/failure/codes.ts` defines `web.target.ambiguous` as category `target_ambiguous`, stage `target_resolution`, **not retryable**. `webAutomationFailureRecord` copies that row. The comment explicitly assumes ambiguity cannot change without editing the Flow. The owning code-table test pins that assumption.
2. `domain/src/runtime/adapter.ts` `commandFailure` preserves a strictly valid original failure through `readWebHostFailure`, then `webLastingActStatement` preserves its retry flag and states a committing click unacted when target resolution happened before dispatch. Its fallback code factory produces the same false flag. A valid producer record is not overridden by a new local default.
3. Core `executor/defensive/assess.ts` `faultFromRecord` reads the flag directly: false becomes `disposition: refuse`. Stage/category already imply unacted where no effect was stated. The early refuse return retains that disposition; the lasting-act-uncertain guard does not cause this refusal.
4. `executor/retry-policy.ts` does contain the correct four-attempt floor, but its eligibility predicate delegates to that assessment. `ladder-run.ts` hands the false eligibility to `recovery-ladder.ts`; the ordinary retry rung is not offered. A floor is not an override of a per-fault refusal.
5. The same assessment controls `executor/outside-graph/retries.ts`. It returns immediately when disposition is not retry. Down exploration/draft-test dispatch uses that public Core helper, so this classification affects all execution paths, not just the installed Native trial.

This is an outdated producer policy for a recoverable target-resolution condition, not a missing retry-count setting or evidence that an act might have landed. A dynamic page can become unique after settling or source refresh. No ambiguous candidate may be chosen while the tie remains.

## Waiting and source refresh

- Extension `content/action-runtime/recovery/fault.ts` returns no recovery fault for a code the shared table marks non-retryable. The ambiguity code also lacks a mapping in the exhaustive retryable-code map, so simply changing one table bit would leave safe per-command waiting unsupported and fail its totality test.
- Its recovery loop (`recovery/attempt.ts`) already waits and reruns the complete attempt within the existing command/5-second budget. A new pre-dispatch ambiguity fault can reuse that bounded target wait. It must neither clear arbitrary layers nor pick a candidate itself.
- Core waits for recorded readiness on each graph arrival (`executor/step-loop/arrival.ts`). The separate ladder readiness/interference rungs have their own availability and act safety gates; their existence does not guarantee a new attempt for this observed failure.
- Core's `target-reacquire/stale-failure.ts` explicitly recognizes `target_ambiguous` as a target failure when no act landed. `before-attempt.ts` schedules refresh immediately before attempt four, after the first attempt and two failed retries. `step-reacquire.ts` can rerun a read-only source and match the same item by identity, or use the existing unbound-target host seam. Outside-graph dispatch has the same before-fourth callback. Neither can be reached when the producer ends the node after attempt one.
- Whether this particular installed click has source lineage or an available unbound-target host hook is not established by the supplied one-attempt record. Correcting the flag opens the existing opportunity; it does not prove the scorer will uniquely resolve the real target. Scorer/command identity are independent workers' scope.

## Safety-preserving correction

Keep Core's respect for genuinely permanent producer failures. `packages/contracts/src/failure/parse-record.ts` already permits retryable target ambiguity; its six permanent categories exclude target ambiguity, so no Core source/public-contract change is necessary.

Correct Down's ambiguity row to a retryable, pre-dispatch/unacted target condition. Add a distinct extension recovery fault word and bounded uniqueness waiting, retaining the current target matcher and all ambiguity refusals until it becomes unique. Explicit ambiguous-effect metadata must stop a committing act and outrank an unacted default. Invalid descriptors, permission/auth/unsupported refusals and truly gone targets remain permanent.

Recovery annotation is a second required seam: `recovery/record.ts` rebuilds the final failure through the code factory. After an absorbed unacted ambiguity followed by an explicit ambiguous-effect terminal result, that rebuild must preserve the validated explicit effect; otherwise annotation could erase uncertainty and reopen unsafe Core retries. The lead separately approved this bounded file and its owning test.

Implementation paths and acceptance details are recorded in `fingerprint-retry-fix.md`; Core source/tests, engine/scoring/resolve-target and browser files remain outside this worker's edit scope.

Validation: Read-only inspection of the cited source and owning tests; no executable probe, test, build, compiler, browser or model run during discovery.
Not verified: Actual scorer identity, source lineage in the installed failure, and whether bounded retries will make that real click unique.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/fingerprint-retry.md`
Notes: No raw page/model/selector/identity/key data emitted. No uncertainty or permission guard proposed for relaxation.
