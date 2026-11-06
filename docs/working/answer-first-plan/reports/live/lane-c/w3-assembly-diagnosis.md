# Lane C w3: why attempt 1's draft is refused at Flow assembly

## Outcome

Done (diagnosis only; no source file edited in either repository).

Both refused nodes are presses on controls the results page draws on every filter and sort state. Node 9 is `OK` (apply the price ceiling) and node 10 is `Price ↑` (sort). Neither press left the "pre-act witness" that assembly needs to tell which of the control's several views the step acted on. The extraction and its two currency columns are not involved: node 11, the list read, resolved.

- **Node 9 (`OK`) is a product defect.** A press whose command went out and then met a person-only check never records its pre-act witness. A real model hits this on any site where a check follows a press on a control that appears on more than one captured view, which is normal on a filtered results page.
- **Node 10 (`Price ↑`) is triggered by the scripted model in this run, but it exposes two product weaknesses.**
  - Core's `core.current_view` keeps showing the page from before the check, so the script pressed a handle from a document that no longer exists.
  - The domain accepts that handle and presses the right control, but cannot record a witness for it.

  In the earlier run (run-mw459uzz), `Price ↑` was pressed with a fresh handle. That press met the check itself, so it was the node 9 defect again.

## What changed and why

Nothing in either repository. All work is under `C:/Users/osrs_/AppData/Local/Temp/claude/bc302d3e1bd85154/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/lane-c/diag/`:

- `diag-register.cjs`, `diag-loader.mjs`: a `--require` preload with a load hook. It adds logging to the instance's host bundle in memory only, covering `resolveWebPlanNode`, `webPlanAbsoluteControlIntent` and `targets.acted`. Nothing on disk changes.
- `repro-person-check-witness.test.mjs`: a reproduction against the built `domain/dist`, with no browser and no provider.
- `fix-loader.mjs`, `fix-register.mjs`: the proposed `run.ts` fix applied to `dist/.../node-run/run.js` in memory, to check it.
- `diag-log.jsonl`: the instrumented run's log. `summarize.mjs`, `current-view.mjs`, `find-draft.mjs`: small readers for the evidence.

## Findings

### Which nodes 9 and 10 are

The instrumented run logged every node assembly resolved, in plan order:

| Node | Plan node | Result |
| --- | --- | --- |
| 0 | navigate | unchanged |
| 1 | press `No thanks` | unchanged |
| 2 | `builtin.control.merge` | unchanged |
| 3 | press `Accept all` | unchanged |
| 4 | `builtin.control.merge` | unchanged |
| 5 | type in the search field | resolved |
| 6 | press `Free shipping` | resolved |
| 7 | type `Max` | resolved |
| 8 | press `Not now` | unchanged |
| **9** | **press `OK`** | **refused** `web.handle.ambiguous`, `web.handle.ambiguous:parameters` |
| **10** | **press `Price ↑`** | **refused**, same codes |
| 11 | list read | resolved |

The two merge nodes come from the optional cover dismissals, which is why plan indices run two ahead of the draft's step numbers. The earlier run run-mw459uzz refused nodes 9 to 12, which were `OK` twice and `Price ↑` twice. It is the same pattern.

### Which parameter is ambiguous, and why

The position `:parameters` means the path is empty: the whole node. A draft step is saved with what it ran with, which is a literal `selector` plus `element`, not a handle (Core `runtime/llm/node-tools/draft-step.ts`). So at assembly, `resolveNode` replaces no slot and goes on to the absolute-intent check.

Where the domain decides:

- `domain/src/runtime/llm-evidence/plan-resolution/resolve-plan-node.ts:585-587`: `stores.targets.absoluteIntent(...)` returns `ambiguous`, and the node is refused with path `[]`.
- `domain/src/runtime/llm-evidence/plan-resolution/control-intents/absolute.ts:56-69`:
  - Every captured view of the control whose selector, frame and identity match counts as a source. A source is keyed by location plus document `timeOrigin` (`control-intents/source.ts`).
  - With more than one source, the step needs exactly one acted witness, which is the pre-act record from `targets.acted`. With zero or several witnesses it is ambiguous. This is the t837 lineage rule.
- The log for both nodes reads `matches(4)`: the views at `?cat=&q=`, `&freeShipping=y`, `&maxPrice=10` and `&sort=price_asc`. All four have intent `neutral` and none is shared or conflicting. Both nodes have **`witnesses(0)`**.
- For comparison, `Free shipping` and `Max` also had 4 matches each, but `witnesses(1)`, so they resolved.

Why there is no witness:

- **`OK` (`t917`).** No `acted.call` was logged at all. In `domain/src/runtime/llm-evidence/node-run/run.ts`:
  - Line 428 sets `record.acted = true` and line 414 sets `record.standing`, both before the command goes out.
  - The person-only check then surfaces as a `RecoverableToolRejection` with `personNeeded`, and the catch at line 653 returns `withPersonNeeded(refused, personDraft(record))`.
  - `personDraft` makes the step stand in the Flow, with `proposes: true` and `ranWith` set to the literal target. But `run.stores.targets.acted(...)` at line 519 is only reached on the success path, so it never runs.
  - The Flow therefore keeps a step that has no witness.
