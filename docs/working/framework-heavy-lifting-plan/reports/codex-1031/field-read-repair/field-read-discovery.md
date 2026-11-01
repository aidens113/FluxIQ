# Field-read discovery — 2026-10-31

Outcome: Done
Changed: this report only; source, git, builds and run artifacts untouched.

## Finding

The product's detected field identifies a position in a definition list, not the definition term's identity. The model selected the correct-looking detected term/value columns from their samples. On a later card, a different credential occupies that position, so the same reader silently reads that credential instead. This is field-inference/row-reader behavior, not a freehand broad selector authored by the model and not a dropped output column.

## Actual artifact evidence

- All ordinal references below are zero-based unless explicitly called a sibling pair.
- `steps/0008-tool-web.detect_repeating_structure/result.json`: 8 initial cards, 13 detected fields. Detected fields 8/10 represent the second sibling definition pair's term/value; fields 11/12 represent the third pair's term/value. Term/value coverage for the second pair is 0.5; third-pair coverage is 0.13.
- The pair positions come from the original path-derived keys, not the model-facing sample labels. Keys encode the definition-list container, sibling-pair position and term/value element. Raw keys, CSS and page values are withheld here.
- `steps/0012-tool-core.run_node/call.json`: the authored node is `web.output.dom-extract_list`; its four output fields select detected keys 1, 2, 6 and 10. Predicate 1 names detected key 8 with an equality comparison. Its requested equality value exactly equals that detected field's initial sample. Every field names a detected key; no freehand CSS is supplied.
- `steps/0055-test-core.run_node/call.json`: final replay retains those four choices and three predicates. The second condition still names detected key 8; it was never repaired into a term-anchored read.
- `steps/0055-test-core.run_node/result.json`: 7 kept labels; exactly 1 row is rejected by predicate 1 alone. Its observation is `state=present`, `source=read`, `readKind=text`, page 1, item 26. The observed term is different from the requested term.
- `steps/0056-judge/request.json`, parsed `messages[0].content.context.resultSummary.endView.view.page`: relative to that rejected row's heading, offset +4 is exactly the observed earlier term, +5 is another numeric credential, +6 is the required term and +7 is its numeric value. The desired pair exists on the same card; it merely sits one pair later.
- The same request's screened `flowShape[7].parameters.extractList.where.items[1]` is a text `read`, not a named kept column. This agrees with the resolver converting the unprojected detected term to a private predicate reader.
- Literal resolved CSS is intentionally absent from these supplied step artifacts. The exact positional recipe is established by the path-derived detected keys, the source transformation below and the independent measured page/observation correspondence; no retained raw command selector was claimed.

## Cause and ownership

- `apps/scenario-lab/src/scenarios/company-website/pages/person-card.ts:14` renders each credential as the same term/value-pair markup in its input order. An optional preceding pair legitimately changes the requested pair's position. This fixture behavior is achievable and needs no change.
- `apps/extension/src/content/extraction/infer-fields.ts:560` prefers an own name but falls back to a relative path. `:623` builds that path; `:670` falls back to sibling ordinal when same-tag siblings have the same styling/attributes. No definition-term identity is retained.
- `apps/extension/src/content/extraction/infer-fields.ts:225` applies `separateKinds`, but `template-kind/element-kind.ts:26` and `same-kind.ts:11` distinguish markup kind, not the semantics of a definition term. Same-markup credential pairs therefore remain one positional field.
- `domain/src/runtime/llm-evidence/structure/packet.ts:400` binds the detected specs, and `:447` copies their supported properties. `plan-resolution/extraction/columns.ts:176` keeps the chosen detected spec. `conditions.ts:190` turns the chosen unprojected term into `read: column.field`. No later incorrect name guess is needed to produce this failure.
- `apps/extension/src/content/extraction/field-reader.ts:74` executes the retained relative selector with `querySelector`. Here it selects exactly the wrong positional pair; replacing first-match selection alone would not recover the requested term.

## Output projection

The replay's records output has all four requested columns. `0055.../meta.json.outputs.records.fields` contains 4 fields and matches both the authored schema IDs and selected read-field names exactly. `0056.../buildTest.stores[0]` reports 1 pass, 7 collected/answer rows, 0 duplicates, 0 post-read filtering and 0 cuts. The name-only `readRows.rows` is deliberate diagnostic labeling (`domain/src/runtime/llm-evidence/node-run/replay-answer.ts:419`), not the records projection. There are 0 persisted record sets because this build never reached accepted completion. `call.input.produced.records=8` is carried original-step metadata, not the final replay's count.

## Smallest general repair proposal

Preserve an exact, row-owned definition-term association for inferred term/value fields. Infer a structural label from a real semantic term and read its associated term/value within each row, independent of sibling position. Keep distinct terms distinct even when their markup is identical. Absence or ambiguous duplicate labels must remain unresolved; never choose another credential, use first/last position, guess by sample value or add scenario-specific guidance.

Exact ownership/edit paths (new helper filenames are proposed; retain these directory boundaries):

