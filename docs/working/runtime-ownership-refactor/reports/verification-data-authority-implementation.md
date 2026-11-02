# Canonical rich verification data authorities

Status: implemented; owned source and tests frozen. This completes the released data prerequisite, not all R7 mechanisms.
Brief: [verification data authority implementation](../briefs/verification-data-authority-implementation.md). Frozen map: [data authority plan](verification-data-authority-plan.md).
Repository: `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ`. All commands below ran there, provider-free, against current source.

## Canonical owner and exact names

`packages/fluxiq/src/flows/executable/verification/index.ts` owns the neutral public data barrel. Its 16 feature barrels expose 77 moved names, one additional historical base, one diagnosis-response branch, and three narrow reading functions. Each implementation/type leaf exports one authority. There are 99 production files: 82 leaves plus 17 barrels.

Every moved name below preserves the old name with only `AutomationStudio` removed. All old full names remain exact aliases or type reexports. No schema, wire literal, rich projection, optional/undefined/never allowance, readonly field or array order was simplified.

| Feature | Exact canonical exports |
| --- | --- |
| `outcome` | `ResultVerdict`, `ResultVerdictBasis`, `ResultVerification`, `ResultVerificationSkipped`, `ResultVerificationOutcome`; `resultVerificationAnswers`, `resultVerificationFailsRun` |
| `requested-output` | `ResultRequestedAnswer`, `ResultRequestedRows`, `ResultRequestedOutput`, `ResultRequestedOutputMissing` |
| `task` | `ResultTaskEffect`, `ResultTaskChecklist` |
| `repair` | `ResultRepairFinding`, `ResultRepairDirective` |
| `facts` | `ResultComputedFactKind`, `ResultComputedDefect`, `ResultComputedFact`, `ResultComputedFactsInput`, `ResultComputedFactCheck` |
| `flow` | `ResultFlowStepSummary` |
| `build-test` | `BuildTestStep`, `BuildTestLanding`, `BuildTestPass`, `BuildTestInput`, `BuildTestAccount`, `BuildTestStore`, `BuildTestNote` |
| `history` | `ResultEarlierAdvice` |
| `summary` | `ResultLeftOutNamingTheItem`, `RunResultSummary`, `ResultEndView`, `ResultReturnedValues` |
| `reads` | `ResultReadAccount`, `ResultKeptEveryRow`, `ResultWorkingRows`, `ResultNarrowingStep`, `ResultLeftOutTogether`, `ResultLeftOutObservation`, `ResultItemMark`, `ResultConditionObservation`, `ResultReadCondition` |
| `records` | `ResultRecordSetSummary`, `ResultSortRead`, `ResultProcessingCondition`, `ResultProcessingAccount` |
| `standing-no` | `ResultStandingNoCondition`, `ResultStandingNoKeptOutRow`, `ResultStandingNoCall`, `ResultStandingNoLocated`, `ResultStandingNoRecord`, `ResultStandingNoTogether`, `ResultStandingNoCarrier`, `ResultStandingNoContradiction` |
| `kept-condition` | `ResultKeptCondition`, `ResultKeptConditionsCarrier`, `ResultKeptConditionDrop` |
| `kept-step` | `ResultKeptStep`, `ResultKeptStepDrop` |
| `trial` | `SiteResetCollection`, `TrialReading`, `TrialCollection`, `TrialWitness`, `TrialPartEffect`, `TrialActOutcome`, `TrialDelta`, `TrialProof`, `TrialNotRun`, `TrialPartProof`, `TrialChangeFinding`, `TrialLeftAct`, `TrialSiteSide`, `TrialSiteLines`, `TrialSiteWitnessChange`, `TrialSiteChange`, `TrialSiteChangeUnwitnessed`; new `TrialNotRunHistory`, `readTrialNotRun` |
| `diagnosis` | `LlmDiagnosisFields`, `LlmVerificationChecked`, `LlmVerificationDefect`; new named `LlmDiagnosisResponse` for the exact existing diagnosis union branch |

Existing canonical JSON/runtime failure/record-processing authorities are imported from `@fluxiq/contracts/core`, `/runtime`, and `/records`. `ResultProcessingAccount` still derives from the actual complete SDK account with `Omit<..., "conditions">`; no selected-count substitute was introduced. `ResultComputedDefect = LlmVerificationDefect` and `TrialPartEffect = ResultTaskEffect` share only their proven identical data shapes. `ResultStandingNoLocated` retains its different exact projection.

## Old compatibility owners