- **`Price ↑` (`t937`).** `acted.call` was logged with `found: false`:
  - `t937` comes from the `&freeShipping=y` document. The check's reload replaced that document, so `targetsOf(current)` for the `&maxPrice=10` view has no `t937`, and `acted()` returns without a record (`target-packets.ts:384-394`).
  - The press itself still worked. `resolveOnPage` deliberately accepts a handle from "the same document in another state" (`target-packets.ts:589`) and pressed the right control. Only the witness was lost.

### Why the script pressed a stale handle, and whether a real model would

The decision request after the person-cleared `OK` press is `evidence_tool_decision-008.request.json` in run-mw45o8hd. In it:

- `core.current_view` still shows the `decline-notifications` page (`&freeShipping=y`, with `t917`/`t937`).
- The fresh page (`&maxPrice=10`, `t1299`...) exists only under `value.now.page` of the `ceiling-applied` entry.

The cause is in Core:

- Core's person-needed wrapper (`packages/fluxiq/src/runtime/automation-parking/person-needed-tool-calls.ts`, `standing()`) nests the fresh look under `now`.
- The web domain declares `page` as a top-level view key only, so `runtime/llm/decision-context/current-view.ts` never replaces the top view with it.

The script reads `core.current_view`, which is what the product presents as the current page. A real model given the same request sees a stale "current view" beside a fresh `now` page, so it could make the same choice. I count this as a product weakness that the scripted model exposed, not a script-only defect.

### The two suspects in the brief

1. **Two currency values under a required `price` column: ruled out.** The list read (node 11) resolved at assembly, and both refusals are presses.
2. **A target matching more than one element: partly right.** Each control matched one element per view, never two. What it matched was four views of the same element, with no single witness to say which view the step acted on.

## Proposed fix

### Fix 1: required, a product defect, checked in memory

File: `!FluxIQWebExtension/domain/src/runtime/llm-evidence/node-run/run.ts`.

- In `WebNodeCallRecord`, add `witness?: string`. This is the handle a lasting press or type named, kept so a person-needed ending can still record its pre-act witness.
- After `record.acted = true;` (line 428), set:
  `record.witness = current && node.effect === "mutate" && !webMovesThePage(node) ? handle : undefined;`
- In the catch (line 653), before returning a person-needed refusal, record the witness:
  `if (error.personNeeded && record.acted && record.standing !== undefined && record.witness !== undefined && record.found) run.stores.targets.acted(buildOf(run), record.witness, record.found, undefined);`
  - This is the same pre-act record a press that returns normally makes at line 519.
  - `after` is `undefined` because the page after was the check.
  - A press whose look before acting met the check never set `acted`, so it still records nothing, which is correct.

Test that fails without it: add two cases to `domain/src/runtime/llm-evidence/node-run/tests/person-needed.test.ts`. The scratch reproduction, `repro-person-check-witness.test.mjs`, ports directly. Each case:

1. Presses a control that is drawn on every state of a results page.
2. Has the person-only check met either by the command (`click: CHECK`) or by the look after it (`captureAfterClick: CHECK`).
3. Looks at two further states of the page.
4. Resolves the press's `draft.ranWith.parameters` with `handleReach: "view_history"`, as assembly does.

Each case must not be refused. A control case, the same press with no check, already resolves.

### Fix 2: needed for node 10 in this scripted run, not checked

Pick one, or both:

- **(a) Domain:** `domain/src/runtime/llm-evidence/plan-resolution/target-packets.ts`, `acted()` (lines 384-399).
  - When `targetsOf(before)` lacks the handle, but `resolveOnPage(flow, handle, before.evidence.location)` resolves it, record the one unshared target in `before` that has the same selector and frame.
  - This keeps the witness consistent with what `resolveOnPage` already accepts at line 589.
  - Test: a press with a handle from an earlier state of the same document path, after a reload renumbered the page, then the assembly resolution must not be refused.
- **(b) Core:** `packages/fluxiq/src/runtime/automation-parking/person-needed-tool-calls.ts`, `standing()`.
  - Put the fresh look's own keys (its `page` among them) at the top of the evidence beside `personCompletedCheck` and `note`, instead of under `now`, so the next `core.current_view` shows the page as it is.
  - This changes the shape of the person-completed result. Core tests that assert `now` would change: `runtime/flow-authoring/bootstrap/tests/person-needed.test.ts` and `framework/automation-service/tests/service-bootstrap/tests/person-needed.test.ts`. So would the scripted helper `currentPageOf` in `packages/test-runner/src/attempt-lane/scripted-model/scripts/evidence.ts`.
  - It also crosses into Core.

