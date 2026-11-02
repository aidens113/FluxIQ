# Verification data: sole authority prerequisite

Status: READ-ONLY discovery complete. This report is the only change. No tests, build, source edits, git or agents.
Dispatch: [verification-data-discovery brief](../briefs/verification-data-discovery.md).
Scope: serial rich-data prerequisites in [verification ownership plan](verification-ownership-plan.md). Existing canonical control/accounting were not re-audited.

## Move and alias map

All paths below are relative to `packages/fluxiq/src/`. Old type names in the table omit **only** their common `AutomationStudio` prefix. Preserve those full old names through type aliases/reexports. Suggested canonical names remove that prefix; do not change wire literals, fields or semantics during the move. Split grouped exports into the listed narrow leaves, one declaration per leaf, with feature barrels owned by the lead.

Canonical base `V` = `flows/executable/verification/`.

| Existing sole declaration | Existing exports (prefix rule above) | Exact dependencies | Proposed canonical leaves under V |
| --- | --- | --- | --- |
| `programs/automation-studio/runtime/result-verification/contracts/verdict.ts` | ResultVerdict, ResultVerdictBasis | none | `outcome/verdict.ts`, `outcome/basis.ts` |
| `contracts/verification.ts` | ResultVerification, ResultVerificationSkipped, ResultVerificationOutcome | standing-no carrier; repair directive; requested-output missing; verdict/basis; runtime failure | `outcome/verification.ts`, `outcome/skipped.ts`, `outcome/outcome.ts` |
| `contracts/requested-output.ts` | ResultRequestedAnswer, ResultRequestedRows, ResultRequestedOutput, ResultRequestedOutputMissing | Rows; Output for Missing | `requested-output/{answer,rows,output,missing}.ts` |
| `contracts/task-checklist.ts` | ResultTaskEffect, ResultTaskChecklist | requested answer | `task/{effect,checklist}.ts` |
| `contracts/repair.ts` | ResultRepairFinding, ResultRepairDirective | exact LlmVerificationDefect | `repair/{finding,directive}.ts` |
| `contracts/computed-facts.ts` | ResultComputedFactKind, ResultComputedDefect, ResultComputedFact, ResultComputedFactsInput, ResultComputedFactCheck | summary; requested output; computed defect/kind/fact | `facts/{kind,defect,fact,input,check}.ts` |
| `contracts/flow-step-summary.ts` | ResultFlowStepSummary | canonical JsonObject/JsonValue | `flow/step-summary.ts` |
| `contracts/build-test.ts` | BuildTestStep, BuildTestLanding, BuildTestPass, BuildTestInput, BuildTestAccount, BuildTestStore, BuildTestNote | canonical JSON; Step outcome; Landing/Pass/Input/Store/Note | `build-test/{step,landing,pass,input,account,store,note}.ts` |
| `contracts/earlier-advice.ts` | ResultEarlierAdvice | none | `history/earlier-advice.ts` |
| `contracts/run-result-summary.ts` | ResultLeftOutNamingTheItem, RunResultSummary, ResultEndView, ResultReturnedValues | JSON; record sets; build-test account; computed facts; earlier advice; flow steps; reads; checklist; full trial packet/finding | `summary/{left-out-naming,run,end-view,returned-values}.ts` |
| `contracts/read-account.ts` | ResultReadAccount, ResultKeptEveryRow, ResultWorkingRows, ResultNarrowingStep, ResultLeftOutTogether | read condition/item mark | `reads/{account,kept-every-row,working-rows,narrowing-step,left-out-together}.ts` |
| `result-verification/read-condition.ts` | ResultLeftOutObservation, ResultItemMark, ResultConditionObservation, ResultReadCondition | LeftOutObservation; ItemMark | `reads/{left-out-observation,item-mark,condition-observation,condition}.ts` |
| `result-verification/record-set-summary.ts` | ResultRecordSetSummary, ResultSortRead | JSON; exact result processing account | `records/{set-summary,sort-read}.ts` |
| `result-verification/processing-account.ts` (types only) | ResultProcessingCondition, ResultProcessingAccount | existing record processing account via `@fluxiq/contracts/records` | `records/{processing-condition,processing-account}.ts` |
| `result-verification/standing-no/types.ts` | ResultStandingNoCondition, ResultStandingNoKeptOutRow, ResultStandingNoCall, ResultStandingNoLocated, ResultStandingNoRecord, ResultStandingNoTogether, ResultStandingNoCarrier, ResultStandingNoContradiction | one another, no runtime imports | `standing-no/{condition,kept-out-row,call,located,record,together,carrier,contradiction}.ts` |
| same `standing-no/types.ts` | ResultKeptCondition, ResultKeptConditionsCarrier, ResultKeptConditionDrop | standing-no kept-out row | `kept-condition/{condition,carrier,drop}.ts` |
| same `standing-no/types.ts` | ResultKeptStep, ResultKeptStepDrop | none | `kept-step/{step,drop}.ts` |

