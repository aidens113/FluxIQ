# Definition-field capability gate — t838

Outcome: Done — owned source and regressions are repaired and frozen. Fresh-SDK affected acceptance passed 20/20; the authorized final Domain strict check and the two repaired fixture files also pass. Lead owns final integration/build/browser acceptance.

## Changed paths

- `domain/src/runtime/capabilities.ts`: advertises `web.extract.definition` with numeric metadata version 1 and web domain on both runtime/client declarations; no action types, inputs or outputs are granted.
- `domain/src/runtime/definition-fields/capability-refusal.ts` and `index.ts` (new): one shared admission decision. An active raw text-field definition in projected columns or predicate `read` requires the selected session's matching-domain numeric integer version >=1. Missing, string, unversioned and unsupported versions fail. Malformed active anchors also require support; excluded/nontext/inactive fields and other actions retain their prior contract.
- `domain/src/io/gateway-output-dispatcher.ts`: uses the actual selected snapshot session for admission before `executeAction`. Unsupported reads return typed permanent `NOT_IMPLEMENTED` blocked failure plus a content-free upgrade message; required command contexts are stopped before return. No alternate-client fallback.
- `domain/src/runtime/llm-evidence/tools.ts`: only the production bind function's gateway wrapper and its import changed. It checks the actual selected session metadata before an extract request can reach the production gateway; factory/injected provider-free gateways remain unchanged.
- `domain/src/runtime/tests/capabilities.test.ts`: feature version and absence of executable authority.
- `domain/src/runtime/definition-fields/tests/capability-refusal.test.ts` (new): active/malformed/predicate-only versus ordinary/excluded/nontext fields; strict version/domain matrix; failure parsing and content-free text.
- `domain/src/io/tests/gateway-output-dispatcher-definition.test.ts` (new): selected-session isolation, zero unsupported versus one supported dispatch, ordinary controls, and a focused real SQLite/service required-context acceptance case. Its comment states why real persisted service state is needed; all model providers are disabled and no browser/user data is used, matching the existing `required-context.ts` approach.
- `domain/src/runtime/llm-evidence/definition-capability/tests/binding.test.ts` (new, moved during audit repair): real production bind wrapper, zero unsupported extract sends versus one supported/ordinary extract send. The fixture is a real provider-disabled FluxIQ instance with typed public snapshot, runtime-binding and action-result seams; it needs no setup or SQLite. Normal observation captures used to resolve/show the page are counted separately.
- This report only in Core. No original field-unit path, Core source, Extension source, package version, shared document, architecture, git or run artifact edited.

## Validation observed

Exact owning command:

`$env:DOMAIN_TEST_BUILD_LABEL='t838-definition-capability'; pnpm.cmd --filter @fluxiq-web-extension/domain test runtime/tests/capabilities.test runtime/definition-fields/tests io/tests/gateway-output-dispatcher-definition runtime/llm-evidence/tests/definition-capability.test`

Observed exit 1 before compiling/bundling: `FluxIQ Core ... is only partly built: 74 of the 90 compiled entry points its packages declare are missing, across fluxiq. First missing: fluxiq dist\api-contracts\index.d.ts.` **No test case ran.** This overlapped the lead's already running SDK build. No currency bypass, rebuild, full suite, browser or provider call was made. Lead requested freeze and will run the combined owning commands after that build completes.

## Review notes / limits

