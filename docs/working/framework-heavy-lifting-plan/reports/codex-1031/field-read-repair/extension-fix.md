# Extension exact definition fields — t838

Outcome: Done. Extension source frozen after the final narrow run.

## Change

The live field reader and inference coverage share `definitionAssociations`: exact whitespace-normalized semantic terms resolve within the row's own top-level definition lists, or lists under an explicit selector scope. Flat direct `dt`/`dd` runs and direct `dl > div` groups are supported. Consecutive terms may share one definition; each requested term must be globally unique in its scope and have exactly one associated value, for both term and value reads. Missing, duplicate, multi-value or blocked pairs remain unreadable. Explicit nested-list scopes work, while an outer pair never adopts a nested term or reads a nested list as part of its value.

Inference replaces definition-list positional text candidates with exact term/value fields, including fields first discovered beyond the initial sample. Different semantic terms with identical markup remain distinct in source identity, kind rewriting and path pruning. Coverage, later-row reads and private predicate reads retain the same association. Only structural term labels enter proposals or keys; definition values are never sampled for those names.

Hidden/inert/ARIA-hidden, computed-undrawn, sensitive, ordinary control and nested-list content is screened before structural term text is read. Excluded columns remain omitted from previews. Active malformed metadata and `lines: true` with a definition are refused; inactive metadata on non-text readers is left behind. Detection, panel draft, confirmation, default columns, preview, recorded definition and runnable-request copies retain detached term/part metadata without new UI controls.

The lead approved the focused `definition-field/inference.ts` extraction so `infer-fields.ts` remains 799 physical lines, within the 800-line budget. No baseline was changed.

## Changed files

All source files are in private `C:/Users/osrs_/FluxStuff/fxwork/t838/!FluxIQWebExtension/`:

- `apps/extension/src/content/extraction/{infer-fields,field-reader,field-spec,content-fields}.ts`
- `apps/extension/src/content/extraction/definition-field/{association,inference,index}.ts`
- `apps/extension/src/content/extraction/definition-field/tests/association.test.ts`
- `apps/extension/src/content/extraction/path-equivalence/prune.ts`
- `apps/extension/src/content/extraction/template-kind/kind-columns.ts`
- `apps/extension/src/content/extraction/tests/{infer-fields,field-reader,item-filter}.test.ts`
- `apps/extension/src/shared/extraction-messages.ts`
- `apps/extension/src/background/extraction/definition.ts`
- `apps/extension/src/background/tests/extraction-confirm.test.ts`
- `apps/extension/src/panel/extraction/{view-model,confirm-payload}.ts`
- `apps/extension/src/panel/extraction/tests/{view-model,confirm-payload}.test.ts`

## Validation

Final command, private downstream worktree:

```powershell
$env:EXTENSION_TEST_BUILD_LABEL = 't838-definition-fields'; pnpm.cmd --filter @fluxiq-web-extension/extension exec node scripts/test-extension.mjs content/extraction/tests/infer-fields.test content/extraction/tests/field-reader.test content/extraction/tests/item-filter.test content/extraction/definition-field/tests background/tests/extraction-confirm.test panel/extraction/tests/view-model.test panel/extraction/tests/confirm-payload.test | Select-Object -Last 12
```

Observed: `# tests 108`, `# pass 108`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# duration_ms 1445.2693`; command exit 0. Cases prove reordered/inserted/removed pairs, unseen later rows, late same-markup semantic terms, missing/duplicate/ambiguous values, nested lists and explicit scopes, case-sensitive matching with whitespace normalization, hidden/sensitive/control privacy before text access, four exact output values, private predicate observations, pruning/kind separation and every explicit picker copy.

Earlier observations: the first `pnpm` spelling stopped before tests because PowerShell refused `pnpm.ps1`; `pnpm.cmd` used the existing executable without changing policy. First authored run passed 107/107. After the approved helper extraction and extra pruning regression, the owning run passed 108/108; the final run above followed the last copy/comment edits. No Core guard or build bypass was used.

