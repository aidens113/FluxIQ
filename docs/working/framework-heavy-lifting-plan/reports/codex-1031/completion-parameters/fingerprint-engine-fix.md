# Shared recorded-place admission

Outcome: Done (bounded source/tests; lead compiler/audit/build/browser qualification pending).

The extension now treats the saved landmark role and optional name as place constraints beside the existing record and dialog constraints. `identity/place.ts` owns the one shared runtime predicate and private landmark comparison. An absent recorded landmark imposes no new constraint; a recorded role/name must match and unknown/missing places fail closed. Matcher weights, score floors, margins and the complete original fingerprint remain unchanged.

The predicate runs before exact multi-match admission/counts, both veto paths, Level 2 ranking, family enumeration's candidate cap, and stable-name rescue's uniqueness check. A place mismatch cannot be rescued by a matching part of a changing name. Existing read-landmark filtering calls the same predicate with only its landmark fields, preserving the marked read's prior record/dialog semantics. Exact resolution now reports its admitted candidate count, rather than unrelated raw matches.

Owned changed paths (Down):

- `apps/extension/src/content/identity/place.ts` (new), `index.ts`, `score.ts`, `veto.ts`.
- `apps/extension/src/content/action-runtime/resolve-target.ts`, `read-lookup/in-recorded-landmark.ts`.
- `apps/extension/src/content/identity/tests/place.test.ts` (new), `score.test.ts`, `veto.test.ts`.
- `apps/extension/src/content/action-runtime/tests/resolve-target-landmark.test.ts` (new).
- Two additional existing test paths explicitly authorized by the lead: `action-runtime/tests/resolve-target-read-words.test.ts` and `identity/tests/created-node-identity.test.ts`.

The old unmarked-read expectation deliberately selected an aside neighbour despite the saved main landmark. That one expectation now requires refusal and no neighbour selection; all marked-read cases remain intact. The created-node tests previously used non-DOM marker candidates although their real captured identity includes `landmark: main`. Their candidates now sit in a faithful stub-DOM main landmark. Their snapshots, source inputs, transport path and selection assertions are unchanged; no gate was weakened to accommodate an uncheckable marker.

New coverage proves simultaneous original ID/class drift selects the correct navigation link over a same-labelled/same-destination footer twin; weak exact selectors count only the recorded landmark; removing the original landmark refuses the footer; two candidates within the recorded landmark remain ambiguous; named/missing/wrong landmark roles and names fail closed; unrelated earlier links cannot consume the candidate cap; both veto paths refuse a perfectly matching wrong-place candidate without a score; and stable-name rescue both rejects an outside-landmark substitute and excludes outside-landmark twins from its uniqueness count.

Validation chronology:

- Initial focused run -> 51/54 passed. The correct original element was already chosen, but the new fixture accidentally exercised text fingerprint lookup rather than scored fallback, and exact resolution still reported raw match counts. The fixture now uses the actual saved shape (implicit link role and accessible name without redundant visible text), and exact reporting uses admitted counts.
- The next focused run -> 51/54 passed: its hand-built elements' `ownerDocument` lacked page-token lookups, so missing old IDs could not be proved absent and were conservatively penalized. The new DOM fixtures now expose their actual stub document; no production scoring rule was changed.
- Corrected focused run -> 54/54 passed, 482.0795 ms.
- Broader owning run after the stable-name regressions -> 244/246 passed; only the two created-node marker fixtures lacked the DOM required to check their captured main landmark. Lead-authorized faithful fixture setup resolved that test deficiency.
- Final command from `apps/extension`: `EXTENSION_TEST_BUILD_LABEL=t837-landmark-final node scripts/test-extension.mjs content/identity/tests/ content/action-runtime/tests/resolve-target content/action-runtime/tests/store-chooser-replay.test.ts content/action-runtime/tests/recorded-shadow-hosts.test.ts` -> 246 tests, 246 pass, 0 fail, 6464.799 ms. Existing record/dialog, read, context, scorer/veto, shadow-host and store-chooser rescue negatives remain passing. Ignored evidence: `test-runs/t837-completion-probe/engine-final-tests.log`.
- `git diff --check -- <the twelve owned paths>` -> exit 0. The identity directory has 25 files, `place.ts` has one runtime export, and `resolve-target.ts` has 798 physical lines. No baseline was changed.

Not verified: package compiler, plain structure audit, extension builds and final installed-browser click/reload behavior. Those are lead-owned gates, not inferred from the unit results. No browser, provider/model, panel, build or full-suite command was launched by this worker. Failure/recovery code and Core/Domain source were not edited.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/fingerprint-engine-fix.md`

Notes: Source/tests frozen for lead acceptance. The independent retry lane owns failure classification. Architecture documentation is lead-owned.
