# w10: repair isolation

## Outcome

Done, all eight items, nothing committed, no `dist` touched, no provider, Lab or browser. Every item has a test through the real service with the fixture. Each of four safety lines was broken on purpose and a test failed for it (below). What is not proven is listed under Not verified: nothing here has run in a browser.

Four things you should read before merging:

1. **A defect found and fixed in existing code.** A part replaced in a run never ran fixed through the real service. `call-subflow.ts` put the fix on `target.graph`, and `composite-execution/owner.ts` runs `target.artifact ?? target.graph`, so the old graph ran again. `frames/call-subflow.ts` now puts the fix on the artifact too. This also changes owned parts, for the better. No existing test noticed either way.
2. **`stoppedForGoodInside` stops a model fix too**, for a pinned call whose step met a permission gate or found its item gone. See decision 13.
3. **The detached recovery after a failed run can still ask a model** about a pinned call whose inner step hit a gate. Not owned code. See "Open questions" 1.
4. **Two literal readings you may want to change**, each one line: see "Open questions" 2 and 3.

## What changed and why

Under `packages/fluxiq/src`:

| File | Change |
|---|---|
| `engine/automation/frames/newer-part.ts` (new) | When a pinned call may try a newer version, whether a step should hold back from asking a model, and removing a failed version's credit |
| `engine/automation/frames/part-call-paths.ts` (new) | Which call steps a finished run reached a version by, read off its trace |
| `engine/automation/frames/invocation-options.ts`, `run-holder.ts`, `index.ts` | `newerParts` on a pinned graph; `newerPartTrials` on the run holder |
| `engine/automation/frames/call-subflow.ts` | The override fix above; a pinned version that ran with a fix in it is named at revision `null` |
| `engine/automation/step-loop/incident-repair.ts` | Trying a newer version, putting it back when it fails, a pinned call's unit is the part |
| `framework/.../runtime-session/in/run-repair.ts` | `partGraphFor` reads the pin; the offer of a newer version; a fix in a pinned frame holds in `subflowOverrides`; a fix's declared consequences kept on its record |
| `framework/.../adaptations/unit-repair-change.ts` | Saved steps of a fix say what the fix said they lastingly do |
| `framework/.../project-parts/repair/` (new) | `keeping-parts.ts` (the door), `pinned-repair.ts` (judged yes, next version, the move), `next-version.ts`, `newer-versions.ts`, `refuted-trial.ts`, `run-facts.ts` |
| `framework/.../project-parts/part-interface.ts` (new) | Same interface; the id of a new line |
| `framework/.../project-parts/{save-applied-flow,get,graphs,project-parts,index}.ts` | New line on save; callers told; the run's per-run reading; three library methods |
| `framework/.../runtime-adaptation/judged-promotion.ts` | One optional port, `refutedPartTrial`, and one line calling it |
| `framework/automation-service/service.ts` | Three existing lines, still 4304 lines, no new statement: 463 (the door), the `judgedPorts` line (one member), `getFlowRunDetail`'s return (wrapped) |
| `api-contracts/automation/project-part.ts` | Additive: `ProjectPartCaller.newer` |
| `framework/.../project-parts/tests/repair-isolation-fixture.ts` | Kept, with two controls added: `denied`, `gone` |

### How each item works