Not verified: package typechecks, structure audit, extension bundles, browser behavior, realistic-site acceptance, capability negotiation, older mixed-version clients and all full suites. These are lead-owned; no browser/provider/paid call, package build, Git mutation, shared-document edit or unowned source edit was performed. The unit runner wrote only its normal ignored test scratch output.

Notes:
- Domain worker `/root/field_read_discovery` owns synchronized wire/parser, captured-tree evidence and plan-binding changes; the shared association rules were coordinated directly.
- Existing `lines`/marks lack independent capability negotiation. The lead owns the new semantic-field capability and dispatch gates; an old Extension would otherwise ignore metadata and fall back to its old whole-item behavior.
- No task, fixture, oracle, scenario-specific guidance or actual page sample was changed or copied.

## Lead-requested guard parity followup

Outcome: Done; the four followup source/test files are frozen.

The lead found the captured helper checked an entire role string while the live helper checked individual tokens, and both recognized only `contenteditable="true"`. The two helpers now check each whitespace-separated role token case-insensitively and reject the native editable attribute forms `""`, `"true"` and `"plaintext-only"`, including case variants. Explicit `"false"` remains noneditable. Existing self, parent and descendant checks remain in place; no other privacy behavior was broadened.

Additional/revisited owned files:

- `apps/extension/src/content/extraction/definition-field/association.ts`
- `apps/extension/src/content/extraction/definition-field/tests/association.test.ts`
- `domain/src/runtime/llm-evidence/structure/first-item/definition.ts`
- `domain/src/runtime/llm-evidence/structure/first-item/tests/definition.test.ts`

Direct regressions cover mixed-case fallback control roles, all three editable forms, the selected term/value, enclosing content and descendants. Live term/value getters throw on text access, proving blocked content is screened before text access. Matching live/captured cases retain successful exact reads for explicit noneditable fields with ordinary fallback roles.

Final followup validation:

```powershell
$env:EXTENSION_TEST_BUILD_LABEL = 't838-definition-fields'; pnpm.cmd --filter @fluxiq-web-extension/extension exec node scripts/test-extension.mjs content/extraction/definition-field/tests | Select-Object -Last 12
```

Observed: `# tests 8`, `# pass 8`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# duration_ms 286.1206`; command exit 0. The same direct run before the test type annotation also passed 8/8. No Domain runner, package typecheck/build, browser/provider call or Core build was run by this worker in the followup. Captured regressions remain pending the lead's fresh-Core Domain acceptance; the Core currency guard was neither bypassed nor invoked during its concurrent SDK build.

## Final owning-barrel import correction

Outcome: Done; source and report frozen.

The lead's downstream structure audit identified one direct cross-directory test import in `apps/extension/src/background/tests/extraction-confirm.test.ts`. Its three definition helpers now join the file's existing `../extraction` barrel import. That barrel already exports the helpers, so no barrel or runtime source change was required and no new runtime dependency was introduced. No baseline changed.

Final narrow command:

```powershell
$env:EXTENSION_TEST_BUILD_LABEL = 't838-definition-fields'; pnpm.cmd --filter @fluxiq-web-extension/extension exec node scripts/test-extension.mjs background/tests/extraction-confirm.test | Select-Object -Last 12
```

Observed: `# tests 11`, `# pass 11`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# duration_ms 430.0851`; command exit 0, wall time 2.224 seconds. Structure-audit revalidation remains lead-owned. Only the test import and this durable report changed for this correction; no other source, test, baseline or build was changed or rerun.

## Strict test narrowing correction

Outcome: Done; source and report frozen.

The lead's strict Extension check identified two possibly-undefined accesses in the new preview-copy regression in `apps/extension/src/background/tests/extraction-confirm.test.ts`. The test now asserts that the preview field exists and is an object before accessing its definition. This real narrowing replaces the two casts; it adds no cast, non-null escape or weakened assertion. Production code is unchanged.

The same narrow command above, selecting only `background/tests/extraction-confirm.test`, passed after this correction: `# tests 11`, `# pass 11`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# duration_ms 301.4011`; command exit 0, wall time 1.270 seconds. No package check/build, browser test or full suite was run while the lead prepared the Domain prerequisite. Strict package revalidation remains lead-owned.
