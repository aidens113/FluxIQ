# Reacquisition landmark preservation

Outcome: Done (six-path implementation frozen; lead qualification remains).

The existing shared plain-JSON control matcher now reads and validates landmark role/name and requires the original stated fields to agree before uniqueness. Both source-output refresh and unbound refresh already use this matcher, so a footer cannot become the navigation target and install its own context during replacement. An absent original landmark adds no invented restriction. Missing, malformed or withheld required place evidence refuses; constrained missing evidence does not claim `gone`.

Raw observation classification now validates explicitly supplied landmark/name metadata beside dialog/shadow evidence. Malformed or withheld claims cannot establish complete coverage. Replacement itself remains unchanged: only a validated same-place match may supply fresh identity/address, without stale positional fields.

Per the lead's explicit decision, every existing descriptive matching rule remains intact. Present contradictory IDs, class sets and other shared identity fields still refuse. Positive tests retain stable identifying signals and the original landmark while optional ID/class metadata is absent and selector/handle/position changes; positions never identify the candidate. Browser scoring remains responsible for its separately qualified simultaneous weak-attribute drift path.

Changed (Down only):

- `domain/src/runtime/target-reacquire/element-match.ts`
- `domain/src/runtime/target-reacquire/identity/classify-observation.ts` (the actual nested path; the brief's source line omitted `target-reacquire`)
- `domain/src/runtime/target-reacquire/tests/element-match.test.ts`
- `domain/src/runtime/target-reacquire/identity/tests/classify-observation.test.ts`
- `domain/src/runtime/target-reacquire/identity/tests/refresh.test.ts`
- `domain/src/runtime/tests/host-runtime-reacquire.test.ts`

Validation: from the Down root, `DOMAIN_TEST_BUILD_LABEL=t837-reacquire-place pnpm.cmd --filter @fluxiq-web-extension/domain test /target-reacquire/tests/element-match.test.ts /target-reacquire/identity/tests/classify-observation.test.ts /target-reacquire/identity/tests/refresh.test.ts /runtime/tests/host-runtime-reacquire.test.ts` -> current Core currency guard passed; 43/43 tests passed, 0 failed, 302.8189 ms. Ignored output: `test-runs/t837-completion-probe/reacquire-place-tests.log`. `git diff --check -- <the six owned files>` -> exit 0.

New source-hook and actual unbound-host cases reject footer, missing, wrong and differently named landmarks without replacement patches or caller mutation. Same-place positives retain navigation context without inheriting old ID/classes or list position; genuine same-place twins remain ambiguous. Existing record/dialog/shadow, actual session/tab/frame/document, coverage/hidden and cancellation cases remain passing. The initial read-only counterexample's two paths are now covered by the shared matcher and actual host tests.

Known pre-existing transport limitation, reported to the lead before editing: `packet-fingerprint/from-packet.ts` carries landmark role but currently omits landmarkName from fresh unbound candidates. Named stale targets therefore fail closed when a fresh name cannot be proved; no stale name is blindly copied. Source JSON matching proves same-name positives, and unbound tests prove role positives and missing-name refusal. The lead explicitly accepted this six-path scope, keeping the canonical capture fingerprint shape and strict prior identity compatibility unchanged. This unit does not claim unbound named-region success or expand the six authorized paths.

Not verified: final Domain compiler/build, structure audit, production compiled-probe rerun and the lead's installed missing-original four-attempt Native test. No compiler, audit, build, browser, model/provider, full-suite or git mutation was run. Core, extension, public contracts and baselines are unchanged by this worker.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/reacquire-place-fix.md`

Notes: Source/tests frozen. Six authorized paths only. Lead owns final integration and browser qualification.