Except the first full row, `contracts/*` and `result-verification/*` abbreviate the same old runtime result-verification owner. `contracts/index.ts` is only a facade, not another declaration owner.

**Existing canonical dependencies:** import failure from `@fluxiq/contracts/runtime`, preserving the current failure shape; import record processing from `@fluxiq/contracts/records`. Its sole source is `packages/contracts/src/record-sets/process/types.ts`, not the old automation-studio entry. Keep `ResultProcessingAccount = Omit<RecordProcessingAccount, "conditions"> & { conditions?: ResultProcessingCondition[] }`; do not replace it with selected counts. This preserves passes, hidden sort keys, below-minimum/kept-none and future fields inherited from that actual owner. Do not duplicate graph/trace/draft/reference-time/model/provider/ledger or intervention receipt declarations.

Two currently identical data shapes may use one exact shared base: LlmVerificationDefect and ResultComputedDefect have the same kind/row/optional column/value/step/requestWords fields; TrialPartEffect and ResultTaskEffect have the same change/end-state union. Preserve both public names as aliases. This unifies data declarations only: a model defect is not thereby a Core-located finding or private proof. StandingNoLocated has different optional `| undefined` allowances and lacks requestWords, so it must retain its exact projected shape.

## External packet and diagnosis closure

These are type prerequisites, not authorization to move the mixed source modules.

| Sole source | Exact declaration slice | Proposed canonical leaves under V |
| --- | --- | --- |
| `flow-bootstrap/reset-settlement/collection-groups.ts:8` | SiteResetCollection: scope, group, subjects, states | `trial/source-collection.ts`; old reset type aliases this exact declaration |
| `flow-bootstrap/trial-change/contracts.ts` | TrialReading, TrialCollection, TrialWitness, TrialPartEffect, TrialActOutcome, TrialDelta | `trial/{reading,collection,witness,part-effect,act-outcome,delta}.ts` |
| same | TrialProof, TrialNotRun, TrialPartProof, TrialChangeFinding, TrialLeftAct | `trial/{proof,not-run,part-proof,finding,left-act}.ts` |
| same | TrialSiteSide, TrialSiteLines, TrialSiteWitnessChange, TrialSiteChange | `trial/{side,lines,witness-change,packet}.ts` |
| `flow-bootstrap/trial-change/unwitnessed-outcome.ts:32` | TrialSiteChangeUnwitnessed: steps with optional label + ranAs, parts, said, optional omitted | `trial/unwitnessed.ts`; preserve the existing packet intersection's optional note |
| `llm/harness/structured-response.ts:76` | LlmDiagnosisFields | `diagnosis/fields.ts` |
| same :114/:130 | LlmVerificationChecked, LlmVerificationDefect | `diagnosis/{checked-cell,defect}.ts` |
| same :14-25 | the exact diagnosis response branch: kind, summary, optional confidence/diagnosis/metadata, `truncatedAfterVerdict?: true` | `diagnosis/response.ts`; old complete response union references it |

