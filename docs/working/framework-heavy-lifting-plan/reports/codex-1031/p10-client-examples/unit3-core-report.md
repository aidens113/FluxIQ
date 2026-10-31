# Unit3 Core grammar consumers

Outcome: Done

Source frozen. No tests, checks, builds, audit, git, browsers or provider calls were run; lead owns acceptance and SDK refresh.

## Production changes

- `runtime/flow-bootstrap/plan/flow-script-format.ts`: removed exactly the four tails beginning at each first `Example` line. All preceding authored grammar strings remain unchanged. Existing exported names stay callable/importable. Header documents the intentional example-free default; inline medium/node/fact wording remains P10 debt.
- `runtime/flow-bootstrap/script-examples/render-format.ts` and owning `index.ts`: public pure helper passes the four explicit Core grammar constants to the accepted renderer. No source parsing, regex replacement, domain/node inference or fallback. Direct import of the owning constants avoids the plan barrel's completion-schema initialization cycle. No test-only production seam.
- `candidate/authoring-loop.ts`: actual `core.submit_candidate` input's `flow.description` retains `The whole Flow as a script. ` and four newline-separated sections, rendered from `input.submission.binding?.flowScriptExamples`. Its extra narrow binding Pick now retains examples.
- `subflow-candidate/builder-loop.ts`: actual submit tool retains the exact brief wrapper and `\nThis subflow as a script. `, followed by the same rendered four sections from submission binding.
- `llm/harness-options/bootstrap-completion.ts`: existing binding Pick additionally retains examples, so controller/subflow submission types carry the member from existing service/project plumbing. No new service-wide transport or registry changes.
- `plan/evidence-schema.ts`: positional compatibility is `(size = defaults, examples?)`; only rendered `format` enters the completion description. Default exported schema is deliberately grammar only. Draft completion/parser/executor/size machinery unchanged.

## Core test changes and actual assembly strategy

Consolidated cases in `candidate/tests/authoring-loop.test.ts` and `subflow-candidate/tests/builder-loop.test.ts` each call the real exported builder with existing `observe` hook, capture its actual constructed submit tool schema, then throw a known sentinel before any loop/model/node call. They assert exact wrapper plus all four sections for six cases: missing metadata, version-only, empty arrays, partial loop only, all archive sections, and a separate audio client. The last case checks archive text did not leak. No Core import of Down.

The completion examples group in `plan/tests/flow-script-format.test.ts` tests all four default constants lack worked headings/scripts; default factory equals exported schema; omitted/empty/non-base-only metadata leaves completion untouched; explicit archive format appears byte-for-byte; unrelated sections stay out; custom size still controls maxLength and all non-description schema fields remain equal.

Updated `plan/tests/flow-script-format.test.ts` and `loop-format.test.ts` retain inline grammar guidance assertions. Consequence parser/acceptor cases now use small generic `sample.*` action definitions instead of the old web fixture. No copied moved worked-example scripts remain in these Core tests.

## Required Down test migration / parity acceptance

The lead must cover the following with Down-owned `WEB_FLOW_SCRIPT_EXAMPLES`; do not restore them as Core web fixtures:

1. Four fixed pre-extraction byte/hash pins from unit2 (6154/3916/8808/7451 bytes) against reconstructed sections, plus old full completion JSON digest `02c766712576f5d8a7bf6cf539e951644b0fa8b3a3978293fadeb3e8cc529147` using the second examples argument.
2. Actual candidate `flow.description` equals old `The whole Flow as a script. ` + four reconstructed sections; actual subflow equals unchanged brief + `\nThis subflow as a script. ` + those sections. Same observe-capture strategy above works through public builder exports; do not test only the pure renderer.
3. Every moved authored Example block parses, accepts, validates as a saved Flow and remains free of realistic-scenario task vocabulary. Presses and typing with submit declare consequences.
4. Existing worked-example graph assertions: act optional dismissal joins, sent search, explicit choice/set and lasting final press; Repeat next-page ended edge and record processing; ForEach row/item bindings and listing where; paced interruption optional join and wait; state entry requirements, automation handler, two callable parts/fail resolve, one-row writer bindings/schema; narrowing example remains outside realistic-site vocabulary.
5. Prior hand-authored extractList.sort parser fixture expectation moved out with these web fixture assertions; preserve its where/sort/minItems structured request coverage in Down.

These migration expectations are requirements, not claimed passing. Unit2's report was read and its first-tail boundaries matched the extraction approach.

## Lead selectors