1. **A pinned part can be repaired in a run.** `partGraphFor` reads the pinned version through the run's own source. A fix inside a pinned frame, and a replaced part, hold in `subflowOverrides` for the run. In this run's test the second call to the version ran the fix with one patch request.
2. **Nothing moves until a judged yes.** A pinned fix goes through the normal `reviewFlowAdaptation` apply, so its gates, review record and application record are the usual ones. The door is a decorator on `applyFlowAdaptationPatchMutations`, the w7 pattern, because `durable.ts` and `patches.ts` are not owned, and because a target override or wait-retry does not pass through `unit-repair-apply.ts`. It reads the run's session itself and refuses unless `status: succeeded` with `performed: true` and `verdict: answers`. So a settle gone wrong or a person's apply cannot move anything. The move is the normal graph write: on a graph with a revision chain the test sees `revision + 1` and the pin read back from the chain. A refused fix is recorded with the existing `notAppliedReason` plus `error`.
3. **Versions never change.** Tests compare the other caller's graph with `JSON.stringify`, and version N's card, steps and graph as a run reads them, before and after.
4. **An interface change is a new line.** `saveProjectPartsOfAppliedFlow` (signature unchanged) and the repair write both go through `projectPartLineOf`. Same input and output ids and required flags is the same line, and names may differ. A different interface gets its own stable id, and `newer-versions.ts` compares interfaces as well.
5. **Others are told.** `get-project-part` sets `callers[].newer: { version, passedElsewhere, said }`. A Flow's run detail gets `metadata.partVersionFacts`, read at each `getFlowRunDetail` so it stays true. The words hold a part's name and version numbers, no ids.
6. **Try the newer version first.** The call step is overlaid with the newer pin and attempted again where the run stood, as a held fix, recorded as that step's `replace_unit`. So the frame, gates, ledger, review record and judged settle are all the existing ones, and the pin moves by the same path every fix does. While a newer version is waiting or on trial, a step inside it asks no model, as long as nothing lasting has landed there. If the trial fails it is put back, recorded against that version only, and the next newer version or else the model is asked, on the pinned attempt.
7. **An owned part's repair reaches the library.** After a change is applied to a Subflow already in the library, `keepProjectPart` (which calls `saveProjectPartsOfAppliedFlow`) writes the next version with the part's own name and purpose. The result, or a failure, goes on the application record and never undoes the Flow. A Subflow nobody kept writes nothing, and pinned callers do not move.
8. **Trust.** Per version, from the same rows. The version that failed gets no yes for a run that got past it on a fix or on a newer version. The version that ran gets it.

## Decisions I took

1. **A call inside a saved version cascades.** F calls P@k, P@k calls Q@M, Q@M is fixed. A version cannot change, so P also gets its next version calling Q's, and F's step moves to that. That chain is exactly what the judged run ran. Tested for a model fix and for a newer version.
2. **Several fixes in one run stack.** Each is written on what the fix before it left, recognised by `projectPartRepair: { runId, fromVersion }` on the version's snapshot. Without this, the second fix would have discarded the first. Any other pin than the one the run ran refuses with `part.repair_caller_changed`, because nobody tested against it.
3. **Only the steps that ran it move.** Paths come from the run's trace, status `succeeded`. Two steps that both ran move, and one that did not stays.
4. **A failed lasting step that surely did nothing does not count as landed.** `lasting-acts.ts` read alone counts any attempt of a step that declares a consequence, even a press the domain says never happened, which would block the main case (a save button moved). I filter only failed attempts the engine's own `automationStudioAssessAttemptFault` reads as `effect: unacted`, not `actUncertain`, not found at `confirmation` or `verification`, with no unknown or landed effect check, and not a call step. Everything else goes to `lasting-acts.ts` unchanged, and a read that throws counts as landed. The engine already retries such a step itself.
5. **A pinned call's repair unit is now always the part** (it was the part only when the child's trace carried a failure). Otherwise the model would be asked to replace the call step itself, cutting this caller off from the library.
6. **Part-level replace is refused when the pinned attempt may have landed** (`lasting_act_landed`, no model asked), because replacing a part runs it from its start. **A newer version that may have landed and then failed ends the run.** Neither is a new ending. Before this work a pinned part-level repair refused outright. A node-level fix inside the frame, which repeats nothing, is still asked for when something lasting has landed there.
7. **Which runs try.** Only runs that have `repairIncident`, meaning they may ask a model and keep what they make. A no-model or dry run, and a person's part run, do not. I did not bind it wider because the engine reads the callback's presence to say a fix is coming.
8. **What counts as refuted:** `trust.counts.failures === 0` is required to be offered. One failure anywhere stops the offer for every caller. A newer version needs no prior judged yes to be offered, as the brief says.
9. **A failed trial and a refuted trial are recorded in `project_part_runs`.** Verdict rows need a graph with a revision, and a version kept from a graph with none has no rows (w7 found this), so without this a refuted version would be tried again by every later run. A version a repair makes has its own source, `<partId>.repair.<shape>` at revision 1, so its verdicts attach to it alone.
10. **The judged yes is credited to the versions it made.** The order is version, then move, then credit. If the credit fails the moves are undone, since no mutation has reached the apply's rollback yet. A version already written stays: nobody calls it.
11. **A fix that changes only a masked literal** hashes the same as the version it came from, so it is refused as `part.repair_same_shape` rather than quietly kept as nothing.
12. **Consequences stamped on save only.** A saved step of a fix gets `declaredConsequences`, or the library refuses it as `part.unclassified_step`. The in-memory overlay stays as it was, held to its gate. The stamp comes through `patch.metadata`, set in `run-repair.ts`, because `live-patch.ts` strips it and is not owned. Tests that prepare a patch directly see no stamp, so "the graph the run ran and the graph saved" still match there. For owned Flows this does put `declaredConsequences` on saved fix steps where it was absent.
13. **`stoppedForGoodInside` in `mayAsk`.** The call step's own failure carries no category, so without this a pinned call would have tried a newer version past a permission gate, or for an item gone. It stops the model fix at that call step too. It applies only to pinned calls, so owned parts are untouched.
14. **Run detail fact computed at read, not written at run end.** Line 2560 of `service.ts` writes session metadata, which the detail does not copy.

