# t551 project-build hardening (report)

Worker label: t551-project-build-hardening. Worktree `fxwork/t551/!FluxIQ`, branch `task/t551-project-build-hardening`. Nothing is committed.

This report covers the first pass and the supervisor's follow-up, which asked for (a) placing builder acts, (b) completing item 6 with a record contract change, (c) a reset whose ending fired but left nothing in place returning `done`, and (d) updating the docs. The supervisor accepted the extra edits from the first pass: `dispatch/types.ts` and `service.ts:187`, `:234` and `:1607`.

Paths below are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Done. Every item (1) to (6) and every follow-up item (a) to (d) is in place, covered by tests, and passing.

## What changed and why

### (1) A brief's own ending stops its loop

Files: `project-agents/dispatch/run-brief.ts`, `project-agents/dispatch/types.ts`, `service/project-build/brief-ports.ts`.

- **Contract.** `types.ts` adds `AutomationStudioProjectBriefEnding` (`{ signal, reason() }`). Both brief port types get an optional `ended` field.
- **Where the ending comes from.** `brief-ports.ts` builds `ended` from the brief gate's plan-refusal signal and its person-needed signal. Its reason names either:
  - the missing classes, the control and the request id; or
  - the person-needed issue code.
- **How the dispatcher uses it.** `run-brief.ts` runs the loop under `AbortSignal.any([signal, ended.signal])`. The builder's submission gets the same signal.
  - When the ending fired and the build was not stopped, the brief comes back `blocked` with that reason. Any proposal it had is still named.
  - (c) The exception is a reset that left nothing of the build in place. It comes back `done`, with the reset's usual words.
  - A build stop is still reported as a stop.

### (2) Permissions at promotion

New file: `service/project-build/permissions.ts`, class `AutomationStudioProjectBuildPermissions`.

- Every brief's gate is registered with the build as it is made.
- `view(buildGate)` merges all gates for promotion:
  - declarations: the briefs' first, then the build's own;
  - request: the latest standing request of any gate;
  - the instruction's one read;
  - a cross-check of all declarations together.
- `service.ts:1607` passes this view into `automationStudioBootstrapPermissionOutcome`.
- A merged instruction read that fails now throws. The structure audit forbids reading a failure as "nothing instructed".

### (3) The supervisor's reserve

New file: `service/project-build/reserve.ts`.

- The reserve is 4 judge calls at the judge's reserve pricing: 2 for the judged whole run and 2 for the repaired Flow's judged run.
- `run.ts` uses it. The purse already makes the reserve unallocatable to any brief.
- Left as it is, per the supervisor.

### (4) and (a) Placement and the service-level reset tests

**Placement**, in `service/project-build/brief-ports.ts`:

- A new `placing()` wrapper mirrors the candidate loop (`flow-bootstrap/candidate/authoring-loop.ts:146-156`). Each builder brief gets its own start check (the same settle as the candidate loop). The start is captured around the opening call. Every other call goes through `automationStudioSiteResetPlacedCall` with the brief's ledger, so each act keeps its page, what it changed there and the items it created.
- A reset brief's undo calls are wrapped the same way, without capturing a start. `reset-calls.ts` now also routes `actOf`, `placed`, `undoSeen` and `noEffect` to the ledger that owns the act.

**Tests**, in `service/project-build/tests/project-build-reset.test.ts`. Both run through the actual service with a scripted model:

1. **Recipe box** (from the first pass). The builder saves a recipe on its item.
   - The first whole trial is refused with `project.trial_reset_required`, naming `act-1`.
   - The reset Unsaves only that recipe and comes back `done` with nothing in place.
   - The recipe saved before the build is kept.
   - The whole judge runs only after the reset, and the Flow is proposed.
2. **Cart (new).** The domain runs through `core.run_node`, with native nodes add-to-cart, remove-line and go. Its `runsNodes.arrival` and `startState` list the cart drawer's lines by item token. The builder presses the item-less "Add to cart", which adds the herb-tea line.
   - The first whole trial is refused, naming `act-1`.
   - The reset removes that one line under `undoes: act-1`. It is admitted because the act created that item, and the domain never sees `undoes`.
   - The reset comes back `done`.
   - The cart keeps its dish-soap line from before the build.
   - The whole judge saw only the dish-soap line, and the Flow is proposed.
   - The record holds `act-1` as a builder act with class `create_new`.

**Proof that placement is what makes the cart case work:** with placement disabled by hand, the cart test fails (`expected ['add herb-tea'] to deeply equal ['add herb-tea', 'remove herb-tea']`). The file was restored afterwards.

### (5) Recording deletion retries

- `service.ts:942` and `:945` now call `removePathWithRetry`, with the name added to the import at `:187`.
- `service.ts` is still 4333 lines.

### (6) and (b) Every act in the build record

**Record contract**, in `project-agents/record/`:

- `build-record.ts` adds `AutomationStudioProjectBuildActOwner`: either `{ role: "supervisor" }` or `{ role: "builder" | "repair", briefId }`.
- It also adds `AutomationStudioProjectBuildLastingAct`: `{ recordedAt, act, owner, consequences[], description, undoable }`.
- `record.lastingActs` is now an array of these.
- The parser (`readLastingActs`) enforces:
  - an act id matching `act-N`, unique in the record;
  - an owner role, with a supervisor owner having no brief and any other owner having a recorded brief;
  - at least one unique lasting class;
  - a boolean `undoable`.
