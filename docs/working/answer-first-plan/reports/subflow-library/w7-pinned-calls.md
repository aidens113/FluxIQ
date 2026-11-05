# w7: a site part and its action part, pinned from two Flows, with a row crossing the call

## Outcome

Partial, for one reason only. Steps 1 to 4 and the step 6 proof are done, and the headed spec passes. Step 5's Core side is done and tested, but a Flow cannot yet be assembled from the step, because that takes one line in `runtime/flow-authoring/bootstrap/**`, which is listed below for approval. The script grammar also cannot express a row across a call yet (lines below), so the spec's parts are written through the service's Flow save, not from a script. Nothing is committed.

## What the proof showed

`apps/extension/e2e/content/tests/part-run/tests/pinned-calls-job-board.spec.ts`, job-board, headed, with a provider that throws after the build (`providerCalls` asserted 0). A real scripted build made the real recorded controls. A person's edits through `service.saveFlow` then split the press into an action part. The site state is read from the Lab's `/__control/final-state` and from My jobs.

```
{"pinnedKept":{"saved":true,"partId":"part.0e7f46ca215ce70afe1840dc","version":2,"status":"new_version"}}
{"pinnedCallers":{"site":[{"kind":"flow","flowId":"flow.installed.reset","nodeId":"node.bootstrap.941db2187024eabe.main.s2","version":2},{"kind":"flow","flowId":"flow.second.caller","nodeId":"second.call","version":2}],"action":[{"kind":"part","partId":"part.0e7f46ca215ce70afe1840dc","callerVersion":2,"nodeId":"node.bootstrap.941db2187024eabe.main-keeprows.s6","version":1}],"calls":[{"partId":"part.4281b8db2da85d61d1867a0c","version":1,"name":"Keep the role on this row","calls":[]}]}}
{"pinnedFlowRun":{"flowId":"flow.installed.reset","status":"succeeded","versions":["part:part.0e7f46ca215ce70afe1840dc:v2","part:part.4281b8db2da85d61d1867a0c:v1"],"calls":4,"clicks":4,"reads":1,"ms":26415}}
{"pinnedFlowRun":{"flowId":"flow.second.caller","status":"succeeded","versions":["part:part.0e7f46ca215ce70afe1840dc:v2","part:part.4281b8db2da85d61d1867a0c:v1"],"calls":4,"clicks":4,"reads":1,"ms":26833}}
{"pinnedSaved":{"start":["13707d7b1e529572","21184d1fa92f3741"],"wordsTwo":"systems","one":["9e6637d40b97a8e8","116900366eecf508","adb4d94f9665710b"],"two":["9e6637d40b97a8e8","9d7b94c21b4c8525","1e8f9c09e6cfc45a"],"after":["13707d7b1e529572","1e8f9c09e6cfc45a","21184d1fa92f3741","9d7b94c21b4c8525","9e6637d40b97a8e8"]}}
{"pinnedNewerAction":{"saved":true,"partId":"part.4281b8db2da85d61d1867a0c","version":2,"status":"new_version"}}
{"pinnedFlowRun":{"flowId":"flow.installed.reset","status":"succeeded","versions":["part:part.0e7f46ca215ce70afe1840dc:v2","part:part.4281b8db2da85d61d1867a0c:v1"],"calls":4,"clicks":4,"reads":1,"ms":25001}}
{"pinnedPartReordered":{"status":"succeeded","stoppedAt":null,"clicks":4,"reads":5,"modelCalls":0,"ms":35536}}
{"pinnedPartRowGone":{"status":"stopped","acts":["modify_existing"],"stoppedAt":{"stepLabel":"keep the role","reason":"The item this step was for is gone from the page, so it was not done, and the items after it were not tried."},"clicks":2,"reads":4,"ms":27346}}
  1 passed (8.3m)
```

What each scene shows:

- **Both Flows replay at zero model calls.** Each saved exactly its three intended jobs. The heart is a toggle, so a second press would have unsaved a job. Four clicks for three rows is the board failing the first press of a page load, followed by the automatic retry, as in w5.
- **The trace shows the versions.** Each Flow's run calls the site part once and the action part once per row. The trace of the first Flow's run, read from the kept diagnostic:
  ```
  node...main.s2 -> {"subflowId":"part:part.0e7f46ca215ce70afe1840dc:v2","graphFlowId":"flow.installed.reset.bootstrap.941db2187024eabe.main-keeprows.graph","graphRevision":2}
   node...main-keeprows.s6 -> {"subflowId":"part:part.4281b8db2da85d61d1867a0c:v1","graphFlowId":"flow.installed.reset.subflow.3fef6055-4e39-423a-a9cf-8afad0b0a0da.graph","graphRevision":null}   (three times)
  ```
