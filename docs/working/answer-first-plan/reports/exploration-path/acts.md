# The act record, its two gates, and the double act (t861, worker: acts)

## Outcome

Done. **The double act is real on today's path: on a `candidate` build through the real service, the build's trial pressed once and the applied Flow's first run pressed again, two presses for one ask, and nothing stopped it.** With an act record in place the same run does not press, says so in the chat, and a second run does press.

## What changed and why

**`S/runtime/answer-first/act-record/`** (new; `S/runtime/answer-first/index.ts` exports only this):

- `AutomationStudioAttemptActRecord` as `design.md` fixes it.
- Identity (`identity/`): row digest without minted fields; target keys in handle, address and fingerprint forms, matching on any; act id.
- Row ties (`row-ties.ts`): which row a by-hand press belongs to.
- `automationStudioAttemptActGate` and `automationStudioAttemptActForward` (`gate/`).
- Mergers (`mergers/`) and a strict data parser (`record-data.ts`).

**`SVC/answer-first/run-acts/`** (new):

- Latest record per Flow in `attempt-acts.json` beside the Flow, with a memory fallback.
- The run gate over `nativeNodeExecutor` and `effectDispatcher`.

**`SVC/runtime-session/graph-options.ts`:** a run that names `carryActs` is awaited and gated. With nothing to carry it returns today's options; a test holds this with `toStrictEqual` (nothing added). Trials name nothing and stay synchronous.

**`service.ts`:** one existing line extended, no lines added. `git diff` shows 1 insertion and 1 deletion.

### Decisions the driver and supervisor should know

1. **The web domain's rows print no handles today.** `noteReadRows`'s handle map alone would never tie a by-hand first row, and D2's forward run would press that row again. So two more ties were added, read from real answers:
   - the answer's `actedOn` sentence, matched on the row's own words;
   - the page the act was made on, matched against the row's link.

   A sentence that fits several rows marks them all: leaving a row out is recoverable, pressing it twice is not.
2. **A landed act's repeat is refused even if the repeat declares `[]`.** Otherwise a model told "already done" gets through by declaring nothing. An undeclared press is still never refused because of another undeclared press, and stays out of `acts()`.
3. **Consumed once, refined.** A first run that ended `failed`, `cancelled` or `interrupted` gives its acts back, because running it again is the same ask. Without this, a first run that stops before the act means the retry presses again. Only a run that reads success spends them. This goes past the brief's plain wording.
4. **An unreadable record refuses one run.** The run does not start and says why; the file is moved to `.unreadable`, and the next run goes ahead. Reading it as absent would be the one wrong answer. The structure audit (`failure-as-empty`) also refuses that reading.
5. **A match excuses every matching dispatch of that one run.** This includes a row-less repeat that means to press N times, which errs towards doing too little.
6. **Core names no domain field.** `web-vocabulary` forbids `selector` and `accessibleName`, even in key lists. An address is therefore told by its shape (`identity/address-shape.ts`). This is the least certain reading in the record: an unusually shaped typed value could be misread.
7. **Additions beyond `design.md`, all optional:**
   - `settled`'s outcome takes `ranWith` and `actedOn`;
   - new methods `notePlace` and `carried`.

## The exports the driver must call

Import from `S/runtime/answer-first/index.ts` and `SVC/answer-first/run-acts/index.ts`:

```ts
const store = automationStudioAnswerFirstRunActStoreOf(this, { paths: this.projectPaths, flows: this.flowPaths, projects: this.projects });
const record = new AutomationStudioAttemptActRecord({ persist: (data) => store.save(projectId, flowId, data) }); // seed: only to continue an attempt
const executeTool = automationStudioAttemptActGate({ record, executeTool: inner, readRowsKey: binding.readRowsKey, wordsOf /* optional */ });
loop.forwardRun = automationStudioAttemptActForward(record);   // rowDone + stepDone; passes are recorded by the gate, so no `passed`
fresh round: record.forModel()   // what the round is told
result: record.acts()
before the attempt returns: await record.flushed()   // or the first run may not see the last act
```

- Pass the same `this` as the service line, so the memory fallback is shared.
- The permission gate wraps this gate, as `design.md`'s order says.
- A new attempt on the same ask may seed from `store.get(...)`. A person's fresh ask should not.

## Commands run and observed results

Run from `packages/fluxiq` unless noted.

```text
pnpm.cmd exec vitest run src/runtime/answer-first/act-record src/framework/automation-service/service/answer-first/run-acts --minWorkers 1 --maxWorkers 2
 Test Files  7 passed (7)
      Tests  114 passed (114)

pnpm.cmd exec vitest run src/framework/automation-service/service/runtime-session --minWorkers 1 --maxWorkers 2
 Test Files  19 passed (19)
      Tests  134 passed (134)

(worktree root) pnpm.cmd --filter fluxiq check
 exit 0, no error TS lines

(worktree root) node scripts/structure-audit.mjs
 structure-audit: passed (488 warning(s), 1097 baselined).  exit 0
```

The probe is `SVC/answer-first/run-acts/tests/double-act.test.ts`. It uses a real service, a scripted model, a stub target and real SQL. Press counts were asserted at each stage:

- (a) trial 1, then run 2;
- (b) after the attempt's press, the first run adds 0 and the second run adds 1.

## Not verified

- **The real web domain.** No browser and no Lab. All web shapes were read from `domain/src/runtime/llm-evidence/` and restated in tests. The Core stub's plan round trip was exercised; a real draft's `ranWith` to Flow node round trip was not.
- **Row identity between a real read's rows and a real run's For Each `item`.** If a Flow's record output reshapes a row's fields, the digests differ and that row would press again. This is the biggest open risk. The Lab's double-act oracle must cover it.
- **`legacy` and project-build paths.** The probe ran `candidate`. Discovery suggests the others behave the same; this was not run.
- **`effectDispatcher` for a Core `builtin.policy.action` in a loop.** It has no row at that seam, so it compares by output and parameters only.
- **Command-run (`requiredCommands`) sessions under a match.** Not exercised.
- **Two processes sharing one data directory.** "Taken once" is serialized per store instance only.

## Open questions or contradictions

- **A stepper is refused by design.** `already_done` refuses pressing one declared control several times on purpose ("add 3 of this", quantity plus). `design.md` and D6 say an identical repeat is refused, so this was followed. It needs a decision: such a task can only finish if the model finds another control or a typed quantity. The same applies to a row-less repeat in the first run.
- **The engine's own hazard remains.** A run's own completed acts live only for one engine run, so a repair's rerun from the start can repeat acts that run made (discovery section 5). The gate does not cover those, and the engine was not this worker's to change.
- **A skipped step's outputs are empty.** The record keeps no page values, so a later step bound to that output fails before it acts rather than acting on nothing.
- **Temporary debug edits.** Two were made to `generation-catch.ts` and `candidate-generation.ts` to read a failure, and were restored from copies at once. A later status shows neither modified.
- **The module-cycle failure.** A value import from `runtime/llm` in this directory made `runAutomationStudioLlmHarness` undefined through a half-filled barrel (the error seen was `runAutomationStudioLlmHarness is not a function`), which is why `read-call.ts` restates the three reserved replay keys. A test fails if they part. Anything else the driver adds to `act-record` should not import values from `runtime/llm`.