- The brief's `permittedActs` no longer restricts entries, so acts the person's own instruction permitted are kept.
- `store.ts` `recordLastingAct(ref, entry)` takes the new entry and refuses a duplicate act id or an unknown brief. The whole record is validated on write. An unused import was dropped.

**The writer**, `service/project-build/acts-record.ts`:

- There is one writer per project ledger (`of(ledger)`), so the whole trials and the briefs share it.
- `run.ts` calls `bind(records, ref)`. Acts recorded before the bind are written at bind time.
- `whole-trials.ts` feeds the whole trials' step classes into it.
- The owner is the supervisor or the brief, under the role the dispatcher runs that brief as. Reset briefs run as `builder`.
- With the new record shape, `unrecorded()` stays empty for supervisor acts, reset acts and acts the instruction permitted. It still lists any act the record itself refuses, with the refusal code.

### (d) Docs

`docs/architecture/automation-studio/llm-flow-bootstrap.md`, section "Authoring mode `project`", has five new bullets:

- a brief's own ending, including the reset `done` case;
- permissions at promotion;
- the supervisor's reserve;
- placement of each builder act;
- acts in the build record.

### Tests added or changed

- `project-agents/dispatch/tests/brief-ending.test.ts` (5):
  - the real builder loop stops after 2 decisions, comes back blocked, and names its proposal;
  - the loop's and submission's signals abort;
  - a reset with acts left comes back blocked;
  - a reset with nothing left comes back done;
  - a build stop is still a stop.
- `project-agents/record/tests/store.test.ts`:
  - writes in the new shape;
  - keeps supervisor-owned acts, instruction-permitted acts (`move_money`) and acts the site cannot undo;
  - refuses a duplicate act id, an unknown brief, an act with no class, a bad id, and a supervisor owner with a brief.
- `service/project-build/tests/project-build-acts-record.test.ts` (2):
  - builder explored and trial acts are written with owner and class, and read back by a fresh store on a disk root;
  - every kind of act is written: a supervisor whole trial written once the record is bound, an instruction-permitted `move_money` act (not undoable), and a reset brief's own act; `unrecorded()` is empty.
- `service/project-build/tests/project-build-permissions.test.ts` (2) and `project-build-reserve.test.ts` (2): unchanged from the first pass.
- `service/project-build/tests/project-build-reset.test.ts` (2): the recipe and cart cases above.

## Commands run and observed results

All were run in the worktree on the final tree; the vitest commands from `packages/fluxiq`.

- `pnpm.cmd --filter @fluxiq/contracts build`: reused (the stamp matched).
- `pnpm.cmd --filter fluxiq check`: `check exit 0`, with no `error TS` lines.
  - The only intermediate errors were in my tests: they still called the writer's now-private constructor, and were then updated.
- `pnpm.cmd exec vitest run` on:
  - `project-agents` (record tests included) and `service/project-build`;
  - the three `tests/service-recordings` tests that call `deleteRecording`, and `service/recordings`;
  - `llm/build-purse`;
  - `flow-bootstrap/tests/site-reset-build.test.ts` and `flow-bootstrap/site-reset`;
  - `service/flow-bootstrap-commands/tests`, `service/candidate-trial` and `service/subflow-trial`.

  Result: exit 0, `Test Files 90 passed (90)`, `Tests 670 passed (670)`. That is the earlier 85-file set plus the `flow-bootstrap/site-reset` tests.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (350 warning(s), 1156 baselined)`. The only warning on this area is the accepted 19-file advisory on `service/project-build/`.
- `wc -l service.ts`: `4333`.
- `git diff --check`: exit 0. `git diff --no-index --check /dev/null <file>` printed nothing for any untracked file.

## Not verified

- No live, browser or paid run: everything ran on the mock provider and stub domains.
- Placement adds a settled read (the 1-second settle) around each lasting builder call and each reset undo, as in candidate mode. Its cost on a real web build was not measured.
- Item (1) at service level, with a real refused plan step: the dispatcher was tested with a hand-fired ending, and the wiring in `brief-ports.ts` is checked by typecheck only.
- Item (2) through a full service build with a person who declines: tested on real gates only.
- Full suites were not run, per the rules.

## Open questions or contradictions found

1. **Persisted shape change.** The record now stores whether each act is undoable, but not whether it is still in place. A restarted build would read in-place state from the live ledger, which does not survive a restart. If resume after restart (post-MVP) needs it, an `undone` update on the record is the next step.
2. **Old records.** `lastingActs` entries written in the old shape (`briefId`, `consequence`) no longer parse, and a record holding them is refused. No migration was added. Such entries could exist only from a project build run between t549 and now, and the earlier wiring never wrote any.
3. **Reset owner role.** A reset brief's own acts are owned under role `builder`, because the dispatcher runs reset briefs in that role. If the record should name resets distinctly, the roles contract (`project-agents/contracts/role.ts`) would need a `reset` role.
4. **Reserve and file count**, as left by the supervisor: the reserve stays a constant 4 judge calls, and `service/project-build/` has 19 files against an advisory 15.