- **The two Flows run on separate boards.** The board's first sponsored card is the same for most words, so the rows of the words `manager` and `systems` overlap on one job. On one board, the second Flow would correctly press that job's toggle again. The spec resets the board between the Flows and asserts each one's own rows. Nothing repeats within a run. Not repeating across deliberate runs is not what this scene tests.
- **Version change.** After the action part got v2, the Flow's graph nodes and the library's read of `site@2` are asserted byte-identical (`JSON.stringify`), the run still ran `action@1`, and the same jobs were saved once.
- **Part run with the rows reversed mid-run.** Five reads: the read, plus one before each of four presses, re-found in the caller's frame. Exactly the intended rows were saved.
- **Part run with a row removed mid-run.** Stopped with the "gone" sentence. Only the row before it was saved, with no press for the removed row or the one after it.

Screenshots, all looked at (copies in the scratchpad, and overwritten in place by a rerun of this test):

- `apps/extension/e2e/test-results/content/artifacts/part-run-tests-pinned-call-71f9f-ly-once-at-zero-model-calls/after-flow-one-my-jobs.png`: "5 saved jobs": Senior Frontend Engineer (React), Engineering Manager Payments Platform, Engineering Manager, plus the board's two, one heart each.
- `.../after-flow-two-my-jobs.png`: "5 saved jobs": Senior Frontend Engineer (React), Rust Engineer Settlement Systems, Backend Engineer – Rust, plus the board's two.
- `.../after-row-gone-across-call.png`: the first card's heart filled, later hearts empty, the removed role absent. The page's header counter still says 2 because it was drawn at page load, and the fixed header appears mid-image, an artifact of the full-page capture. The spec's assertion reads the Lab's state.

The existing spec file, run whole on the final code, ended `2 passed (9.2m)`:

```
{"partRunRows":{"status":"succeeded","acts":["modify_existing"],"stoppedAt":null,"clicks":4,"reads":5,"ms":33262}}
{"partRunSecond":{"code":"part.run_in_progress","message":"Another run is using this project's page right now, so this part was not run and nothing changed. Try again when that run has ended.","commands":[],"ms":37}}
{"partRunRowsMoved":{"status":"succeeded","stoppedAt":null,"clicks":4,"reads":5,"ms":33086}}
{"partRunRowGone":{"status":"stopped","acts":["modify_existing"],"stoppedAt":{"stepLabel":"keep the role","reason":"The item this step was for is gone from the page, so it was not done, and the items after it were not tried."},"clicks":2,"reads":4,"ms":26016}}
  2 passed (9.2m)
```

## What changed and why

### 1. Pinned call: one execution path

- **The node.** `builtin.control.call-subflow` gains `part: { partId, version }`. `subflowId` is no longer `required`, because a pinned step has none (see the seam on `route-validation.ts`).
- **The pin as an id.** `engine/automation/frames/part-pin.ts` writes a pin as the Subflow id its frame runs under: `part:<partId>:v<version>`. Everything after `frames/call-subflow.ts` reads that id, so the frame, boundary, retries, verification (`called-nodes.ts`, comment only), `calledVersions` and the ledger needed no change, and `subflowTarget.subflowId` shows the pin.
- **The composite source.** `runtime-session/subflow-frame.ts` looks in the Flow's own Subflows first, and only an id holding a pin reaches `library`.
- **The run-only rewrite is gone.** `run-only-graphs.ts` now writes a throwaway root whose one step pins the part, and the versions come from the same `run/part-graph.ts` a Flow's run uses. In a saved version's graph, each call step is written as the pin `part_calls` records for it, and its old sibling id is dropped.
- **Closed codes:**

| Code | When |
|---|---|
| `executor.call_subflow.part_version_missing` | the pinned version is not in the library |
| `executor.call_subflow.part_invalid` | a pin that cannot be read |
| `executor.call_subflow.unknown` | a foreign unpinned id, and also a pin-shaped id written by hand in `subflowId`, so only a pin reaches the library |

**The ownership checks:**

1. The Flow's own list (`subflows.find`): only a pin passes to the library.
2. The graph proof: `automationStudioSubflowGraphIsOwned` is unchanged, and the Router's selection takes no pinned graph. A new `automationStudioPinnedGraphIsOwned` needs `subflowGraph`, `parentFlowId` equal to the running Flow, `parentSubflowId` equal to the pin id, and `projectPart` equal to the pin. A graph with any of these wrong is refused (tested case by case).
3. The parent Flow: a library version is given no `subflows` row. It is made a graph of this run by `part-graph.ts`, which stamps the running Flow, so `candidate-trial/frame-evidence.ts`'s parent check passes as well. The spec and `row-across-call.test.ts` go through it.

