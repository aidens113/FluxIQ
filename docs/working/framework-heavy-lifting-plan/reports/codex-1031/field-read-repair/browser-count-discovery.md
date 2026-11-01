# Browser count discovery — t838

Outcome: Done. Read-only diagnosis; no source edit or browser rerun.

## Finding

The eleven-row result is fully explained by the browser proof's weaker third condition. It asks whether the semantic credential value is present. Two people carry nonnumeric registration placeholders and one hiring card carries a nonnumeric requirement placeholder under that same semantic term. All three are present values, so the reader correctly keeps them. The unchanged task and eight-row oracle require an ID number.

The saved result supports no selector leakage, dropped projection or semantic-term substitution defect. No production selector change, additional test scope or record whitelist is warranted by this failure. A generic positive numeric-ID condition fits the unchanged task and this fixture while preserving the exact eight-row oracle; the lead also identified the original recorded predicate as numeric.

## Saved-artifact evidence

The first failure is retained under main downstream `test-runs/2026-10-31-t838-validation/company-browser-first-artifacts/`. The worker decoded its `trace.zip` in memory without extracting files or opening a browser. The private live artifact location was cleared during this investigation; the final comparison used the retained first-failure copy.

| Measured property | Observed |
| --- | --- |
| Initial proposed item count | 8 |
| Initial proposed field count | 11 |
| Fully loaded selected item count | 28 |
| Grid fixture card count | 28 |
| Returned records | 11 |
| Returned columns per record | 4 |
| Returned numeric-ID people | 8 |
| Returned nonnumeric-placeholder people | 2 |
| Returned hiring cards | 1 |
| Returned rows uniquely matched to grid fixture entries | 11 of 11 |
| Fixture order preserved | Yes, strictly increasing |
| Exact requested semantic credential read | 11 of 11 |
| Saved positive-numeric subset vs unchanged expected dataset | Exact equality of all four values in all 8 rows, in order |

The item recipe retains the proposal container and selects its direct article children; it has no selector union. Its complete selected count matches the whole grid, rather than a document-wide superset. The fixture renders leadership separately and deliberately reuses the same card markup, but the saved result contains the one qualifying leader only once, in grid order. The three excess rows are completely accounted for inside the grid data.

The action reports success, eleven kept rows, per-condition rejection counts `[13, 11, 11]`, and no unfiltered fallback. Filtering the eleven saved output records only by positive numeric ID leaves the eight exact expected records. This is an artifact comparison, not a new live extraction or a rerun of the changed predicate.

## Exact producers and ownership

- **Overbroad browser criterion:** `apps/extension/e2e/content/tests/extraction/tests/company-definition-fields.spec.ts`, the third `where` entry in the original saved proof, uses a presence condition. Its failed count assertion is at line 97 in the recorded source. This is weaker than the task's number requirement. The initial proposal and its raw item recipe were retained correctly.
- **Expected task semantics:** `apps/scenario-lab/src/scenarios/company-website/live-tasks.ts` defines the unchanged table request, including the ID number requirement. `apps/scenario-lab/src/scenarios/company-website/expectations.ts:39` derives the expected records from people in the two requested branches whose exact credential value is numeric. The expected count remains eight.
- **Intentional fixture contents:** `apps/scenario-lab/src/scenarios/company-website/data/team.ts` owns the two pending registrations, hiring card and full grid order. `pages/person-card.ts` renders those credential values truthfully under their semantic terms; it does not distinguish kinds by markup. `pages/team.ts` renders the leadership strip separately from the grid, and `pages/team-batch.ts` appends the grid's fixture rows. No fixture change is required.
- **Correct selector production:** `apps/extension/src/content/extraction/infer-list.ts`, `runProposal`, obtains the actual sibling run's container and calls `generalizedItemSelector`. `apps/extension/src/content/extraction/item-selector.ts`, `itemSelectorCandidates` and `selects`, require a candidate to match exactly the proposed run and provide the container-relative article recipe observed in the trace.
- **Correct production binding:** `domain/src/runtime/llm-evidence/structure/packet.ts`, `boundList`, retains `proposal.item`. This copy is consistent with the browser proof and does not widen its scope.
- **Correct condition behavior:** `apps/extension/src/content/extraction/item-filter.ts` asks Core's `automationStudioRecordConditionHolds` about the requested value. Presence admits the three nonempty placeholders. `field-reader.ts` and `definition-field/association.ts` read the exact requested term's associated value; every saved returned credential agrees with its owning fixture card.

## Validation and limits

Read-only PowerShell ZIP metadata/trace probes and PowerShell here-string scripts piped to `node --input-type=module` decoded the saved proposal, final selection count and action reply, then compared returned membership against the trusted static fixture and independently reconstructed unchanged expected dataset. Final comparison exited 0 and reported: selected 28 / grid 28; expected 8 / positive numeric saved rows 8; exact ordered four-column equality `true`; excess nonnumeric rows 3; all selected numeric IDs positive `true`.

An intermediate repeat could not find the original private `trace.zip` after that live artifact directory was cleared; it stopped before reading a trace. The repeat against the preserved first-failure copy succeeded. No guard was bypassed and no artifact was modified.

Not verified: no browser rerun with a numeric predicate, no production change, no package build/typecheck/test/full suite, no provider or paid call. No raw selectors, page/record text, model values or credentials are included here. Root owns the criterion correction and fresh browser acceptance; the exact eight-row oracle remains unchanged.
