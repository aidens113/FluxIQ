# Fingerprint landmark gate discovery

Outcome: Done (read-only source diagnosis; implementation requires the lead's written brief).

The acting-target engine does not use the captured landmark to distinguish targets. `identity/context.ts:84` captures the nearest landmark role and optional name. `identity/score.ts:156` limits its usable recorded place to record/dialog; `inRecordedPlace` at line 337 gates only those two. `comparableFingerprint` at line 368 sends neither landmark nor name to Core, and `candidateFingerprint` deliberately has no structural context. Thus two same-labelled links in different landmarks can be ranked as near twins even though the full saved identity still distinguishes them. This is a downstream semantic-gate gap, not a reason to weaken the Core score floor or margin.

Exact branches:

- `action-runtime/resolve-target.ts:489`: exact selector, point/visual target, then fingerprint lookup. A changed ID makes selector lookup miss; stable fingerprint lookup in `element-finder.ts:67` then tries other stable fields and the class set. After ID and classes drift, family enumeration/scoring is the remaining path. A surviving old class on the wrong landmark can also reach Level 1, so fixing only final ranking is insufficient.
- `resolve-target.ts:337`: multi-match admission uses only `inRecordedRecord`; `gatedPool` adds visibility/enabled/tag. Landmark is absent before counts. A lone candidate is checked by `vetoExactMatch`, whose source checks are also only record/dialog (`identity/veto.ts:283`).
- `resolve-target.ts:425`: family candidates are capped before scoring; its optional pre-cap admission handles row values only. A semantic landmark filter belongs before that cap, so unrelated earlier links cannot exhaust the recorded landmark's candidate budget.
- `scoreTargetCandidates` at `identity/score.ts:255` gates record/dialog, then applies the unchanged 0.35 floor and 0.2 winning margin. Near-equal header/footer scores therefore produce `ambiguous` at line 287, reported by `resolve-target.ts:409` as `web.target.ambiguous`.
- `action-runtime/read-lookup/in-recorded-landmark.ts` already checks role and recorded name, but explicitly only for read targets. `resolve-target-read-words.test.ts` tests this read behavior. The acting scorer/veto/resolver tests inspected contain no landmark gate assertions.

The lead independently confirmed the actual installed command retains the whole original fingerprint and `context.landmark: navigation`; its scored pool has 24 candidates, scores 0.89/0.88 and confidence 0.783, producing the reported ambiguity. I did not duplicate that private command/trace inspection. The source behavior above is directly verified by reading; exact branch attribution is corroborated by the lead's independent installed-run evidence, not a browser run by this worker.

Proposed bounded implementation paths:

- `apps/extension/src/content/identity/place.ts` (new): one shared record/dialog/landmark place gate and landmark predicate; recorded landmark role and optional recorded name must match, including fail-closed absence.
- `identity/index.ts`, `identity/score.ts`, `identity/veto.ts`: export/use the shared owner; include landmark in the recorded place type; refuse a mismatched place before score/corroboration. Do not change matcher weights, floors or margins.
- `apps/extension/src/content/action-runtime/resolve-target.ts`: gate exact multi-match candidates before counting; use the same admission before enumeration caps and ranking; disallow stable-name rescue for a place mismatch as for record/dialog mismatch.
- `action-runtime/read-lookup/in-recorded-landmark.ts`: reuse the shared predicate, preserving existing read behavior.
- Owning tests: `identity/tests/place.test.ts` (new), `identity/tests/score.test.ts`, `identity/tests/veto.test.ts`, `action-runtime/tests/resolve-target-landmark.test.ts` (new).

`identity/` currently has 24 files; the single new shared owner reaches 25 without a baseline change. Its existing context dependency does not import the scorer/veto, so a direct shared owner need not introduce a runtime cycle.

Required regressions: simultaneous original ID/class drift with equal-label/equal-destination header/footer links selects the original navigation landmark through both scored fallback and weak exact lookup; removal of that landmark yields not-found and zero fallback-twin clicks; two genuine candidates within the same recorded landmark remain ambiguous; a recorded named region distinguishes a differently named region; a missing recorded landmark/name fails closed. Preserve existing record/dialog/frame/shadow, sensitive-text, read-target, hidden/disabled, scan-cap, stale-token and genuine-twin negatives. The final installed test must exercise actual fresh-document navigation/reload and click dispatch; unit scores alone do not qualify browser selection.

Changed: This report only.
Validation: Source inspection and bounded `rg` queries only; no tests, source edits, browser, builds, model calls or git mutations run.
Not verified: The proposed gate's regressions and final installed behavior; no success claim for a fix yet.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/fingerprint-engine.md`
Notes: Proposed ownership excludes failure/recovery and Core files. Retry classification remains the independent lane. Awaiting the lead's implementation brief.