## Commands run and observed results

All from the t866 worktree, on the final code unless marked.

From `packages/fluxiq`, the brief's command plus `src/framework/automation-service/service/project-parts/repair` (a new directory with tests). `runtime-session/in` has no tests of its own; its tests are in `runtime-session/tests`, run below.

```
pnpm.cmd exec vitest run src/framework/automation-service/service/project-parts/tests src/framework/automation-service/service/project-parts/repair src/framework/automation-service/service/runtime-session/in src/framework/automation-service/service/runtime-adaptation src/framework/automation-service/service/adaptations/tests/unit-repair-apply.test.ts src/engine/automation/frames/tests src/engine/automation/step-loop --minWorkers 1 --maxWorkers 2
 Test Files  36 passed (36)
      Tests  388 passed (388)
```

Beyond the brief, what the change could break. Run after the last code change, before only test files changed:

```
pnpm.cmd exec vitest run src/framework/automation-service/tests/in-run-repair src/framework/automation-service/service/runtime-session/tests src/framework/automation-service/executor/lifecycle-run src/framework/automation-service/executor/step-loop src/framework/automation-service/service/adaptations/tests src/framework/automation-service/service/project-parts/run/tests src/framework/automation-service/executor/target-reacquire/tests src/runtime/adaptation/live-patch/tests src/runtime/project-parts src/framework/persistence/automation/project/parts src/framework/automation-service/handlers/tests/project-parts --minWorkers 1 --maxWorkers 2
 Test Files  55 passed (55)
      Tests  486 passed (486)
```

No existing test was edited. Core root:

```
pnpm.cmd --filter fluxiq check
{"build-cache":"build","step":"fluxiq:check","reason":"inputs changed: packages/fluxiq; stored in the shared store (0 file(s), 0 bytes)","ms":32146,"source":"command"}   (exit 0, no error TS)
node scripts/structure-audit.mjs
structure-audit: passed (511 warning(s), 1097 baselined).
```

`.structure-baseline.json` untouched. The warnings went from 502 (w7) to 511; I did not separate which are mine. `service.ts`: `wc -l` 4304, three changed lines.

### The tests bite

Each safety line was broken, the isolation tests run, the line restored (`w10-mutate.mjs` in the scratchpad; each line confirmed back by `grep -c`):

```
MUTATION newer tried though something landed: Tests 1 failed | 41 passed (42)
  x trying the newer version first > is never tried after an act that landed, when the part then ends failed by its own word
MUTATION moved without the run's judged yes: Tests 5 failed | 36 passed (41)
  x keeping a fix to a saved version > refuses a cancelled run / a failed run / a run nothing judged / a run whose check was not performed / a refuted run
MUTATION a run may try a version again: Tests 1 failed | 40 passed (41)
  x trying the newer version first > a run tries a version once
MUTATION the failed version keeps its credit: Tests 1 failed | 41 passed (42)
  x a judged yes > on graphs with revisions
```

This found three tests that passed for the wrong reason, each replaced or added to before the counts above:

- The by-hand apply test was stopped earlier by the promotion gates, so `repair/tests/pinned-repair.test.ts` now tests the guard directly.
- "Tried once" also held through the failure record, so a second step pinning the same version now tests it.
- The fixture's graphs have no revisions, so a false credit could not show. The revision-chain test covers that.

### New tests

- `project-parts/tests/repair-isolation.test.ts` (real service, 34 cases): judged-yes move, revert, revision chain, credit, whole-part replace, fix held across calls, two fixes in one run, nested cascade; refuted, unjudged, failed, by-hand; told in `get` and run detail; newer first with zero repair-model calls and exact presses, another caller healed, refuted, tried once, each newer once and newest first, nested, gate, gone, lost answer, landed (two ways), trial landed, surely-nothing, whole-part refused; interface new line; owned part reaches the library, unkept Subflow does not.
- `project-parts/repair/tests/pinned-repair.test.ts`: the guard, including a cancelled run.
- `engine/automation/frames/tests/part-call-paths.test.ts`.

