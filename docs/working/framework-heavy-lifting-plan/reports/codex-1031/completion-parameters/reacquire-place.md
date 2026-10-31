# Reacquisition place verification

Outcome: Done (read-only verification; a shared Domain landmark gap is proven).

**No, the original landmark constraint does not survive both control-refresh paths.** `reacquire-target.ts:24` sends source-output controls directly to `webReacquireElement`; `identity/refresh.ts:28` uses that same matcher for unbound refresh after proving the observation's scope/completeness. `element-match.ts:readElement` retains record, dialog and shadow hosts but discards `context.landmark` and `context.landmarkName`. Its eligibility predicate therefore cannot distinguish a matching footer from the saved navigation control.

An inline provider-free Node probe against the current compiled production Domain confirmed both paths: a saved navigation identity with a retired ID and matching class/name/kind, paired with one otherwise matching footer candidate carrying no contradictory ID, produced source `found`. A positively complete same-place observation then produced unbound shared refresh `found` with replacement landmark `contentinfo`. There were zero gateway/provider calls. This is an actual reachable shared-matcher counterexample; it is not a claim that the lead's missing-original browser run has already clicked a footer.

Constraint findings:

- Unbound session/tab/frame/document: retained by `reacquire-unbound-target.ts`, `identity/capture.ts` and `identity/places.ts`; the previous actual attempt pins the new capture, same-place requires identical correlated session/resource/tab/frame/location/timeOrigin, and `identity/candidates.ts` filters the intended frame. The returned patches replace only selector/element, retaining outer frame parameters.
- Record/dialog/shadow: `element-match.ts` explicitly validates and matches these before uniqueness. Existing tests cover differing/missing records, dialog and shadow roots. These constraints must remain intact.
- Landmark/name: absent from `Read`, validation, eligibility and the constrained-target absence rule. `classify-observation.ts:knownElement` validates dialog/shadow metadata but not landmark/name metadata.
- Replacement: `identity/replacement.ts` deliberately takes the fresh fingerprint, discards positional fields/xpath and inherits only `readsWords`. After the incorrect match, it therefore installs the footer's fresh context. Copying the stale landmark blindly would hide the wrong selection; the fix belongs before matching/replacement.
- Generic source-control frame: the Domain hook itself does not compare frame metadata embedded in control values; it relies on execution of the original source node. `return-to-source-place.ts` establishes the source address, not an independent candidate frame check. The surrounding Core source-execution contract was outside this read-only brief, so this report does not claim a separate proven production frame escape.

Minimal proposed ownership (all Down):

1. `domain/src/runtime/target-reacquire/element-match.ts`: retain/validate recorded landmark role/name, gate candidate matches on those fields before uniqueness and preserve unknown/missing-place refusal. Include them in the constrained absence rule so missing metadata cannot become a false `gone` verdict.
2. `domain/src/runtime/target-reacquire/tests/element-match.test.ts`: source hook and direct matcher negatives/positives, including footer-only, absent/malformed place and same-landmark twins.
3. `domain/src/runtime/target-reacquire/identity/classify-observation.ts` and `identity/tests/classify-observation.test.ts`: fail closed on explicitly malformed/withheld landmark metadata before a capture can prove completeness/absence.
4. `domain/src/runtime/target-reacquire/identity/tests/refresh.test.ts`: complete same-place observations cannot replace navigation context with footer context; validated same-landmark replacement remains fresh and position-free.
5. `domain/src/runtime/tests/host-runtime-reacquire.test.ts`: actual unbound host hook produces no replacement patches for another/missing landmark; retain all session/tab/frame/document/hidden/coverage/record/dialog/shadow negatives.

Do not import extension code. No replacement change is needed if the shared matcher proves the source place first. The extension's existing gate should remain an independent final defense.

Separate existing drift policy: `agrees` currently rejects every contradictory shared ID/class signal. Thus both present-but-changed IDs/classes currently refuse even within the correct landmark. The requested positive for simultaneous ID/class drift needs an explicit authorized matching-policy decision in addition to the landmark fix; it must not be made by silently dropping all contradictions. Position/selector changes and absent weak fields already have a supported path. Genuine within-landmark ties must remain ambiguous.

Changed: This report only.
Validation: Named source/host tests inspected; inline pure production-Domain hook/refresh probe -> source `found`, unbound refresh `found`, original `navigation` replaced by `contentinfo`, complete/same-place observation, zero gateway/provider calls. No tests/build/browser/model/full-suite/git mutation run.
Not verified: The lead's missing-original Native four-attempt browser test and the outer Core source-execution frame guarantee; no fix implemented.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/reacquire-place.md`
Notes: Existing engine source stays frozen. Proposed ownership is six Down files. Awaiting written implementation brief.
