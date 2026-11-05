# w8: a model can author the site part and its per-row action part, and keep them in its Flow

## Outcome

Done, with one deliberate change to what you decided: the act record is asked at the door a lasting step passes (`run/settled-calls.ts`), not in the step gate. The gate still holds the stop. Reason below. Nothing is committed.

The headed proof passes. A model's script (`input: row`, `row: $row`) saved each intended job once, at zero model calls. A second part run in one attempt stopped at the press with nothing pressed. A candidate trial of a Flow holding one pinned step ran the pinned versions and saved each job once.

## Guidance sentence, verbatim

Added to `AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT`, after the `input:` line (`plan/flow-script-format.ts`):

> A part that acts on one row of a list its caller goes through declares `input: row`, and the step that calls it inside `repeat over:` gives it `row: $row`: the part's presses then stay in that row, and the row is looked for again before each.

**What it moved: nothing.**

- No existing test pins this text. The one test that does is new (`plan/tests/flow-script-format.test.ts`).
- Recorded-window counts did not move. `decision-context/tests/recorded-windows.test.ts` passes with no edit. It replays evidence windows, and this text reaches a model only through `script-examples/render-format.ts`, in a tool's format description.
- `plan/tests`, `candidate/tests/authoring-loop.test.ts` and `tests/model-facing/tests/handle-only.test.ts` pass unedited apart from the new test.
- It adds 243 bytes to that section, on every mode that renders it.

**Two other model-facing sentences, both generic:**

- `run/build-tool.ts`, when a part is handed no row: "This saved part cannot do this as it stands: it acts on one row of a list but does not take the row, so nothing tells it which row's control to use. Write it in your Flow so that the part declares `input: row` and the step that calls it inside `repeat over:` gives it `row: $row`, or do the step yourself."
- `authoring/script-binding.ts`, refusing `$input.row`: its example is `input: station`, a weather network, which that file's header already allows.

## What changed and why

### 1 and 2. A `core.run_part` step in the draft, and the plan's refusal

- `authoring/draft-routing.ts`: the step keeps one pinned Call Subflow. It is on the existing `entries:` line, because the file was at its 800-line limit and a new line fails the audit. The tool id is written as text rather than imported, because that tool's directory reads this one.
- `plan/route-validation.ts`: a call naming neither a Subflow nor a part is `bootstrap.unknown_call_target`. A pin passes.

### 3. A row across a call

As approved: `script-binding.ts` (`$row`), `called-parts.ts`, `assemble.ts`. Beyond the four approved lines I closed two silent traps, both in those files:

- `row:` on a call takes `$row` and nothing else. `row: 3` or `row: $row.name` would put a non-row in `item`, so it is refused at its line (`flow_script.invalid_binding`).
- `$input.row` inside a part is refused with what to write instead. Before this it would have read a state path no frame holds, and failed only at the run.

**A behaviour change on old scripts.** `input: row` used to be an ordinary name and now means the row, so a script using `row` for another value is refused and told to rename it. `text: $row` on any step is now the whole row rather than the literal text `$row`. Outside a repeat it is `flow_draft.row_binding_outside_loop`.

### 4. A candidate trial runs a pinned call

- `verification/candidate-graphs.ts` takes a library beside the topology. Only a pin reaches it, and what it returns must prove it is that version made a graph of this Flow's run.
- `artifactFor` knows those artifacts, and `pinnedGraphs()` feeds `candidateGraphs`, so a pinned frame's acts are attributed.
- `detached/execution.ts` passes `options.subflowGraphs`, the only carrier that reaches it through `subflow.ts`, `subflow-from.ts` and `candidate-trial/run.ts` unedited.
- **A sibling's id gets no caller-source fallback.** This is pinned in `candidate-graphs.test.ts` ("a sibling's id never reaches the library") and in `trial-ports/tests/environment.test.ts`.
- **t870:** no overlap. `execution.ts` has only my hunks, at the `candidateSource` line and after `returnedTrace`, and line 66 is untouched in this worktree.

**Edits outside my owned paths, approved by you mid-run:**