A foreign unpinned graph is still refused: `executor.call_subflow.unknown` through the real service, nothing pressed.

### 2. Static bounds and callers

- **Bounds.** `run/closure.ts` now tells `call_cycle` and `call_too_deep` apart from `calls_not_available`, by path, at depth 8. `project-parts/call-bounds.ts` holds a save to the same bound, and also refuses a version that would reach its own part at any version.
  - **At a part's save** the skip reasons are `part.call_cycle`, `part.call_too_deep`, `part.unresolved_call`.
  - **At a graph's save** the same codes come first in the thrown message.
  - **At a run** the `executor` or `part.` code fails the call before the frame starts, and the engine also refuses `executor.call_subflow.too_deep` from the frame stack.
- **Every place a pinned call is written.** `project-parts/graph-calls.ts` decorates the Flow writer's one `saveFlowInternal` (`service.ts:459`, the same line). A pin that could not run is refused before the write, and `part_calls` is kept true after it, including forgetting a node that no longer calls anything. A Flow's own sibling calls keep the row their Flow's save wrote. `save-applied-flow.ts` records pins too.
- **The mislabel is fixed.** `part_calls` gains `caller_flow_id`, edited into `0026_sa` in place, since it is not on `dev`. `callers[].flowId` and `usedByFlowId` now mean the parent Flow a person opened. `caller_id` keeps the graph id. No screen reads it (grep of `apps/web`, `packages/ui-components`, extension), so it is not exposed.
- **One defect found by the proof.** A part a person kept alone had no site unless its own closure opened one, so every run of it answered `part.wrong_site`. `keep.ts` now falls back to the Flow's other graphs. Tested.

### 3. A row crosses a call

**The authoring form, in a graph:**

```json
call step, in the repeat's body:  { "part": { "partId": "...", "version": 1 }, "inputs": { "item": { "$state": { "path": "item" } } } }
called part:                      "interface": { "inputs": [{ "id": "item", "name": "The role", "valueType": { "kind": "unknown" }, "required": true }] }
```

- **Why `item`.** A native step is handed `{...options.inputs, ...wired}`, so a frame whose input is `item` gives every step of the part that row, exactly as a loop's body step gets it. The web domain's `webAutomationScopedToRow` then scopes the press with no domain change.
- **Re-check across the frame** (`target-reacquire/row-recheck.ts`, `frame-row.ts`). A step with no loop in its own graph but a row in its frame asks the same question of the call step in the caller's frame. Its own lineage re-reads the list by the t786 path, rewrites its pass's row, and the fresh row comes down through what the call hands over. This recurses through any number of frames (tested two up). The gate then checks that control visible in that row, as for a loop's own step.
- **Stale retry.** `step-reacquire.ts` asks the same re-find, so a target lost after the second failed retry also crosses the frame, and a row gone becomes `executor.target.gone`. Tested with the real engine and no gate.
- **How a step reaches its caller.** Every arrival at a node passes `automationStudioStepReacquire`, which notes the frame's context in a `WeakMap` on the frame object. This avoided editing `graph-run.ts` and works with or without a run control gate.
- **Identity.** `child-frame.ts` keeps a handed row by its own fields, as the ledger's loop identity does, so a route back that re-reads the list does not make the same row a new act. One row called twice in one run presses once (tested).
- **A new stop, deliberate.** A step in a call made from a repeat, handed no whole row, with the page still where the list was read, answers `unavailable` (`row_not_handed`), so the part stops unpressed. Before this, a control that looked unique passed the once-only look and was pressed on every pass, and field-only inputs made each press look like a new act to the ledger. A part that opens the row's page first is not affected. This is the shape today's grammar can write (`title: $row.title`), so such a part now stops rather than pressing unscoped. The fix for it is the grammar lines below.

**The grammar cannot pass a whole row today.** Observed from a throwaway test against the real assembler (the fixture library lacks the call node, so `call_unavailable` also appeared):

- `input: item` is refused: `flow_script.part_interface_invalid` ("is never "item", the name a loop's row takes").
- `job: $row` is not refused and not a binding: `ROW_FORM` only takes `$row.<field>`, so it reads as the literal text `$row`. That is a silent trap of its own.

### 4. Acts of a part in an answer-first attempt