- Domain wire/parser: `domain/src/actions/extraction/request.ts`, `read-request.ts`, `schema.ts`; `domain/src/extraction/proposal.ts`. Add one serialized exact semantic-term/part association and validate it without silently dropping it; fix this interface before dependent implementation.
- Domain binding: `domain/src/runtime/llm-evidence/structure/packet.ts:447`; `domain/src/runtime/llm-evidence/plan-resolution/extraction/columns.ts:300` and `:335` (both explicit spec copies, required override and attribute override). Preserve the association through every copy. `conditions.ts` already passes the selected spec as a predicate read; add a preservation regression there.
- Domain evidence: `domain/src/runtime/llm-evidence/structure/first-item/walk.ts`; proposed helper `first-item/definition.ts` and any needed barrel. Resolve the same exact term and associated value on the captured tree; preserve correct `at`, samples and coverage evidence rather than treating a selector-less anchor as the whole item.
- Domain owning tests: `domain/src/actions/extraction/tests/{read-request,schema-text-tests,recorded-definition}.test.ts`; `domain/src/runtime/llm-evidence/plan-resolution/extraction/tests/{columns,conditions}.test.ts`; `domain/src/runtime/llm-evidence/structure/first-item/tests/definition.test.ts` (new), and `structure/tests/column-at.test.ts`.
- Extension inference/read: `apps/extension/src/content/extraction/{infer-fields,field-reader,field-spec,content-fields}.ts`; proposed `definition-field/{association,index}.ts`. `infer-fields.ts` owns source deduplication identity, spec emission, described-value sampling and `resolvesIn` coverage; all must use the same association. Inspect/own `path-equivalence/prune.ts` and `template-kind/kind-columns.ts` so positional rewriting/pruning cannot erase or conflate an anchored field.
- Extension owning tests: `apps/extension/src/content/extraction/tests/{infer-fields,field-reader,item-filter}.test.ts`; proposed `definition-field/tests/association.test.ts`. Normalize full inferred specs in test helpers: the existing inference-test helper copies only kind/selector, which would otherwise erase a new anchor before testing it.
- Extension picker round trip: `apps/extension/src/shared/extraction-messages.ts`; `apps/extension/src/background/extraction/definition.ts:159` and `:183`; `apps/extension/src/panel/extraction/{view-model,confirm-payload}.ts`. These explicit flattened spec copies currently keep only the known properties. Add preservation tests in `background/tests/extraction-confirm.test.ts` and `panel/extraction/tests/{view-model,confirm-payload}.test.ts`; do not add an implementation detail to the user-facing controls.
- Lead browser seam: proposed `apps/extension/e2e/content/tests/extraction/tests/company-definition-fields.spec.ts`, using the existing realistic `company-website` content harness and normal `extraction.propose`/`web.dom.extract_list` paths. Existing `structure-detection.spec.ts:298` demonstrates the site's real team/load-more entry. Prove all matching cards including the differently ordered credential, exact four-column values/order and no unrelated credential substitution; also exercise normal detection-handle binding through Domain tests.
- Lead documentation/integration: `docs/architecture/web-capabilities.md` and `docs/architecture/page-evidence.md`, plus task ledger. No fixture/task/oracle changes and no Core framework change are needed to fix positional identity itself.
- Explicit policy decision: `domain/src/extraction/proposal.ts:16` forbids in-item text as a proposed label. Classify real semantic definition terms as structural labels, like table headers, while preserving exclusion of record values, privacy screening and sensitive regions. Do not broadly admit arbitrary neighboring text.

Regression acceptance: same-label value at second and third pair positions; reorder/insert/remove other pairs; a later card not present during detection; different labels with identical markup; missing and duplicate labels; nested definition lists; sensitive labels/values; all four output columns and the exact nonempty expected row count. Use unrelated synthetic examples for unit cases and the unchanged realistic scenario for private provider-free acceptance.

Suggested narrow commands (not run; discovery forbids builds):

- `pnpm --filter @fluxiq-web-extension/extension exec node scripts/test-extension.mjs content/extraction/tests/infer-fields.test content/extraction/tests/field-reader.test content/extraction/tests/item-filter.test content/extraction/definition-field/tests background/tests/extraction-confirm.test panel/extraction/tests/view-model.test panel/extraction/tests/confirm-payload.test`
- `pnpm --filter @fluxiq-web-extension/domain test actions/extraction/tests/read-request.test actions/extraction/tests/schema-text-tests.test actions/extraction/tests/recorded-definition.test runtime/llm-evidence/plan-resolution/extraction/tests/columns.test runtime/llm-evidence/plan-resolution/extraction/tests/conditions.test runtime/llm-evidence/structure/first-item/tests runtime/llm-evidence/structure/tests/column-at.test`
- `pnpm --filter @fluxiq-web-extension/extension test:content -- company-definition-fields` after the targeted source/build refresh, under lead supervision; this is provider-free realistic-site browser acceptance, not a paid Lab run.
- Typechecks of the two touched packages and the repository structure audit, followed by lead-owned unchanged-scenario provider-free acceptance; no full-suite or paid rerun for this diagnosis.

Validation: read-only Node artifact probes -> exact detected-key selections, predicate/sample equality, missing-row offset correspondence, 7 collected rows and 4 matching records-output fields confirmed; source-path trace -> positional inference, spec propagation and row read confirmed.
Not verified: no source fix, compilation, unit/browser test, paid/provider call or accepted saved Flow/replay. Resolved literal CSS was screened out of the supplied artifacts.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/field-read-discovery.md`
Notes: Task/oracle unchanged. No page/model values or selectors copied into this report. Core judge/stop-loop diagnosis belongs to the other discovery report.