- The failure uses the existing constructor/code/category with no temporary-block marker; `NOT_IMPLEMENTED` is permanently blocked and nonretryable. No raw term, selector, record value or session credential is emitted. Actual parser tests remain the authority on malformed field syntax after support is established.
- Only the selected Core snapshot session is consulted; another connected client's support cannot admit it. Numeric version >=1 expresses the minimum supported feature version; capability metadata carries no executable authority.
- Original field implementation/report remain frozen and unchanged. Gateway-output dispatch itself is the canonical IO/runtime seam; the production evidence binding needs the same helper because it reaches Core's gateway directly.
- Required-context test executes a synthetic provider-disabled real service run to prove permanent refusal does not leave a required command pending. Core-currency prevention means that assertion is authored, not observed yet. No broad SQLite suite or browser was requested or run.
- Not verified: test assertions, types/build/audit, required-ledger completion, cancellation paths, installed extension handshake or mixed-version browser behavior. All remaining qualification belongs to the lead.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/field-read-repair/capability-fix.md`
Notes: Source frozen. No unchanged paid run or fixture/oracle change. Read admission is separate from action authority.

## Bounded structure-audit repair

Lead's plain audit found an `as never` fixture, a 26-file test directory, contract spreads in the captured definition tests, and an IO test reaching directly into `runtime/capabilities.ts`. These are now repaired: the bound-evidence test moved into `llm-evidence/definition-capability/tests/binding.test.ts`; it constructs a real typed FluxIQ host and uses typed Core public session/result seams without a cast escape. Its old direct evidence-tests directory is back to 25 source files. The IO import now uses `../../client`, the owning public barrel. The captured-tree test uses explicit typed `present` constructors instead of all 16 conditional/call/literal object spreads, preserving the peer-authored role/editability assertions.

Updated owning command after Core refresh:

`$env:DOMAIN_TEST_BUILD_LABEL='t838-definition-capability'; pnpm.cmd --filter @fluxiq-web-extension/domain test runtime/tests/capabilities.test runtime/definition-fields/tests io/tests/gateway-output-dispatcher-definition runtime/llm-evidence/definition-capability/tests`

Observed read-only TypeScript AST probe of the three touched test files: 0 syntax errors; 0 `as never`; 0 object spreads in the captured-tree fixture; the moved host fixture has only two named, typed snapshot/session spreads permitted by the rule. Direct evidence-tests source-file count is 25. This is a syntax/source review, not a typecheck or test run. Lead still owns plain audit and all tests after fresh Core. No production source, Core source, baseline or rule exception changed in this followup; source frozen again.

## Fresh-SDK acceptance repairs and final worker validation

Lead's first fresh SDK 0.25.5 acceptance exposed two production typing errors and five failing cases. The capability record's explicit `transient:false` was invalid: Core admits only the temporary marker `true`, while the existing `NOT_IMPLEMENTED` constructor already declares a permanent nonretryable block. Removed that override rather than casting it. The normal attribute spec reconstruction in `plan-resolution/extraction/columns.ts` now explicitly writes `definition:undefined`, satisfying the complete-wire `present` contract; anchored attribute overrides remain refused.

The schema regression looked in executable condition properties, but the existing union contract lives at `where.items.metadata.read`; corrected the test to compare the actual field/predicate metadata. Strict capability failure parsing now passes with the constructor's unchanged permanent semantics. Bound production tests originally tried literal extraction and were refused at `extraction_handle_required` before the new gate; they now expose a valid captured proposal, detect a real handle, and select projected or predicate-only columns through it. Unsupported extract sends remain exactly 0, supported/ordinary sends exactly 1.

The required-context fixture registered IO but omitted the production web runtime adapter, so its runtime session sent an extract through Core's default route without entering this Domain's dispatcher. Registered the real Domain adapter alongside IO. The test now reaches the intended production seam, stops its real service-issued required context exactly once with `NOT_IMPLEMENTED`, sends 0 browser commands, and persists the failed required-mode run. No assertion was loosened to accept any run ending.

Validation command: `$env:DOMAIN_TEST_BUILD_LABEL='t838-domain-repair-final'; pnpm.cmd --filter @fluxiq-web-extension/domain test actions/extraction/tests/schema-text-tests.test io/tests/gateway-output-dispatcher-definition runtime/definition-fields/tests runtime/llm-evidence/definition-capability/tests runtime/llm-evidence/plan-resolution/extraction/tests/columns.test` -> exit 0, `tests 20`, `pass 20`, `fail 0`, `duration_ms 5247.7926`, Core currency current. Earlier focused iterations were 17/20, 5/6, then required IO 4/4; the causes above account for every failure.

Not verified by this worker: final strict types, full combined Domain set, structure audit or browser. No package/full suite/build/Core/Extension/e2e/shared-document edit occurred in this repair. Source frozen again for lead acceptance.

## Final fixture type qualification

After the lead's combined 83/83 and clean audit, strict checking exposed incomplete new fixtures. Fixed only `llm-evidence/definition-capability/tests/binding.test.ts` and `structure/first-item/tests/definition.test.ts`: capability `kind` is explicit; the typed runtime-binding mock returns its real service; calls provide a public permission check; JSON-or-execution results are narrowed with runtime assertions and failure records parsed before use; the proposal fixture omits its forbidden `element` member. No casts, suppressions, exceptions or production edits were added.

Validation: `pnpm.cmd --filter @fluxiq-web-extension/domain check` -> exit 0, both source/test TypeScript pass, build-cache command 23105 ms. `$env:DOMAIN_TEST_BUILD_LABEL='t838-domain-fixtures'; pnpm.cmd --filter @fluxiq-web-extension/domain test runtime/llm-evidence/definition-capability/tests/binding.test runtime/llm-evidence/structure/first-item/tests/definition.test` -> exit 0, 12 passed, 0 failed, 309.4573 ms, Core currency current. Source frozen. No full suite, package build, provider or browser ran; final integration/build/browser remain lead-owned.