- `service/trial-ports/collaborators.ts`: one optional member, `partLibrary`.
- `service/trial-ports/environment.ts`: `graphOptions` sets `subflowGraphs` from it.
- `service.ts:387`: same line. The file stays 4304 lines.

### 5. The act record is asked before each lasting step: at the door, not the gate

**Why I moved it.** A gate reads the saved node, whose parameters still hold bindings such as `{ $state: ... }`. The doors, and so the record's entries and a by-hand act, hold the resolved values. Asked from the gate, a bound parameter would compare a different thing and let a repeat through. `recheckRow` gives resolved values only when a row is found, and `no_row` carries none. Changing that means editing `engine/`.

**How it works.**

- `projectPartSettledCalls` asks `admit` first, with the same call `settled` is told.
- A refusal returns a failed, `unacted` result with nothing pressed.
- It also tells the gate `stopFor(node, act_done | act_may_have_landed)`. The gate's stop holds, so no later step and no written `on failed:` route goes past it.
- `asked` is the record's own. `carried` is not used. A person's run names no `admit` and is unchanged.
- `run-attempt.ts` has no new line: it already hands the whole record.

**One defect the browser found, fixed.** On the real board the second run in an attempt first stopped at "type the words and search". A typed search with `submit` is a commit by its node's kind, and w7's `settled` claimed an act for any lasting step with no class.

- **Why it matters.** With the real record, this stops a part at a search, and the first real run's `carried` would skip the search and then press whatever rows the unsearched page shows. That is not a repeat, but it is the wrong rows. I did not reproduce the skip end to end: it follows from `carried` matching the same action and values.
- **The fix.** A step whose own declaration is `consequences: none` (`declaredConsequences: []`) claims no act. The record keeps it as undeclared, its own disclosed limit (D6). A step that declared nothing at all still claims one.

### 6. `row_not_handed`

The gate gives it its own stop reason. A person reads: "This part runs once for each item of a list but was not handed the item, so it could not tell which item this step was for, and it was not done." A model also gets the instruction above. The stop leaves no step in the draft, because a Flow holding it would stop there too.

Proved through the tool's executor (`attempt-admit.test.ts`): `ok: false`, `core.run_part.stopped`, nothing pressed, no field on the answer but `kind`, `evidence`, `effectApplied`, `resultCode`, and the next call runs a good part.

### 7. A Flow is one caller

`get.ts` lists a Flow once by parent Flow, and the newest version it pins speaks for it. `usedByFlowId` already selects with `exists`, so it returned a part once, and a test now holds that with a draft row present. The stale rows stay in the table: `usedByFlowId` still finds a part from a draft's row alone, before any apply.

### Also

`project-parts/tests/pinned-calls.test.ts` lines 101 and 119 expected `callBound`, which w9 removed, and w9 reported them failing as not theirs. It is in my path, so I updated them to `part.call_cycle` and `part.call_too_deep`.

## Proof (a): through the real assembler and real service

`project-parts/tests/draft-to-flow.test.ts`, all passing:

- The real tool, through the real offer and `runAs`, tells the real record, persisted to the real store.
- The real `checkAutomationStudioFlowBootstrapCompletion` assembles a draft holding the `core.run_part` step.
- `saveDraft`, `createFlowBootstrapAdaptation`, approve, apply. The applied graph holds one Call Subflow with `{ part: { partId, version } }` and no `subflowId`. The Flow is one caller with the draft's rows present.
- `runRuntimeSession` with the service's real `carryActs`: the first run presses nothing, and a second, deliberate run presses once.
- A candidate trial through the public `automationStudioServiceWholeTrialPorts`, with a provider that throws (`modelCalls` 0): verdict yes, one press, its act attributed through the pinned frame. A version not in the library fails with `part_version_missing`, with nothing pressed.

**Stubbed, in full:**

- The domain's nodes are plain functions.
- The host answers every fact true.
- The shortlist is a stub, so the part is offered by name.
- The evidence loop does not run: the draft step is built by hand from the tool's real `draft` field, as `evidence-loop/call-record.ts` builds it.
- The judge in the trial is this test's own.
- The part has one press and no row, because a row re-check through the real service needs an output-action node. Rows with the real record are in `settled-acts.test.ts` and `attempt-admit.test.ts` (real runner, plain domain).

