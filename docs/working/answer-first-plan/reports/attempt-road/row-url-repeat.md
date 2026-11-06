# A saved repeat that opens each row by its address now runs on later attempts (t869)

`S/` = `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`, `AF/` = `SVC/answer-first`. Provider-free, no key, no `.env.local`, no git mutation.

## Outcome

Done. There were two causes. The first is the one the brief named. Fixing it let the Flow reach a second one, which I also fixed: a Run again then pressed the three saved tables off.

### Cause 1: the read stored only the columns the person named (brief's defect)

- **Where:** `S/runtime/flow-authoring/bootstrap/authoring/assembled-record-output.ts:57`, through `normalise.ts:115-122`.
  - Assembly narrows an extraction's record output to the instruction's named columns. This task says "with columns title, price and status", so the tables read stores `title, price` and drops `url`.
  - The engine's For Each walks the read's `records`, which are copied through that schema as an allowlist (`S/engine/automation/records/capture.ts`). Each pass's row therefore has no `url`.
  - The open step's `{"$state":{"path":"item.url"}}` then fails `executor.parameter.unresolved_state_path` (`S/engine/automation/node-execution/attempt.ts:136`).
- **Why the forward run worked:** the replay derives the record output with no `namedColumns` (`S/runtime/llm/node-tools/replay/replay.ts:276-285`), so its rows kept `url`.
- **Fix:** a plan pass, `S/runtime/flow-authoring/bootstrap/script-statements/repeat/row-fields.ts` (new).
  - For each For Each, it collects the `item.<field>` bindings in the loop body.
  - It adds any such field that the listing reads but does not store to the listing's record output schema.
  - The field is stored but not shown: when the output has no `process.columns`, they are set to the columns it showed before. The answer table is unchanged.
  - It applies to every node; nothing names a site or a column.
  - It is called from `authoring/assemble.ts` (scripts and drafts, beside `automationStudioFlowPlanRepeatOrder`) and from `authoring/json-plan.ts` (JSON plans). It is exported from `repeat/index.ts`.
- **Other modes had it too.** The old mode's candidate scripts assemble through the same `assemble.ts` with `namedColumns`. A row-bound repeat under a request that named columns passed its build test (the replay) and failed on playback. JSON plans did the same.

### Cause 2: a plain Save was never given its checked state (found once cause 1 was fixed)

- **What happened:** the first `run-again` after fix 1 (`run-mw46041y-1a1d77e5`) ran the saved Flow to its end, and the Saves pressed all three tables off (Saved went to 2).
- **What a temporary step-log line showed** (since removed, `cmp: identical`):
  - The Save step reaches `AF/flow-run/stated-toggles.ts` with parameters `selector,element,timeoutMs`, because the domain resolves the handle away. So `views=[]` and there is no `target`.
  - The one press the attempt saw flip was written as handle `t982`, so it tied nothing (`tied=0`) and no `ensureState` was stamped.
- **Fix in `AF/flow-run/stated-toggles.ts` (`ownPressHandles`):** the step is also tied to the press its own call made while exploring.
  - The match is the same `callId` and the same node, and the handle the step was written with, where it names one.
  - The call id alone is not used, because a later attempt may reuse one.

## What changed

- **Core:**
  - `script-statements/repeat/row-fields.ts` (new) and `repeat/index.ts`.
  - `authoring/assemble.ts` and `authoring/json-plan.ts`: one call each, plus an import.
  - `AF/flow-run/stated-toggles.ts`.
  - Tests:
    - `AF/flow-run/tests/row-url-repeat.test.ts` (new): real service, scripted model, stub library.
    - `script-statements/tests/repeat-row-fields.test.ts` (new): 4 cases.
    - `AF/flow-run/tests/stated-toggles.test.ts`: 1 case added.
- **Extension:**
  - `packages/test-runner/src/attempt-lane/scripted-model/scripts/local-classifieds-save-dining-tables.ts`:
    - `run-again` now runs plain's Flow (plain Save, opened by address) under `noRoundAfterAWholeRun`.
    - `plain` and `run-again` read the saved items back by address, as Flow steps. Before this, `plain`'s attempt 2 stopped at its press on the "Saved N" link, whose count changes. The script's own header already called that step fragile.
  - Its test: the press-path read-back test now uses `reshape`, and there are new cases for `plain` and `run-again`.
- **Outside the owned list:** `S/runtime/flow-authoring/bootstrap/{authoring,script-statements}/**`. The cause is in assembly; no owned path could fix it at the cause.

## Commands run and observed results

**Core, from `packages/fluxiq`, with `--minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**"`:**

