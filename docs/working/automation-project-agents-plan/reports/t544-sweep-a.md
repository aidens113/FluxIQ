# t544-sweep-a: Group A fixtures (service adaptation, refuted result, in-run repair), plus the instruction-scope fix

## Outcome

Done. All 21 Group A files pass. On the supervisor's two follow-ups I fixed the product defect the first pass had stopped on, an instruction leak from one Flow into another. It is fixed in both copies: the SQL instruction listing and the summary store's own index and in-memory filters. It has a regression test and a parity test, and the test that had been stopped passes. No product gate was relaxed, and the shared `service-fixtures.ts` is unchanged.

## What changed and why

### Group A fixtures (test-only)

Every first-run failure was the t519 refusal "Write active instructions in this automation's Instructions before running or building it" (78 direct errors, plus the assertion failures that follow from it). No Group A file failed on a recording description. I fixed each file the way t543 did: right after the statement that creates the Flow, the test saves an active written instruction with `service.saveFlowGenerationInstruction({ projectId, flowId, instruction })`. The text is generic ("Run the Flow's steps in order and return its result.") and not shaped like any scenario.

What each file lacked (number = Flow creations given an instruction):
- `in-run-repair/tests/service-proofs.test.ts`: `flow()` helper, 1.
- `refuted-result/tests/reauthor-service.test.ts`: the concurrent other Flow `flow.public-concurrent`, 1.
- `service-adaptation/tests/`:
  - adaptive-loop 2
  - adaptive-retry-resume 1
  - caller-paid-result-check 1
  - context-history-reads 1 (only `flow.run-start-history`; `blankFlow` left alone because `flowWithOneAdaptation` saves its own instruction)
  - durable-patches 3
  - failed-start 1
  - iterating-recovery 2
  - judged-promotion 1
  - judged-run-evidence 1
  - llm-diagnosis 8
  - llm-run-caller 5
  - modes 5
  - recovery-trace 2
  - retry-result-verification 1
  - run-consequence-permission 1
  - runtime-patches 3
  - subflow 6
  - unattended-repair-authority 1
  - unattended-retry-verification 1

Two expectations were stale once the refusal stopped hiding them:
- `caller-paid-result-check.test.ts:283`: t530 (`d6f6e88d`) now ends a run summary with "This run did not keep a change for future runs." (its own `run-flow.test.ts` expects that), so I updated the expected string.
- `reauthor-service.test.ts` "does not leak private retention to a same-caller generation on another Flow":
  - Before t519, the other Flow's generation failed before reaching the provider. Now that Flow has instructions, so it reaches the provider: three `flow_bootstrap` calls, which this stand-in refuses, so it still rejects with /generation failed/.
  - `harness.taskKinds` collects both Flows' calls, so the test now compares the run's own calls with `flow_bootstrap` filtered out, against the unchanged list, and separately asserts the other generation did call it.

### Product fix: `storage/project/flow-resource-repository.ts` `listInstructionSummariesPage`

The defect had two parts:
- **Filters joined with "or".** The flowId, subflowId and scopeKind clauses were joined with `or`. The summary store's own filters (`runtime/service/summaries/store.ts`: both the in-memory `matchesScope` and the JSON summary-index SQL) join theirs with `and`. Every filter now narrows.
- **Any Flow's instruction admitted for a Subflow.** The subflowId clause admitted every `scope_kind = 'flow'` instruction. It now admits only the Subflow's own Flow's instructions: `scope_kind = 'flow' and flow_id = (select parent_flow_id from subflows where subflow_id = ?)`. Its own subflow-scoped rows and the global and project rows are admitted as before.

Second copy, `runtime/service/summaries/store.ts` `listFlowInstructionSummariesUnheld` (second follow-up):
- **Same rule for a Subflow.** The in-memory `matchesScope` and the JSON summary-index query both admitted any Flow's `flow`-scoped instruction for a Subflow. They now admit only the Subflow's own Flow's, as SQL does.
- **New helper `subflowOwnerFlowId`.** It finds a Subflow's Flow:
  - in memory: from the in-memory subflow index;
  - with a storage root: from project SQL `getSubflow(...).parentFlowId`, falling back to the subflow summary repository's row.
  - An unknown Subflow admits no Flow's instructions, matching the SQL subquery's null.
  - A read failure propagates. I first wrote it as `.catch(() => null)`, and the structure audit's `failure-as-empty` rule refused that.

This is what staled Flow A's in-flight re-author whenever an instruction was saved on Flow B. Flow B's instruction entered A's execution dependency digest through the subflow-scoped listing in `getLlmExecutionDependencyDigest`.