## Proof (b): headed, job-board

`apps/extension/e2e/content/tests/part-run/tests/pinned-calls-job-board.spec.ts`, new test "written in the script format".

- **The script.** A scripted provider builds it: the model-shaped script, with no hand on the graph. It is submitted with `core.submit_subflow`, and the build ends `proposed`.
- **The scene that reads the fixture.** From there the provider throws (`providerCalls` asserted 0), and saved state comes from the Lab's `/__control/final-state` and My jobs.

```
{"scriptPartsRun":{"status":"succeeded","frames":4,"actionFrames":3,"clicks":4,"reads":1}}
{"scriptPartsSaved":{"start":["13707d7b1e529572","21184d1fa92f3741"],"intended":["9e6637d40b97a8e8","116900366eecf508","adb4d94f9665710b"],"after":["116900366eecf508","13707d7b1e529572","21184d1fa92f3741","9e6637d40b97a8e8","adb4d94f9665710b"]}}
{"scriptPartsLibrary":[{"partId":"part.0e7f46ca215ce70afe1840dc","version":1,"name":"Keep the first few roles the words find","inputs":["words"]},{"partId":"part.7788efbce15acc94a89d6ed9","version":1,"name":"Keep the role on this row","inputs":["item"]}]}
{"scriptPartsAttempt":{"status":"succeeded","stoppedAt":null,"asked":["run","run","run","run","run"],"told":[{"applied":true,"uncertain":false},{"applied":false,"uncertain":false},{"applied":true,"uncertain":false},{"applied":true,"uncertain":false},{"applied":true,"uncertain":false}],"landed":3,"unsure":0,"clicks":4,"reads":5}}
{"scriptPartsAttemptAgain":{"status":"stopped","stoppedAt":{"stepLabel":"keep the role","reason":"This step was already done in this task, so it was not done again."},"clicks":0}}
{"scriptPartsCandidateTrial":{"status":"proposed","thrown":null,"verdict":"yes","code":null,"order":["decide:1","decide:2","decide:3","judge","judge","decide:4"],"versions":["part:part.0e7f46ca215ce70afe1840dc:v1","part:part.7788efbce15acc94a89d6ed9:v1"],"frames":4,"clicks":4,"reads":1}}
  1 passed (5.2m)
```

What each scene shows:

- **The Flow's run.** The action part is called once per row, and each intended key is saved once. The heart is a toggle, so a second press would have unsaved a job. Four clicks for three rows is the board failing a page load's first press, followed by the retry.
- **The attempt shape.** The board's failed first press settles as `applied: false, uncertain: false`, so a real record would let its retry go. That was my main worry about asking before each attempt, and this line answers it.
- **The second run.** It stops at the press with zero clicks, and the board is unchanged.
- **The candidate trial.** `order` shows no model decision between the turn that asked for the test and the judge. The two `judge` entries are this spec's scripted yes, not a model. The trial saved the intended rows once.

**Honest limits of (b):**

- The attempt scene's `admit` is a stand-in for the record's rule on rows, not the real record. The real record is not a public Core export, and the audit's `package-exports` rule refuses a deep import. The record's own answers are proven in Core.
- The trial's judge is scripted.
- The build's own trial answer is not read directly: the scripted brief ends on it with no further turn.

Screenshots, both looked at:

- `apps/extension/e2e/test-results/content/artifacts/part-run-tests-pinned-call-e1d75-andidate-trial-runs-the-pin/after-script-parts-my-jobs.png`: "5 saved jobs": Senior Frontend Engineer (React), Engineering Manager Payments Platform, Engineering Manager, plus the board's two, one heart each.
- `.../after-candidate-trial-page.png`: "manager jobs" with the first three cards' hearts filled and the rest empty. The header counter says 2 because it was drawn at page load, and the fixed header appears mid-image, an artifact of the full-page capture, as in w7.

## Commands run and observed results

All in the t866 worktrees.