- **`row-url-repeat.test.ts`:** 1 passed.
  - With fix 1 taken out (the `assemble.ts` call swapped for identity, then restored, `cmp: identical`), it failed: `The saved Flow's run stopped at step 3: executor.parameter.unresolved_state_path; domain.library.open_loan (graph_validation_or_unknown_node/executor.parameter.unresolved_state_path)`. That is the browser's note, word for word.
- **`stated-toggles.test.ts`:** 7 passed.
  - With fix 2 taken out (copy, run, restore, `cmp: identical`), the new case failed: `expected [] to deeply equal [ { step: 'saved.1', …(1) } ]`.
- **`repeat-row-fields.test.ts` and `repeat-order.test.ts`:** 12 passed.
- **First run across all acceptance paths** (flow-run, answer-first/tests, replay, candidate/tests, authoring/tests, script-statements/tests; before fix 2): 128 files passed, 1060 tests passed.
  - The 1 failing file was `row-url-repeat.test.ts` reported ENOENT. I had moved it out of `AF/tests/` during the run (that folder was over its file limit), and it passes at its new path.
- **Final run of the same paths, after fix 2:** 127 files passed and 1 failed. Tests: 1061 passed, 1 failed.
  - The failure was `AF/tests/endings/tests/person.test.ts` "allowed continues in place": it expected `waiting_for_person` and got `working`.
  - Run alone twice afterwards, it passed 13/13 both times. It also passed in the first run. I read it as a timing flake under load, not a result of these changes, but I have not proven that.
- **`pnpm.cmd --filter fluxiq check`:** exit 0 after fix 1, and exit 0 again after fix 2.
- **`node scripts/structure-audit.mjs`:**
  - At the end: `passed (531 warning(s), 1097 baselined)`.
  - Earlier it failed once, on another worker's file count in `AF/tests/` (see below).

**Extension:**

- `pnpm.cmd --filter @fluxiq-web-extension/domain --filter @fluxiq-web-extension/test-runner check`: exit 0.
- `node scripts/structure-audit.mjs`: `passed (244 warning(s), 552 baselined)`.
- `node --test "packages/test-runner/dist/attempt-lane/scripted-model/**/*.test.js"`: tests 43, pass 43, fail 0.

**Builds:** the brief's chain was run before each browser run, and every build exited 0. One earlier chain failed because another worker's edits made Core read as stale mid-build; I rebuilt and it passed.

## The browser runs (final build, visible Chrome, real chat)

- **`plain`: exit 0, `run-mw47kjat-9e95c2fa`.**
  - Attempt 2's line: "answer right … it found already done: The three cheapest dining tables saved. It changed nothing on the site. It took the run of the saved Flow, and needed nothing else … 18 live steps, 1 calls, $0.0094".
  - `attempt-2/site.json`: `"change":{}`, `"activity":[]`.
  - Card site lines: "On the site: nothing changed this time", then "Already done earlier: Save." three times.
  - No step-log note: the saved Flow ran whole, including its open-by-address steps. In the run before the script change (`run-mw45ctra`), step 12, the open, passed and step 13, the Save, was skipped as already done.
- **`run-again`: exit 0, `run-mw47a3zt-72911a0e`.**
  - Attempt 2's line: "You asked to do it again (Run again): it found already as asked and pressed nothing … It changed nothing on the site. It took the run of the saved Flow, and needed nothing else … 22 live steps, 1 calls".
  - `attempt-2/site.json`: `"change":{}`, `"activity":[]`, and all 5 items saved after.
  - Card site lines: `[]` ("On the site: I recorded no changes").
- **Both attempt-2 pictures, which I read:**
  - Saved items 5, with the three tables "Saved just now", and the strip says "Finished".
  - `plain`'s card says "Used what I saved. No steps had to be worked out again."

## Not verified

- A paid model.
- Firefox.
- A JSON-plan Flow with a row-bound repeat in a browser (unit-level only).
- A part called with `row: $row`: the part's own bindings are in another Subflow, so this pass does not see them.
- The replay still derives a read's record output without `namedColumns`. The build's test and the Flow therefore still store different column sets for a read whose instruction names columns. The For Each now gets every field it binds, but the stored datasets differ. This drift was there before me and is not fixed.
- Full suites: narrow checks only, as asked.

## Open questions or contradictions

1. **Out-of-list edits:** `authoring/assemble.ts`, `authoring/json-plan.ts`, `script-statements/repeat/{row-fields.ts,index.ts}`, and `script-statements/tests/repeat-row-fields.test.ts`.
2. **Core audit:** `AF/tests/` was briefly over its 25-file limit, because of another worker's untracked `stopped-run-again.test.ts` (26 without mine). I moved my test to `AF/flow-run/tests/`. The final audit passed.
3. **The card's lines say only "Already done earlier: Save."** with no table named, where `again-check`'s card names each one (ui-components, not mine).