- `project-parts/run/settled-calls.ts` watches the same two doors `run-acts/run-gate.ts` wraps, and tells each lasting step's real action, parameters and row as it happens, so a run that stops still told what it did. A sure no-effect is not an act. An unclear answer is `uncertain`.
- `known-parts.ts` hands these to the attempt's record, which `run-attempt.ts` gives it in one added line (`input.partActs?.use(record)`), with one optional member on `attempt/contracts.ts`.
- Tested with the real record, run gate, store and executor (`run/tests/settled-acts.test.ts`). After an attempt ran a lasting part, the first real run pressed nothing, and the same run with no record pressed all three rows, so the check is not empty. Through the real store a first run takes the acts once, and a second finds nothing to carry. An uncertain press is carried, and the row never reached is pressed.

### 5. `core.run_part` leaves one pinned step

The tool's answer now carries `draft.ranWith: { part: { partId, version }, inputs }`, pinned at the version that ran even when the call named none. A refusal leaves no step. `draft-step.ts` writes it as one call step with `part` and `inputs` entries. The assembler then refuses it until the line below is approved, observed today: `flow_script.unknown_node`, "names "builtin.control.call-subflow", which a script writes with its own lines". With the mark that line adds, passed directly to `assembleAutomationStudioFlowScriptPlan`, the assembler raised no issue.

## Seams needing you

**Bootstrap lines to approve. I edited none of them.**

Step 5, one line, `runtime/flow-authoring/bootstrap/authoring/draft-routing.ts` `scriptStep`, after line 782 (`entries: entry.written.entries ?? [],`):

```ts
...(entry.step.toolId === "core.run_part" ? { derivedParameters: {} } : {}),
```

Your lane's choice whether to name the constant or read it from `written`. Related: `plan/route-validation.ts:60`, `if (called === undefined) continue;`. Now that `subflowId` is not required, a JSON plan's call naming nothing is no longer refused by the plan and fails at run (`executor.call_subflow.unnamed`). To keep the refusal: `if (called === undefined) { if (node.parameters?.part === undefined) issues.push(error("bootstrap.unknown_call_target", ...)); continue; }`.

The row across a call, the smallest generic statement: a part declares `input: row`, and the step that calls it inside `repeat over:` says `row: $row`.

1. `authoring/script-binding.ts`, first line of `wholeBinding` (line 70): `if (written === "$row") return { value: automationStudioStateBinding(ROW_NAME) };`
2. `script-statements/called-parts.ts:114`: `return [{ ...entry, key: name === "row" ? \`inputs.${ROW_INPUT}\` : \`inputs.${name}\` }];` with `const ROW_INPUT = "item";`
3. `authoring/assemble.ts:392`: `inputs: part.inputs.map((name) => ({ ...port(name === "row" ? "item" : name), required: true as const }))`
4. `plan/flow-script-format.ts`, a sentence after line 406: "A part that acts on one row of a list its caller goes through declares `input: row`, and the step that calls it inside `repeat over:` gives it `row: $row`: the part's presses then stay in that row, and the row is looked for again before each."

`row` already passes the port-name rule, so `part-port-name.ts` keeps its ban on `item`. These four are read, not run. `$row.<field>` inside such a part stays refused (`flow_draft.row_binding_outside_loop`), which a press does not need.

A candidate trial cannot run a pinned call: `verification/candidate-graphs.ts` answers only the topology ("no durable or caller-source fallback"), so a pin there fails `part_version_missing`. It needs a library beside `automationStudioCandidateGraphSource` in `detached/execution.ts:114`, and `artifactFor` must know those artifacts. Answer-first's draft save runs nothing, so this only bites when a later attempt tests such a draft.

**A closed list outside my paths, `api-contracts/automation/project-part.ts:123`.** I did not edit it. A run's refusal therefore keeps `code: "part.calls_not_available"` and adds a stable internal `callBound: "part.call_cycle" | "part.call_too_deep"` with its own message. Below the API the codes are as asked (`refusal()` for a Flow's run, the skip reason for a save). To surface them, add `| "part.call_cycle" | "part.call_too_deep"` on that line and set `code` to them in `run-part.ts`.

**`service.ts`** stays 4304 lines, with three existing lines changed: 217 (one import name), 459 (the writer), and the line with `automationStudioBindRouterSubflowFrame` (`library:`).

## Commands run and observed results

All in the t866 worktrees, on the final code.