- From `packages/fluxiq`, vitest with `--minWorkers 1 --maxWorkers 2` over `bootstrap/plan/tests`, `authoring/tests/{rooted-calls,assemble-draft,written-rows,candidate-loops}`, `script-statements/tests/{called-parts,row-across-call}`, `service/project-parts`, `node-tools/tests/run-part`, `bootstrap/verification/tests`, `service/trial-ports/tests`, `candidate/tests/authoring-loop`, `tests/model-facing/tests/handle-only`, `decision-context/tests/recorded-windows`, `answer-first/attempt/tests`, `answer-first/run-acts/tests`, `persistence/automation/project/parts`, `frames/tests/call-subflow-pin`, `engine/automation/target-reacquire`
  -> `Test Files 1 failed | 67 passed | 1 skipped (69)`, `Tests 2 failed | 711 passed | 2 skipped (715)`. The two failures were the `callBound` lines above.
- After updating them: `pinned-calls.test.ts` -> `Tests 11 passed (11)`. After the refusal's example word changed: `row-across-call.test.ts` -> `Tests 6 passed (6)`. I did not repeat the whole list after those two small edits.
- Core root: `pnpm.cmd --filter fluxiq check` -> no `error TS`, `"step":"fluxiq:check"` stored.
- Core root: `node scripts/structure-audit.mjs` -> `structure-audit: passed (502 warning(s), 1097 baselined).` Extension root: `passed (237 warning(s), 553 baselined).`
- Core root: the four-package build -> each `Done`, and `core-build ... is current with its source`.
- From `apps/extension`, whole spec file, headed: `2 passed (8.8m)` (`ok 1` in 3.5m, `ok 2` in 2.7m). w7's scenes in that run match its report: `calls:4, clicks:4, reads:1`; `pinnedCallers` lists each Flow once.
- New test alone, on the code after those edits: `1 passed (5.2m)`, quoted above. Only the refusal's example word and a test file changed after it, and I rebuilt but did not rerun the browser for that.
- `pnpm.cmd run check` in `apps/extension` -> `"step":"extension:check"` stored.
- `wc -l`: `service.ts` 4304, `draft-routing.ts` 800.

Three earlier failures, each at its cause: `as never` and packing in my tests, the 800-line limit (above), and a deep import of the record in the spec (replaced by the stand-in).

## Not verified

- **`core.run_part` in a real evidence loop.** The draft step is built by hand from the tool's answer, and nothing ran the loop's own append of it.
- **The real act record in a browser.** Only the stand-in, plus how the real board settles a press.
- **The first real run after an attempt, in a browser.** Proven through the real service with plain nodes, and with rows through the real runner.
- **A row gone during a candidate trial.** The trial scene above has every row present.
- **A step that declared nothing at all and is a commit.** It still claims an act, so a first real run skips it. If that step is a search, the wrong-rows problem above remains. It is the D6 limit in the other direction, and I left it.
- **Handing a row two levels down through the grammar.** A part with `input: row` cannot hand it on: `$input.row` is refused, and `$row` is outside a loop there. The graph form is tested two up, the grammar cannot write it.
- Firefox, the other nine scenarios, full suites, live runs.

## Open questions and things found

1. **A supervisor plan port named `row`.** `plan-input.ts:268` accepts it, and `row` now lowers to `item`, while the scope's interface keeps `row`, so a builder given that port has no working way to write it. Read, not run. A one-word refusal beside `item` in `project-agents/supervisor/plan-input.ts` closes it, but it is outside my paths. I recommend it.
2. **A pinned step keeps no outputs.** `draft-step.ts` writes `part` and `inputs`, so a later draft step cannot read what the part handed back. Not asked for here.
3. **A `core.run_part` input holding text that starts with `$`** goes through the binding reader on assembly, and could be refused or read as a binding. Read, not run. A draft that cannot assemble costs the draft and never the result.
4. **Stale `draft.` rows stay in `part_calls`,** so a Flow that drops the pin still counts as a caller through its draft's row, and `usedByFlowId` still finds it.
5. **Docs.** `docs/architecture/automation-studio.md` does not describe `input: row`, the pinned step, or `row_not_handed`. Shared docs were off limits, and the substantial-change rule applies on merge.
