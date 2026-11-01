# Domain definition-field repair — t838

Outcome: Done — implementation and regressions are repaired and frozen. After the lead's fresh-SDK checks, the affected worker acceptance passes 20/20; final combined/types/audit/browser checks remain lead-owned.

## Changed

All paths below are in the private t838 downstream checkout; lead-owned `request.ts`/`schema.ts` were read but not edited.

- `domain/src/actions/extraction/read-request.ts`: parses text-only `definition:{term,part}` field by field, normalizes term whitespace, rejects malformed active anchors and `lines:true` conflicts, drops inactive nontext anchors and unknown nested properties, and creates independent anchor objects.
- `domain/src/extraction/proposal.ts`: recognizes semantic HTML definition terms as structural labels, without admitting record values or arbitrary neighboring text.
- `domain/src/runtime/llm-evidence/structure/packet.ts`: preserves an independent term/part object in handle binding.
- `domain/src/runtime/llm-evidence/plan-resolution/extraction/columns.ts`: preserves the anchor during explicit required overrides and normal copies; refuses an attribute override of an anchored text field with existing `web.handle.malformed` rather than erasing identity. Lead approved that boundary.
- `domain/src/runtime/llm-evidence/structure/first-item/definition.ts` (new) and `walk.ts`: locate the exact row-owned semantic term/value in captured trees. No item, sibling-position or record-value fallback.
- Owning tests updated: `actions/extraction/tests/{read-request,schema-text-tests,recorded-definition}.test.ts`; `runtime/llm-evidence/plan-resolution/extraction/tests/{columns,conditions}.test.ts`; `runtime/llm-evidence/structure/tests/column-at.test.ts`.
- New owning test: `runtime/llm-evidence/structure/first-item/tests/definition.test.ts`.
- This report only in Core; no Core/Extension source, git, versions, shared documents or run artifacts edited.

## Source review and coordinated semantics

- Direct `dl > dt/dd` runs and `dl > div` groups are semantic entries. Consecutive distinct terms may share one definition; exactly one associated `dd` is required for either term/value reads. Unrelated children end a group.
- Default row search takes top-level lists only. An explicit selector scopes lists/containers and can deliberately select a nested list. Outer term/value contents containing another `dl` are unreadable.
- Exact whitespace-normalized matching is case-sensitive; uniqueness applies across every list in the selected row scopes. Missing or duplicate terms, missing or multiple definitions and unsupported captured selector forms never produce another pair or the item.
- Captured hidden/inert/aria-hidden, sensitivity-marked and screened content is excluded. Interactive/executable tags, control roles and contenteditable descendants are also excluded, matching the Extension worker's lists. Capture can only attest the nodes/metadata it retains; omitted raw descendants cannot be reconstructed.
- Live/captured rules, `:scope`, flat/grouped entries and scope/nesting behavior were coordinated directly with `definition_fields_extension` before freeze. Extension worker independently reported 107/107 owning tests, but that is not Domain verification.
- New tests cover parser/recording round trips and alias resistance, all explicit binding-copy seams, unprojected predicate identity, handles/samples, shifted/reordered pairs, multiple lists/scopes, duplicate/missing associations, nested lists, hidden/sensitive/screened content and ordinary interactive descendants.
- Existing conditions identity already recursively sorts all supported members, so the new nested anchor participates in field/predicate identity without a change to `conditions.ts`.

## Validation observed

Initial shell invocation using `pnpm` stopped on PowerShell execution policy for `pnpm.ps1`; using `pnpm.cmd` corrected that shell issue without changing policy.

Command:

`$env:DOMAIN_TEST_BUILD_LABEL='t838-definition-domain'; pnpm.cmd --filter @fluxiq-web-extension/domain test actions/extraction/tests/read-request.test actions/extraction/tests/schema-text-tests.test actions/extraction/tests/recorded-definition.test runtime/llm-evidence/plan-resolution/extraction/tests/columns.test runtime/llm-evidence/plan-resolution/extraction/tests/conditions.test runtime/llm-evidence/structure/first-item/tests runtime/llm-evidence/structure/tests/column-at.test`

Observed exit 1 before test bundling: `FluxIQ Core's build ... is not current with its source`; `Stale: Core's build cache would rebuild fluxiq:build: inputs changed: packages/fluxiq.` **No Domain test case ran.** No currency bypass or concurrent Core rebuild was attempted. Lead requested freeze and will refresh Core then run this command itself.

Not verified: Domain assertions, typecheck, package build, structure audit, browser acceptance, provider behavior, mixed-version admission. No full suite/browser/provider call ran.

## Remaining lead-owned integration

The prior `lines`/`marks`/`header` features have no feature capability version. `domain/src/runtime/capabilities.ts` declares generic `web.actions` and unversioned structure detection; only facts/reconcile currently have version metadata. An older Extension could ignore the new active anchor, so a feature capability/version admission guard is required. Lead accepted ownership of capability/dispatch/replay seams outside this brief; none were edited here.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/field-read-repair/domain-fix.md`
Notes: No fixture/oracle/model-guidance change. Source frozen. Lead owns remaining qualification and capability integration.

Bounded audit followup: replaced the captured-tree test's 16 forbidden contract spreads with explicit typed fixture constructors and per-key raw descriptors. Peer-authored role/editability cases remain. A read-only TypeScript AST probe reports 0 syntax errors and 0 object spreads in that test; no production field source was changed. No test/typecheck ran pending fresh Core; source frozen again.

Fresh SDK 0.25.5 followup: the attribute override's explicit `present` reconstruction now mentions `definition:undefined`, preserving the complete serialized-field contract; definition-anchored attribute overrides still refuse. Fixed the schema regression's lookup to the existing condition `metadata.read` seam. Final affected command: `$env:DOMAIN_TEST_BUILD_LABEL='t838-domain-repair-final'; pnpm.cmd --filter @fluxiq-web-extension/domain test actions/extraction/tests/schema-text-tests.test io/tests/gateway-output-dispatcher-definition runtime/definition-fields/tests runtime/llm-evidence/definition-capability/tests runtime/llm-evidence/plan-resolution/extraction/tests/columns.test` -> exit 0, 20 tests passed, 0 failed, 5247.7926 ms. Capability/production fixture corrections are detailed in `capability-fix.md`; no other original field production file changed. Final strict types/audit/broader combined tests and browser remain lead-owned. Source frozen.

Final fixture-only qualification: removed the proposal-forbidden `element` key from the explicitly typed captured-field fixture; the production-bound fixture now declares complete public capability/binding/permission/result types and performs runtime union/failure narrowing. `pnpm.cmd --filter @fluxiq-web-extension/domain check` -> exit 0, source/test TypeScript pass, 23105 ms. `$env:DOMAIN_TEST_BUILD_LABEL='t838-domain-fixtures'; pnpm.cmd --filter @fluxiq-web-extension/domain test runtime/llm-evidence/definition-capability/tests/binding.test runtime/llm-evidence/structure/first-item/tests/definition.test` -> exit 0, 12 passed, 0 failed, 309.4573 ms. No production edit, cast escape, suppression, build, full suite, provider or browser; source frozen for lead integration.