- From `packages/fluxiq`, the brief's vitest command -> `Test Files 29 passed (29)`, `Tests 276 passed (276)`.
- Beyond the brief, for what the refactor touches: `graph-run`, `outside-graph/reacquire`, `runtime-session/subflow-frame*`, `subflow-graph-ownership`, `answer-first/run-acts/tests`, `bootstrap/plan/tests`, `authoring/tests/{rooted-calls,assemble-draft}`, `script-statements/tests/called-parts`, `components/automation/control-flow`, `node-tools/tests/run-node`, `handlers/tests/project-parts` -> `Test Files 36 passed (36)`, `Tests 379 passed (379)`.
- Core root: `pnpm.cmd --filter fluxiq check` -> no `error TS`, `"step":"fluxiq:check"` stored.
- Core root: `node scripts/structure-audit.mjs` -> `structure-audit: passed (502 warning(s), 1097 baselined).` Extension root: `structure-audit: passed (237 warning(s), 553 baselined).`
- Core root: `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` -> each `Done`.
- `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> `core-build: ... is current with its source.`, `"step":"extension:check"` stored, exit 0. `pnpm run test:e2e:build` -> `extension:build` verified.
- Specs, from `apps/extension`, as quoted above: new file `1 passed (8.3m)`, existing file `2 passed (9.2m)`. Two earlier runs of the new spec failed on my own spec and on the `keep.ts` defect, each fixed at its cause: the words for the second Flow overlapped on the sponsored card, and the part run answered `part.wrong_site`.

New tests:

- `frames/tests/call-subflow-pin.test.ts`
- `target-reacquire/tests/row-across-call.test.ts`
- `runtime-session/tests/subflow-frame-library.test.ts`
- `project-parts/run/tests/row-across-call.test.ts` (real runner)
- `project-parts/run/tests/settled-acts.test.ts`
- `project-parts/tests/pinned-calls.test.ts` (byte-identical caller, cycle and depth at save and run, callers)
- `project-parts/tests/pinned-flows.test.ts` (real service)
- `node-tools/tests/run-part/tests/draft-step.test.ts`

## Not verified

- **A real draft holding a pinned step, end to end.** Only the writer and the assembler's two sides are tested, separately. The four grammar lines and the Step 5 line are unrun.
- **`core.run_part` in a real evidence loop, or a live attempt's acts in a browser.** The attempt's offer is driven through the tool's executor with a stubbed shortlist, and the hand-off in `run-attempt.ts` is one line no test passes through. The real-run proof uses the record, not a whole attempt.
- **A Flow's run, as opposed to a part's run, with a row gone mid-run, in a browser.** A Flow's run has no gate that re-checks before each press: its presses are scoped, and a lost target is re-found across the frame at the second failed retry. That path is proven with the real engine and fakes only.
- **In-run repair of a pinned part.** Read, not run. `run-repair.ts` `partGraphFor` asks `subflowGraphForRecovery` by the pin id, which should find no record, so the unit should refuse and no version is written. `subflowOverrides` would hold a replacement for that run only.
- **Trust from a Flow's judged run.** `calledVersions` now names the pin and the version's source graph, but no judged run was executed. In the trace above the action part's `graphRevision` is `null` (a graph saved directly had no revision at `keep`), so its judgements would have no row, by the table's own rule.
- An uncertain act on a real page, Firefox, the other nine scenarios, full suites.

## Open questions and things found

1. **An act by hand, then the same act through a part, in one attempt is not refused.** The part's steps tell the record, but they do not ask it. Only the per-attempt `done` set guards the part, and only for the same version and values. It could be closed by wrapping the runner's doors in `automationStudioAnswerFirstRunActGate` for an attempt, but `carried` ignores `asked` counts and excuses every matching dispatch, so a part that means to repeat a row-less act would press once. I left this for your decision. It does not affect the first real run.
2. **The same job across two deliberate runs is a toggle.** Two Flows whose rows overlap will flip a heart back. `ensureState` on the press would make that safe; the spec's press does not carry it, and the board's overlap is why the spec resets. Each Flow's own run repeats nothing.
3. **A stale `flow_graph` row from a draft.** `saveDraft` records a pin under `draft.<id>`-minted graph ids, and applying later adds rows under the real ids. The draft's rows stay, so `callers` could list the same Flow twice. Harmless, but untidy once Step 5's line lands.
4. **`docs/architecture/automation-studio.md`** does not describe `part`, the bounds or `row_not_handed`. Shared docs were off limits, and the substantial-change rule applies on merge.
5. **The note a frame keeps of its caller** (`frame-row.ts`) assumes the caller is waiting while its child runs, which is true of every call today. I did not run a parked run resumed by a person: from the code, it should get no caller context (`no_source`), which stops rather than presses.