Core narrow Vitest (package-relative paths after `pnpm --filter fluxiq exec vitest run`):

- `src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/flow-script-format.test.ts`
- `src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/loop-format.test.ts`
- `src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/size-limits.test.ts`
- `src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/condition-rules.test.ts`
- `src/programs/automation-studio/runtime/flow-bootstrap/script-examples/tests/examples.test.ts`
- `src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/authoring-loop.test.ts`
- `src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/builder-loop.test.ts`
- existing unit1 binding/domain-instructions selectors from its accepted report.

Then package types/structure, SDK refresh and Down actual schema/byte/fixture parity. No full suite or paid calls.

Changed: Core source/test paths listed above; this own report only.
Validation: not run; brief prohibits checks/builds/audits. Source inspected only.
Not verified: new/retained tests, typecheck, structure, SDK output, downstream old bytes/actual wrappers/fixture migration, browser/provider behavior.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit3-core-report.md
Notes: Default old-client prompts intentionally lose implicit web worked examples; signatures/parser/registry stay compatible. Inline medium/node/fact and broader P10 move-out remain. No Down/shared working-document/version/baseline/git changes.

## Exact removed expectation ownership and public seams

The removed old tests are the following; any mixed inline assertions were retained in Core grammar tests, while these worked-fixture assertions must migrate to Down:

- `flow-script-format.test.ts`: consequence example's every-press declaration; act heading separation, full act example graph, every-press/sent-form declaration, choices not pressed, final act without invented wait, optional example line; original legacy full-format and completion digests.
- Its every-example table: eleven expected headings in four sections, each block parse+accept, every press/sent form declaration, no realistic Lab site/task vocabulary. Its saved-Flow table: each of the eleven passes plan validation, normalization and all graph validations.
- Its four state worked graphs: entry `s3 fluxiq.entry` with renewal condition and `web.facts@1`; primary+recovery handler shape, automation scope, dialog absent completion and resume; calendar/floorplan utility parts, failed call's resolving handler, reference binding and shared success checks; separate plan/renewal/price reads into the last one-row writer and its derived three schema fields. Narrowing example vocabulary exclusion.
- `loop-format.test.ts`: three expected loop headings; pages Repeat graph (navigate/Merge/Repeat/read/next/Merge), ended edge, year `atLeast:2015` record process and valid bindings; rows ForEach graph (list to items, item to press, lasting modify_existing, status-overdue where/minItems, row number binding) and valid bindings; slowdown ForEach graph with optional failed/success join, wait join/backedge, 6000ms pace, wait duration6/seconds, valid bindings. Independent invoice parser case preserves `extractList` handle, unpaid where, due ascending date sort and minItems0.

Deleted local helper scaffolding only: `webDefinitionsWithSubmit`, `exampleRegistry` (item input on click, submit on type, next_page branch), `exampleBlocks`, `examples`, `EXAMPLE_RESOLUTION`, fixture registries/ROW_INPUT/SUBMIT. Existing shared Core test fixture files were not edited/deleted. Down should use its actual registered web definitions, not import Core test fixtures.

Public callable exports used/needed by migration: `parseAutomationStudioFlowScript`, `acceptAutomationStudioFlowBootstrapResult`, `automationStudioFlowBootstrapWrittenPlanBindingIssues`, `validateAutomationStudioFlowBootstrapPlan`, `AutomationStudioNodeRegistry`, `createBlankAutomationStudioFlowArtifact`, `normalizeAutomationStudioFlowBuildPlan`, `validateAutomationStudioFlow`; plus the four grammar constants, `renderAutomationStudioFlowScriptFormat`, `renderAutomationStudioFlowScriptExamples`, completion factory, `runAutomationStudioFlowCandidateAuthoringLoop`, `runAutomationStudioSubflowBuilderLoop`, and the subflow submit tool ID. The first group's existing saved-flow fixture describes the public normalization sequence; `savedFlowValidation` itself is a Core test helper and must not be imported by Down. Lead must verify SDK public reachability, especially normalize's existing adaptation barrel, after refresh.

Production section order is explicit at both actual consumers: `${scriptFormat.format}\n${scriptFormat.act}\n${scriptFormat.loop}\n${scriptFormat.state}`, not object enumeration. Overall unit3 acceptance remains pending required Down migration and lead checks; this report's Done means worker source assignment complete only.

Acceptance correction: the three initial new test files were consolidated into existing owning tests; the two partial metadata cases now use authored present loop arrays. See unit3-check-corrections.md. Source refrozen; validation remains lead-owned.