Tests:
- (a) Regression, added to `storage/project/tests/flow-resource-repository.test.ts` as a new describe. I did not add a new file because that directory is at the 25-file limit. The setup is two Flows, each with a Subflow, plus global, project, flow and subflow instructions on both. Listing `{flowId A, subflowId SA}`, and `{subflowId SA}` alone, returns only A's, project and global. It also checks scopeKind narrowing and a mismatched `{A, SB}` pair. With the original repository file restored, both new tests fail ("2 failed | 8 passed"). With the fix, all 10 pass.
- (b) Parity, `runtime/service/summaries/tests/instruction-scope-parity.test.ts`:
  - On one stored service, thirteen filter combinations are listed twice: once through project SQL, and once through the summary store's own index. The index is reached by making `tryWithFlowResourceRepository` return null for that call, which is the branch the store takes when SQL is unavailable.
  - The combinations now include a Subflow alone (both Subflows) and a Subflow paired with another Flow. The test also pins the index's answers for `{SA}` (A's flow, project, SA) and `{A, SB}` (project only).
  - Both lists must be equal. Restoring either original file (the repository, or `store.ts`) makes the test fail; with both fixes it passes.
  - The truly in-memory branch (`!paths.root`) cannot be exercised: a service with no storage root refuses to save an instruction ("has no storage root ... names no file for it"). The index path applies the same clauses as `matchesScope`.

## Commands run and observed results

All run from `C:/Users/osrs_/FluxStuff/fxwork/t544/!FluxIQ` (vitest from `packages/fluxiq`).
- `pnpm.cmd --filter @fluxiq/contracts build` -> build-cache "reuse".
- Before any change, the Group A directories -> "Test Files 21 failed | 4 passed (25)", "Tests 94 failed | 31 passed (125)".
- After the second follow-up, the same set with all of `runtime/service/summaries/tests` added -> "Test Files 1 failed | 68 passed (69)", "Tests 2 failed | 488 passed (490)".
  - The two failures are both in `summaries/tests/run-detail-preservation.test.ts`, which is a **Group C** file in the sweep record.
  - Both fail with `AutomationInstructionError: Write active instructions ...`, the t519 fixture cause, not this change. I did not touch that file (another group's).
  - Every other file passed, including the parity test and the 21 Group A files.
- With `store.ts` restored to HEAD, the parity test -> 1 failed (on `{ subflow: 'a' }`).
- After the first follow-up, the combined run: the 21 Group A files, all of `storage/project/tests`, every test file that calls the listing (`api/handlers/tests/instructions.test.ts`, `conversations/commands/tests/extension-chat.test.ts`, `flow-bootstrap-commands/tests/candidate-generation.test.ts`, `service-flows/tests/instruction-readiness.test.ts`, `service-flows/tests/scale-pages.test.ts`), plus the digest and inventory callers' tests (`service/instruction-led/tests`, `service-bootstrap/tests/generation.test.ts`) and the parity test -> "Test Files 55 passed (55)", "Tests 387 passed (387)".
- Without the fix, the regression tests -> "Tests 2 failed | 8 passed (10)", and the parity test -> 1 failed.
- `pnpm.cmd --filter fluxiq check` -> exit 0 (rerun after the store change).
- `node scripts/structure-audit.mjs` -> "structure-audit: passed (348 warning(s), 1156 baselined)." (rerun after the store change)
  - After the store change, the first audit run failed on `failure-as-empty` at the new `.catch(() => null)`. I removed the catch.
  - On the first follow-up, the first try the audit failed twice, on directory-files (26 > 25 in `storage/project/tests`) and statement-packing in my new test. I fixed both by moving the regression test into the existing repository test file and unpacking the statements.
  - The repository file's existing advisories stay (29 methods, 560 lines), and so do the store's (34 methods, 696 lines).
- `git diff --check` -> exit 0 (only LF/CRLF autocrlf warnings).

## Not verified

- No full suites (per the rules). Groups B and C were not run. `service-flows/tests/instruction-readiness` and `scale-pages` sit beside Group C files but are not in Group C; I ran them and did not edit them.
- No live or browser behaviour.
- The rootless in-memory branch of `matchesScope` has no test: a service with no storage root cannot save an instruction. I changed it the same way as the index query.

## Open questions or contradictions found

- **The stored row's scope kind differs between paths for two instruction kinds.** The SQL scope mapping stores `adaptation_review` as `flow` and `on_error` as `error` (`runtime/service/flows/store.ts` `sqlInstructionScopeFromInstruction`), while the index keeps the original kind. A `scopeKind` filter on those kinds may therefore differ between paths. This predates t544 and is not covered by the parity fixtures. Left as a follow-up, as the supervisor directed.