All paths in this table are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`. These are the 21 production files changed outside the new canonical tree.

| Old files | Final change |
| --- | --- |
| `result-verification/contracts/{verdict,verification,requested-output,task-checklist,repair,computed-facts,flow-step-summary,build-test,earlier-advice,run-result-summary,read-account}.ts` | Pure exact type reexports to the new feature barrels. |
| `result-verification/{read-condition,record-set-summary,processing-account}.ts` | Named data declarations become exact aliases; all value functions, screening and withheld wording remain unchanged. |
| `result-verification/standing-no/types.ts` | Exact data reexports across standing-no/kept-condition/kept-step. |
| `flow-bootstrap/reset-settlement/collection-groups.ts` | Collection DTO alias only; invalid-group reader unchanged. |
| `flow-bootstrap/trial-change/contracts.ts` | Fifteen named data aliases only; live LedgerPort/Look/Session and other declarations remain unchanged. |
| `flow-bootstrap/trial-change/unwitnessed-outcome.ts` | Unwitnessed DTO alias only; existing runtime packet intersection and function unchanged. |
| `llm/harness/structured-response.ts` | Three diagnosis DTO aliases and canonical diagnosis union branch; all other branches, constants, normalization and validators unchanged. |
| `result-verification/contracts/verification-reading.ts` | Exact reexports of the two original functions under the old names, preserving function identities. |
| `result-verification/computed-facts/act-passes.ts` | Removes competing local historical DTO/guard; `notRunOf` delegates to the canonical reader. Fact arithmetic, messages and projections unchanged. |

Three immediate test files were added: canonical `trial/tests/read-not-run.test.ts`, canonical `outcome/tests/reading.test.ts`, and legacy `result-verification/contracts/tests/verification-reading.test.ts`. The identity assertion lives with the legacy facade so the canonical source/test boundary never imports Studio.

Inspection resolved one wording discrepancy in the plan: the actual named unwitnessed DTO and packet intersection have no `note` field. Their real fields/intersection were preserved; no field was invented. The optional `unwitnessed` extension remains passive data.

## Historical acceptance and authority

`TrialNotRunHistory` preserves optional label/after and numeric passes or `"every"`. The existing producer is derived as `Omit<TrialNotRunHistory, "label" | "passes"> & { label: string; passes: number[] }`; producer label/passes did not widen.

`readTrialNotRun` preserves the old filter-and-length algorithm: explicit empty list is valid; absent/malformed/partly invalid lists are undefined. It retains nonempty untrimmed node IDs, positive integer passes, duplicate/order identity, any integer `of` including zero/negative, explicit undefined at the unknown-input runtime boundary, inherited structural properties, sparse-pass `every` behavior and rejection of sparse outer lists. It neither guesses labels nor expands `"every"`. Extra diagnostic JSON remains data, with unchanged literal serialization and original entry identity.

The unchanged actual computed-fact tests preserve no-list/no-fact, empty-list/holds, typed missing acts/fail and `not_run`/fail without usable lists. The unchanged private-hint tests reject forged copies, another summary, stale rounds/Flows/replays and changed evidence. No registry/AsyncLocalStorage/WeakMap, permission, admission or completion owner was moved or weakened.

## Observed acceptance

Final normal guarded tests completed exit 0. No further guards/tests are planned. Source remained frozen throughout final acceptance; no whole Core build, full suite, provider or browser run was used.

| Exact command | Observed result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File .fluxiq/refactor/verification-authorities-readers.ps1` | 4 files, 53 tests passed, 38.29s. |
| `pnpm.cmd --filter fluxiq exec vitest run` with the sixteen explicit consumer subjects below (also retained exactly in `.fluxiq/refactor/verification-authorities-consumers.ps1`) | 16 files, 165 tests passed, 39.11s. |
| `node .fluxiq/refactor/verification-authorities-shapes.cjs` | Frozen AST: 77 exact rich authorities plus historical base and diagnosis branch; both shared aliases and strict derived producer fields verified. |
| `node .fluxiq/refactor/verification-authorities-source-review.cjs` | All 99 canonical production files match prepared UTF-8 copies after line-ending normalization; 19 old runtime functions and all 7 structured-response branches preserve unowned algorithms/types. |
| `node .fluxiq/refactor/verification-authorities-checks.cjs` | Canonical browser/data strict: 1 root, 323 source modules, 0 errors, 0 Studio/Node/own-built-output edges. Owned plus actual-consumer strict: 29 roots, 4,730 source modules, 0 errors; all 77 final old aliases have direct type identity and bidirectional assignment. |
| `node .fluxiq/refactor/verification-authorities-runtime.cjs` | Erased runtime closure: 20 source modules, 0 forbidden/unresolved/Node/Studio edges. Canonical declaration emit: 0 errors, root emitted, not skipped; ignored output only. |
| `node .fluxiq/refactor/verification-authorities-structure.mjs` | 15 official rules plus one-authority/barrel/EOF review across 123 owned files: 0 failures, 7 advisories, 0 baseline suppressions. No baseline/config writes. |