The complete diagnosis fields are **expected, observed, changed, stillAchievable, deterministicRecoveryPossible, explorationNeeded, patchNeeded, answersRequest, defects, checked**, all with their existing optionality and literal unions. Do not promote a verification-only subset and leave a second recovery diagnosis definition. The full structured-response union's other imports (bootstrap plan, change-proposal patches, consequences, fact conditions, handler/lifecycle types, draft amendments) belong to other response branches and are not dependencies of this slice.

The packet keeps all before/after side variants, opaque tokens/host readings, act/pass/row attribution, left-from-earlier acts, every proof (`none/shown/no_change/already_in_end_state/carried/unproven/contradicted/not_run`), not-run explanations, findings and omission counts. Keep `unwitnessed` as the existing diagnostic extension: its presence does not authenticate source coverage or completion.

**Leave live types/values outside the data barrel:** trial-change LedgerPort, Look, Session.finish and their current execution context/witness helpers. Their source witnesses may be opaque original objects; do not serialize them. Leave the reset invalid-collection-groups function at its existing owner during this type-only move. Only its collection DTO is needed here.

## Historical notRun compatibility: explicit resolution

The current producer declaration requires `label: string` and `passes: number[]`. The actual historical decoder in `computed-facts/act-passes.ts:28,61-74` accepts optional label and `passes: "every"`. Existing `computed-facts/tests/act-passes.test.ts` explicitly exercises a no-label `"every"` record.

Freeze one canonical historical record declaration and derive the stricter existing producer type from it, rather than keeping local StepNotRun competing with TrialNotRun:

```ts
type TrialNotRunHistory = {
  nodeId: string;
  label?: string;
  reason: "guarded" | "unreached";
  after?: string;
  passes: number[] | "every";
  of?: number;
};
type TrialNotRun = Omit<TrialNotRunHistory, "label" | "passes"> & {
  label: string;
  passes: number[];
};
```

Put these in `trial/not-run-history.ts` and `trial/not-run.ts`, with one canonical `trial/read-not-run.ts` historical decoder. Old TrialNotRun remains an exact alias of the strict producer view. Keep packet/proof producer types unchanged; the historical reader accepts unknown and returns the historical view. Remove the old local DTO/guard only when switching that consumer to this reader.

Preserve the decoder's observed acceptance exactly: nonempty nodeId without added trimming; optional string label/after; `"every"` or a nonempty list of positive integers; optional **any integer** of (currently 0/negative accepted); all-or-nothing list validation. Do not silently sort/dedupe, require a positive of, fabricate a label or expand "every" into guessed pass numbers. The list itself may be valid empty; absence/malformed input stays undefined, never converted to [].

Preserve the consuming behavior: no notRun means no new act-pass fact; explicit empty gives holds except a `not_run` proof still fails; malformed/partial lists do not grant holds; a `not_run` proof with no usable list fails at part level. Stronger future storage validation requires a separate intentional compatibility change.

## Non-type dependencies and private authority

