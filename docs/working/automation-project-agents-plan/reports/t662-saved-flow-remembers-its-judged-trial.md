# t662 saved-flow-remembers-its-judged-trial: worker report

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t662/!FluxIQ`, branch
`task/t662-saved-flow-remembers-its-judged-trial`. Nothing is committed. Paths
below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Done. A saved Flow now records the build's judged-yes trial when it is applied.
The service hands t660's hold the `judgedBuildTrial` port, read from that
record. A playback that runs the recorded versions, stores the trial's exact
rows and gets a double no is recorded `unverified`
(`core.result.build_yes_disagrees`). A playback with different rows is refuted
as before. A service test covers this from a real candidate build through apply
and a real playback. A second service test shows the project build's whole-Flow
path writes the same record.

## What changed and why

### One apply point serves both paths

The candidate build and the project build's whole-Flow build both promote
through `promoteAutomationStudioCandidateTrial`:

- `service/project-build/promote.ts` wraps it.
- Both propose through `createFlowBootstrapAdaptation`, which stores
  `candidateTrial: { trial: { runId, verdict: "yes", calls } }` on the
  proposal's `created` audit event.
- Both are applied by `applyFlowBootstrapAdaptation` in `service.ts`, which is
  also what the chat and the judged re-author call.

So the record is written in one place, and it is tested from both build paths.

### New `flow-version/judged-build-trial/`

The record joins a saved version to a judgement, so it sits beside the
existing version/verdict join. It is exported from `flow-version/index.ts`.

- **`contracts.ts`**: the metadata key `judgedBuildTrial` and the type
  `AutomationStudioFlowJudgedBuildTrial`. The type holds `trialRunId`,
  `verdict: "yes"`, `calls`, `instructionDigest`, `adaptationId` and
  `versions`. It holds only ids, a count and a digest: no page data and no
  request text. A test checks that the instruction text does not appear in the
  record.
- **`applied.ts`**: `automationStudioAppliedJudgedBuildTrial`.
  - It reads the `created` event's `candidateTrial.trial`. Without a whole yes
    trial it returns nothing and reads nothing.
  - **Versions**: the parent as apply read it, plus every topology Subflow
    graph, each read back through `getFlow` after its index was replaced, so
    each carries the revision a run will name.
  - **Digest**: `automationStudioFlowInstructionDigest(getFlowInstructionSet({projectId, flowId}))`.
    This is the same read and the same function the post-playback check uses
    (`run-outcome.ts`). It is taken at apply. That is sound because apply
    refuses unless the Flow's dependency digest is unchanged since the
    candidate was built (`FLOW_BOOTSTRAP_STALE`), and that digest covers every
    instruction object.
- **`metadata-with.ts`**: writes the record, or removes an earlier one when an
  apply has no judged trial. Without that removal, an evidence-guided build or
  a re-author would leave the previous build's trial speaking for a Flow it
  never judged.
- **`from-metadata.ts`**: reads the record back strictly. A damaged record
  reads as none.
- **`ran-judged-versions.ts`**: decides which runs the record speaks for.
  - Every graph the run executed must be one apply saved, at the same revision
    (matched by `graphFlowId`).
  - At least one of them must match by revision number.
  - A `null` revision matches only `null`, and only for the orchestration
    (parent) entry.
  - This is a deliberate, narrow exception to `flow-version/contracts.ts`'s
    "null never matches". I measured it: a built Flow's parent has no graph
    chain, and the candidate service test recorded
    `[{"graphFlowId":"flow.generated","revision":null},{"graphFlowId":"...primary.graph","revision":1,"subflowId":"..."}]`.
    Without the exception the hold would never fire live.
  - The parent's chain starts when its graph is viewed or patched. Either one
    numbers it, so the record then stops matching. That is the safe direction.

### `service/flow-bootstrap-commands/applied-parent.ts`

`automationStudioBootstrapAppliedParent` takes an optional third argument,
`judgedBuildTrial`, and writes it with `automationStudioMetadataWithJudgedBuildTrial`,
which removes the key when the argument is absent.

### `service.ts`, net zero lines (4318, at its baseline)

- **Apply**: the parent save now passes
  `await automationStudioAppliedJudgedBuildTrial({...})` as the third argument.
  This is the one apply-path edit. It has to live here because apply is in
  `service.ts`. Revert restores `parentBefore`, which carries the earlier record
  or none.
- **Port**: `resultPorts` (about line 2486) gains
  `judgedBuildTrial: automationStudioResultJudgedBuildTrialOfSavedFlow({ flowMetadata: (p, f) => getFlow(p, f).metadata })`.
- **Import**: folded into the existing `./result-verification/index.ts` import.
  For that, `result-verification/index.ts` now re-exports `./build-yes-hold/index.ts`.
  This is a one-line barrel addition, and tsc reports no name collision.

### New `result-verification/build-yes-hold/saved-flow-trial.ts`

`automationStudioResultJudgedBuildTrialOfSavedFlow` builds the port.

- It returns nothing for a Subflow-scoped run, because the record is the whole
  Flow's trial.
- It returns nothing for the trial's own run, and for a run of any other
  versions.
- A Flow it cannot read is **not** swallowed as "no trial". The structure
  audit's `failure-as-empty` rule refused that. The error goes on to the run's
  result check, which records `unverified` with
  `core.result.verification_did_not_finish`.
- `held-double-no.ts`, `judged-trial.ts` and `same-stored-rows.ts` are
  unchanged. The port's shape needed no change.

### Tests (all new files; fixtures are a seed nursery, a county library and a garden catalogue, not any of the ten scenarios)

- **`flow-version/judged-build-trial/tests/judged-build-trial.test.ts`** (9 tests):
  - the record and its absence cases;
  - the round trip, and removal on an apply without a judged trial;
  - damaged records reading as none;
  - which runs the record speaks for, including the null rule.
- **`result-verification/build-yes-hold/tests/saved-flow-trial.test.ts`**
  (5 tests), through `verifyAutomationStudioRuntimeSessionResult` with the
  port:
  - same rows: `unverified`;
  - different rows: refuted;
  - repaired revision, no versions, or no record: refuted;
  - unreadable Flow: `did_not_finish`;
  - Subflow scope, and the trial's own run: no trial.
- **`service/flow-bootstrap-commands/tests/applied-judged-trial.test.ts`**
  (2 tests). This is the definition-of-done test, run on the real service:
  1. A candidate build gets two judge yeses, then is approved and applied.
  2. The record equals the build's trial run id, 2 calls, the service's own
     instruction digest, and the versions `getFlow` reports.
  3. A real `runRuntimeSession` playback records exactly those versions.
  4. The identical rows are written into both runs' real dataset stores and
     processed.
  5. The result check runs with the real stores, the port exactly as
     `service.ts` builds it, and a judge that says no twice. The result is
     `unverified` / `model_disagreed` / `core.result.build_yes_disagrees`.
  6. With different playback rows the result is `refuted` / `model`.
- **`service/project-build/tests/project-build-judged-trial.test.ts`** (1 test):
  1. A real project build plans one part, its builder builds the subflow, and
     the whole trial gets two yeses. It is then approved and applied.
  2. The record names the **whole** trial's run id, which the supervisor saw
     from `core.test_candidate`, not a subflow trial's.
  3. Its calls are 2 and its digest is the instruction digest.
  4. Its versions cover the playback's recorded versions, and the port names
     the trial for that playback.

## Can a trial's stored rows match a playback's? (the brief's question)

Yes. Core adds nothing per run to the compared content:

- `same-stored-rows.ts` compares only the stored schema's field ids, in order,
  and each row's values in those fields. Dataset ids, node ids and summaries
  other than counts are ignored.
- A stored row is exactly the `row_json` the read produced
  (`storage/project/run-dataset-store.ts` `rowFromStored`). Core adds no field
  to it: no timestamp, run id, session link or source URL.
- Field ids are the authored ones (`name`, `price`). They survive saving the
  Flow, while node ids are re-minted and dataset ids are not compared.
- A trial run's datasets are processed the same way a playback's are
  (`service/candidate-trial/run.ts` calls `processDatasets(runId)` however the
  trial ended). Both are read from the same store by the same `readRecordSets`.

What can still stop a match is the site, not Core:

- a value the page itself makes per visit, such as a link field carrying a
  session or tracking token;
- a different row order, such as rotating sponsored items;
- several datasets written in a different order (`listRunDatasets` is
  newest-written first).

Each of these fails the comparison and judges as now, which is the safe
direction. The A8 debug found the names, prices, unit prices and ratings
identical. I did not check that run's link fields.

## Commands run and observed results

All commands were run from `packages/fluxiq`, with
`R=src/programs/automation-studio/runtime`.

- `npx tsc --noEmit -p tsconfig.json`: exit 0, no output. Run after the source
  changes, again after the tests, and again after the audit fixes.
- `npx vitest run $R/flow-version`: 2 files, 21 tests passed.
- `npx vitest run $R/result-verification/build-yes-hold`: 2 files, 11 passed.
- `npx vitest run $R/service/flow-bootstrap-commands/tests/applied-judged-trial.test.ts`:
  2 passed, about 1.5 s each.
- `npx vitest run $R/service/project-build/tests/project-build-judged-trial.test.ts`:
  1 passed, 2.0 s.
- **Mutation check**: in `service.ts` I dropped the third argument at apply.
  The candidate "is recorded at apply..." test failed (1 failed, 1 passed). I
  restored the file from a copy, and `git diff --stat` showed my original
  9-line change again.
- **First `node scripts/structure-audit.mjs` (repository root)**: 5
  violations:
  - `failure-as-empty` in `saved-flow-trial.ts`;
  - `service.ts` at 4321 lines against its 4318 baseline;
  - `statement-packing` in 3 test files.
- **Fixes**:
  - The port's catch is removed, and its test now expects
    `core.result.verification_did_not_finish`.
  - `service.ts` changes are folded to net zero lines.
  - The packed lines are split.
- **Final audit**: `structure-audit: passed (386 warning(s), 1156 baselined).`
  The warnings that touch my paths are `directory-files` advisories:
  - `flow-bootstrap-commands/tests/` is at 25 files;
  - `project-build/tests/` is at 18 files.
- **Final brief directories**:
  `npx vitest run $R/result-verification $R/flow-version $R/flow-bootstrap/candidate $R/service/flow-bootstrap-commands $R/service/project-build $R/service/candidate-trial $R/tests/service-bootstrap/tests/{apply-graph-index,extend,older-record-apply,adaptation}.test.ts`
  printed `Test Files 192 passed (192)` and `Tests 1455 passed (1455)`.

## Not verified

- No live run, as the brief says. The live hold also depends on the Lab
  playback's parent revision staying `null`. If anything (a person opening the
  Flow's graph view, a patch) numbers the parent between apply and playback,
  the record stops matching and the double no refutes as before.
- The rows in the service test are written into both runs' stores by the test.
  The Start-to-End Flow a mock build makes reads none. A real read through a
  browser was not exercised.
- The evidence-guided (non-candidate) build path proposes with `buildJudged`,
  which carries no trial run id. It records nothing, and an apply from it
  removes any earlier record. I did not add a record for it, because the brief
  names the candidate and project-build paths.
- I did not run `pnpm check` or the full suites (the narrow-check rule).

## Open questions or contradictions found

- **Ownership:**
  - The brief gives me `service.ts` "the port only", but apply itself lives in
    `service.ts` (`applyFlowBootstrapAdaptation`). I changed it by one
    argument on the existing parent-save line, net zero lines.
  - I also added one line to `result-verification/index.ts` (re-exporting
    `build-yes-hold`) so the import fits the `service.ts` line baseline.
  - Neither path is on the must-not-touch list.
- **Null-revision exception:** `flow-version/contracts.ts` says a null revision
  never matches. The new rule makes a narrow exception for the parent entry
  only, for the reason measured above. The supervisor may prefer to index the
  parent's graph at apply instead, as is already done for Subflow graphs. That
  would give it a real revision, but it changes what apply writes and is
  outside this brief.
- **An unreadable saved Flow after a double no** now ends `unverified`
  (`verification_did_not_finish`), not refuted. The audit forbids reading the
  failure as "no trial". It is the same fail-closed path a failed read of the
  trial's own rows already took in t660.