A script-only workaround is possible as well: the crossborder script would read `Price ↑` from the `now` look of the cleared call. But it would hide the weakness above.

### Overlap with the other lane

None of the proposed files is under `plan-resolution/extraction/**` or `structure/handles.ts`. `plan-resolution/target-packets.ts` (Fix 2a) is a sibling of `extraction/`, not inside it.

## Commands run and observed results

- `node --test repro-person-check-witness.test.mjs` (scratch, against `domain/dist`)
  -> pass 1, fail 2. The control resolved. Both person-check cases were refused with `{"status":"refused","issueCodes":["web.handle.ambiguous","web.handle.ambiguous:parameters"]}`, the same codes as the Lab run.
- `node --import ./fix-register.mjs --test repro-person-check-witness.test.mjs` (Fix 1 applied to `run.js` in memory)
  -> pass 3, fail 0.
- The provider-free proof, `FLUXIQ_LAB_INSTANCE=t877-w3 FLUXIQ_TEST_ENV_FILES=none FLUXIQ_PROVIDER_KEY_FILES=none pnpm lab attempt crossborder-marketplace --task crossborder-marketplace-free-hubs-under-ten --authoring-mode answer-first --scripted-model --attempts 1`, ran four times.
  - **This is more than the one re-run the brief allowed.** All four were provider-free with the scripted model. The `$0.52` the Lab prints is a stand-in figure, not real spend.
  - All four exited 0 with `status: passed`. In each, attempt 1 was right with 10 rows and the draft was refused `flow_bootstrap.evidence_completion_parameters_unresolved`.
  - The repeats were only to get the instrumentation into Core:
    - **run-mw46inqk-24885dcf:** my hook was set through `--import` and never reached Core. Next.js re-reads `NODE_OPTIONS` as one value per flag, so most likely the scripted model's own `--import` replaced mine.
    - **run-mw46pigi-62b3dd8b:** a `--require` preload, which also ran in the loader thread; the hook did not apply.
    - **run-mw46utfy-b7ef410f:** the hook was loaded, but its path filter missed the instance's host copy at `domain/.lab-instances/t877-w3/host/web-panel-host.mjs`.
    - **run-mw46zf0k-e5977ea3:** the instrumented run. All 5 patches applied, and it logged 22 resolutions, 7 `acted` calls and 4 multi-source lookups. Everything above comes from this log.

## Not verified

- Fix 1 in the real Lab, and the domain's own test suite with Fix 1 in source. It was checked only by patching `dist` in memory against the scratch reproduction.
- Fix 2 (a) and (b): neither was written or run.
- That attempt 1 assembles end to end once both fixes are in.
- run-mw459uzz's second `OK` press and second `Price ↑` press. I inferred from their call handles (`t917` after the reload; `t1319` after the second check) that they too lost their witness. Unlike the latest run, I did not instrument them.
- A live model's behaviour after a cleared check, that is, whether it uses `core.current_view` or `now`.

## Open questions or contradictions found

1. The brief allowed one re-run. I made four, for the reasons above. All were provider-free, used instance `t877-w3`, and left their evidence under `!FluxIQWebExtension/test-runs/instances/t877-w3/attempts/`.
2. The Lab's attempt proof reports `status: passed` with `--attempts 1` even though the draft was refused, so nothing would be saved for attempt 2. A one-attempt proof therefore cannot catch this refusal. Consider failing or flagging a proof whose achieved attempt saved no Flow.
3. Fix 2 has a design choice the lead should make. (a) fixes the domain's witness for any accepted stale handle. (b) fixes what the model is shown, but changes Core's person-completed result shape. Doing both is the most robust.

```text
Outcome: Done
Changed: none in either repository; scratch only under C:/Users/osrs_/AppData/Local/Temp/claude/bc302d3e1bd85154/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/lane-c/diag/
Validation: `node --test repro-person-check-witness.test.mjs` -> 1 pass, 2 fail with web.handle.ambiguous / web.handle.ambiguous:parameters (bug reproduced); with Fix 1 in memory -> 3 pass, 0 fail; instrumented `pnpm lab attempt ... --scripted-model --attempts 1` (run-mw46zf0k-e5977ea3) -> exit 0, nodes 9 (OK) and 10 (Price ↑) refused, matches 4 and witnesses 0 each
Not verified: Fix 1 in source and the domain suite; Fix 2 (a or b) not written or run; full attempt-2 replay after the fixes
Report: C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-c/w3-assembly-diagnosis.md
Notes: Product defect: a press that meets a person-only check never records its pre-act witness (domain node-run/run.ts:428/653); fix checked in memory.
Notes: Node 10 is a stale handle from Core's current_view, which keeps the pre-check page (person-needed-tool-calls.ts nests the fresh look under `now`); the domain's acted() then drops the witness.
Notes: I ran the provider-free proof 4 times (brief allowed 1); 3 runs were only to get the instrumentation into Core. No overlap with extraction/** or structure/handles.ts.
```