- `processing-account.ts` also implements `automationStudioResultProcessingAccount` and calls `screenAutomationStudioLlmEvidence`. Move **only its types** now. Keep function/screening/withheld wording at the old owner; canonical data cannot import the Studio LLM barrel. It preserves undefined-denied-keys versus declared empty keys, per-condition numbering, labelled rows and `(withheld)`.
- `contracts/verification-reading.ts` exports two real pure values: answers checks verdict alone; fails-run exempts model_disagreed and model_unconfirmed. Place one actual implementation each at `V/outcome/answers.ts` and `fails-run.ts`, reexport old functions exactly; do not copy these as separate guards in control/accounting.
- `AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH = 500`, normalization and provider-result validators remain their existing harness value authorities in this bounded move. The new data declarations require no parser/value imports.
- The transport owns `truncatedAfterVerdict`: the existing cut reader sets it, response-envelope drops a model's own claim on an uncut response, provider-result allows exactly true or absent, and normalization/safe projections preserve it. Keep those writers/readers intact. The type move must not add a model-schema issuer, coerce truthy values or infer it from summary text.
- **Private source stays untouched:** `unconfirmed-inspection/hint.ts` owns AsyncLocalStorage and the single WeakMap. It binds the exact hint, exact summary object + JSON snapshot, original scope, round and flow/replay signatures. Copies, changed summaries and cross-round hints are not original hints. Move the passive readonly unconfirmedInspection carrier fields in ResultVerification unchanged; do not export/serialize/recreate Scope/Issued/registry or replace `forSummary/forCurrent/forRound` with structural tests. Its value() projection is explanatory data, not the hint capability.
- Standing-no/kept-condition/kept-step records are rich Core-only comparison data. Preserve them outside model feedback; they are neither executable addresses nor the separate private inspection capability. No carrier grants inspection, admission, completion, permission, acceptance or promotion.

## Ordered bounded implementation brief for release

1. **Freeze shared external data first.** Own the exact collection type, the passive trial packet/proof slice and existing unwitnessed note, and the three diagnosis declarations plus diagnosis-response branch. Old modules alias/reexport them. Canonical data exports no runtime ports, provider request graph or private registry. Freeze the history/producer distinction and decoder contract above before changing act-passes.
2. **Move verification/read/record/history data.** Own only the declarations in the main table plus old type facades. Retarget canonical JSON/runtime/records imports. Preserve every existing schema literal (`automation-studio.*.v1`), explicit optional `| undefined`, literal-true flags, readonly hints/claims, nullable array entries, present-value versus `value?: never`, union branches, array order and free-text fields. Keep all listed fields; do not replace rich records by counts/statuses.
3. **Integrate exact narrow values/reader and prove consumers.** Move the two reading values once, wire the single history decoder into act-passes, leave processing screen/private hint/transport issuers unchanged. Lead owns parent/package barrels and common service/candidate consumers. Existing canonical control/accounting stay frozen and consume the new aliases; no rediscovery or duplicate ledger.

**Proposed checks after source release; none run here:**
- Strict isolated canonical barrel plus exact old/new bidirectional type fixtures with exactOptionalPropertyTypes/noUncheckedIndexedAccess; rich fixtures covering all schema branches and explicit undefined/never/readonly distinctions. Include erased type/value closure with no Studio, provider, Node private-registry or runtime-to-engine edges.
- `result-verification/computed-facts/tests/act-passes.test.ts`; new canonical historical-reader tests for every compatibility row above.
- `flow-bootstrap/trial-change/tests/{packet,proof,findings,unwitnessed}.test.ts`; old/new data consumer type identity and complete packet fixture parity.
- `llm/harness/tests/{provider-result,context-packet}.test.ts` and provider-free `llm/deepseek/tests/{response-envelope,verdict-before-cut}.test.ts` for the transport marker/complete diagnosis closure.
- `result-verification/tests/{result-summary,repair-directive,core-observation}.test.ts`; `standing-no/tests/{contradiction,kept-conditions,kept-together,kept-steps}.test.ts`; `unconfirmed-inspection/tests/hint.test.ts` unchanged, including copied/stale/cross-round refusal.
- Existing canonical control/accounting focused checks chosen by the lead, then scoped official AST/structure/whitespace checks. No baseline/config changes or full suite.

Outcome: Done
Changed: this report only
Validation: named sole declarations, type closure and compatibility reader inspection -> complete move/alias map and ordered release brief
Not verified: tests, typecheck, bundle/source closure, runtime or built-package integration
Report: docs/working/runtime-ownership-refactor/reports/verification-data-authority-plan.md
Notes: No source release assumed. Existing R5/R6/control/accounting sources remain frozen. No processes left running.