The final reader script calls `pnpm.cmd --filter fluxiq exec vitest run` with exactly:

- `src/flows/executable/verification/trial/tests/read-not-run.test.ts` (29)
- `src/flows/executable/verification/outcome/tests/reading.test.ts` (18)
- `src/programs/automation-studio/runtime/result-verification/contracts/tests/verification-reading.test.ts` (1)
- `src/programs/automation-studio/runtime/result-verification/computed-facts/tests/act-passes.test.ts` (5)

The sixteen unchanged consumer subjects, relative to `src/programs/automation-studio/runtime/`, were:

- `flow-bootstrap/trial-change/tests/packet.test.ts` (4), `proof.test.ts` (13), `findings.test.ts` (5), `unwitnessed.test.ts` (6)
- `llm/harness/tests/provider-result.test.ts` (2), `context-packet.test.ts` (6)
- `llm/deepseek/tests/response-envelope.test.ts` (31), `verdict-before-cut.test.ts` (11); these are parser unit tests with no provider calls
- `result-verification/tests/result-summary.test.ts` (24), `repair-directive.test.ts` (25), `core-observation.test.ts` (13)
- `result-verification/standing-no/tests/contradiction.test.ts` (4), `kept-conditions.test.ts` (8), `kept-together.test.ts` (5), `kept-steps.test.ts` (5)
- `result-verification/unconfirmed-inspection/tests/hint.test.ts` (3)

The strict program checks canonical types, every owned facade/slice and immediate tests, plus the real `verify.ts`, `result-summary.ts`, `service/candidate-trial/summary.ts`, `build-test/judge.ts` and structured-response consumers. It uses source paths, strict NodeNext, exact optional properties and indexed-access checking, with no incremental/built-output shortcuts. Canonical browser closure uses no Node ambient types. Declaration output stays under ignored `.fluxiq/refactor/verification-declarations`.

Pre-bridge evidence also passed bidirectional assignment for all 77 original shapes, exact AST comparison and direct generic identities for 72 shapes plus expanded strict producer. Five parent generic identities differ solely because of the required derived producer representation; their fields and assignment were proven before aliasing. Final aliases pass all 77 direct identities. An initial test annotation incorrectly described parser-accepted explicit undefined as the narrower DTO; it was changed to unknown input without widening the DTO. An initial canonical identity test's Studio edge was rejected by the audit and the assertion moved to the legacy test owner. Both final checks passed.

The seven structure advisories are the cohesive new trial directory's 20 source files (hard limit 25), existing mixed structured-response size/export count, and existing reset-settlement/trial-change/harness/result-verification directory sizes. No budget or baseline was increased.

Logs/scripts/snapshots are ignored under `.fluxiq/refactor/verification-authorities-*`; no secrets or user data were used. Read-only compatibility snapshots are task evidence, not shipped authorities.

## Remaining work and limits

Parent/public package exports and package-level integration belong to Root and were not edited here. No full suite/build, emitted package API, downstream, provider or browser behavior was verified by this worker. Root's independent control/accounting/graph checks remain Root's claims until it records them.

The actual verifier, judge orchestration, summary/screening, repair/finding algorithms, transport normalization and provider bodies remain at their existing owners. This data prerequisite enables the separately planned R7 mechanism moves; it does not claim those moves are complete. Private inspection provenance and live trial/reset/session ports remain unchanged.

Outcome: Done
Changed: canonical verification tree, 21 exact old facades/slices, 3 immediate tests, this report
Validation: 20 files/218 tests; frozen AST/source compatibility; strict source/declaration/browser/runtime closure; scoped structure/EOF -> all passed
Not verified: full builds/suites, package/downstream/live integration, remaining R7 mechanisms
Report: docs/working/runtime-ownership-refactor/reports/verification-data-authority-implementation.md
Notes: Owned source frozen; no git, agents, shared docs, config or baseline changes. No further guards planned.