## Not verified

- **Nothing in a browser, on a real domain, or with a real model.** The host, the repair model and the judge are the fixture's. Real graphs may not declare consequences on every step, in which case `lasting-acts.ts` reads a plain press as not lasting, by its own rule, and a newer version would be tried after one.
- **Permission gates inside a tried version** are not exercised at dispatch. The fixture has no domain effect that the gate reads. The trial uses the same frame and options, so it should meet them, by reading only. The denial test covers only the stop after a refusal.
- **A cancelled run** is tested at the guard and by the existing settle tests, not by cancelling a live run through the service.
- **A person's part run with a real page.** The test stops at `part.wrong_site`. That the runner gives no repair is by reading: `repairIncident` and `learnInterruption` appear nowhere under `project-parts/run/`.
- **A pinned call in a repeat with a row, on try-newer.** A row-across-call test passes, but none combines it with a trial.
- **The repair write with a changed interface.** No patch kind can change a graph's interface, so `projectPartWriteNextVersion`'s new line is reachable only in principle. The rule is tested through the save.
- **An interruption learned inside a pinned frame** (`learnAutomationStudioInterruption`). Its handler steps carry no consequences, so I expect `part.unclassified_step` and `apply_failed` with the reason, nothing moved. Read, not run.
- **Full suites.** Not run, per the brief. The extension worktree was not touched or checked; the additive API field should not affect it.
- **Docs.** `docs/architecture/automation-studio.md` does not describe this. Shared docs were off limits, and the substantial-change rule applies at merge.

## What a person loses if an item is left out

1. Pinned part-level repair: a broken part that cannot be fixed step by step ends the run failed, on every Flow using it.
2. Judged-yes gate: an untested fix reaches a Flow nobody ran.
3. Immutable versions and isolation: one caller's repair silently changes another's Flow.
4. New line: a Flow is offered a version whose inputs it does not supply.
5. Being told: nobody can see that a working version exists until their Flow breaks.
6. Newer first: each Flow pays for the same repair again, and a retry could repeat a lasting act.
7. Owned repair to library: the library keeps the broken version while the source Flow is fixed.
8. Per-version trust: a version that failed looks proven by the run that got past it.

## Open questions and things found

1. **Detached recovery after a failed run.** When a pinned call stops at a permission gate or an item gone, the run asks no model, but `recovery/annotation/annotate.ts` afterwards still asks for a diagnosis and a patch, because the call step's failure carries no category. Observed: one `runtime_patch` request; no press followed and the pin stayed. It spends a small repair call. A fix needs either the call step's failure to carry the child's category, or a gate in `early-refusal.ts`. Neither is owned, and carrying the category changes what every reader of a call failure sees. I left it for your decision.
2. **Tried once, literally.** A second step in the run pinning the same old version is not given the newer version again, even if the first trial passed, so it asks a model. This is what the brief says, and a test pins it. To let a version that passed serve that second step, change `candidates` in `newer-versions.ts` to skip only those that failed.
3. **One failure anywhere stops the offer for everyone** (decision 8), even for a version with many passes. A site change could retire a good version from the offer until a person acts. `get` also stops telling callers about it.
4. **`judged-promotion` treats an unreachable judge as `refuted`,** because such a check is `performed: true` with a verdict that is not `answers`. Nothing moves, which is right, but the recorded word and the version's failure count say more than happened: a judge outage counts against a tried version. The rule is existing; only the failure record is mine.
5. **w7's gap remains:** a part kept from a graph with no revision gets no verdict rows, so a clean judged run earns it nothing. Trust stays "as today", per the brief.
6. **A second fix to a unit the first fix replaced, in one run,** should be refused at apply (`changed since the repair was made`): a unit's digest covers its metadata, and the saved first fix carries its stamped consequences. Read, not run. Safe, nothing moves; the run's result stands and the next failure asks again.
7. **The "Fixing a step" words** are said before a step holds back for a newer version, because the engine's word comes from a synchronous check. "Trying a newer version" follows. Slightly early, not false.
8. **Rollback leaves a version.** A failed apply or a person's revert restores the caller's pin and leaves the new version in the library. It stays offerable to others, which is true of what it is: it did pass a judged run.
