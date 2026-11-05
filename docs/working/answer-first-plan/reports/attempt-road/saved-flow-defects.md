# Four defects on a saved Flow's road (t869)

## Outcome

Done from source, with stubs and the real service. All four are fixed and their tests pass. Nothing has run in a browser yet: that is yours, and the runs are below.

**Read this before the paid run.** Fixing defects 2 and 4 takes away the stops that kept a plain-press Flow from reaching its Save on attempt 2.
- An achieved attempt seeds an empty act record (`act-record/seed.ts:32`), and an answer-first Flow's Save carries no `ensureState`: only candidate submissions stamp it (`candidate/submission/submission.ts:263`).
- So by reading, the `plain` and `again-press` forms now run whole on attempt 2 and press each declared Save once, which unsaves the tables. Before, they stopped at the prompt or the Apply. I did not run this in a browser.
- This is the "same words typed again" rule you told me not to build, and it is now on the main road rather than only in the rounds. A saved `check` step is safe, because it reads the state first.
- I would hold the paid attempt 2 until the person has decided that rule.

## Each cause, and what changed

### 1. A saved read depended on an in-memory handle

**Cause, confirmed.** `node-call.ts:37` writes the handle into `ranWith`. The store is per process, per Flow, and holds 16 handles. So assembly refuses with `web.handle.unknown` at `extractList`, the route becomes `repair`, and the Flow never runs.

There is a worse case I found on the way: numbers restart in a new process, so `extraction.3` could come to name a different list without any refusal.

**Fix.** The step now keeps what its handle stood for beside it, under `extractionBinding`: item, every detected column, pager, frame (`plan-resolution/extraction/saved-list.ts`).
- Where a step holds one, it wins over the store, on assembly, replay and forward runs alike. Columns, conditions and order are re-read against it exactly as they are against the store.
- A number a step holds is never issued again (`handles.ts`, `saw`).
- The key is on the denied list, so the model never sees it. A model that writes one is refused.
- Next page needed nothing: its step already keeps the resolved request.

**Old drafts on disk.** They hold only the handle.
- Same process and same Flow: as before.
- After a restart or under another Flow: refused, route `repair`, seeded and not run, and the model re-detects. The task still gets its result; it costs money. The next save carries the binding. They cannot be salvaged, because the resolved request was never kept.

**Limit.** A model that rewrites a saved read's conditions after a restart names a handle the store no longer knows. It is told to detect again, which costs a call or two and is not a failure.

### 2. The run gate held back every repeated plain press

**Cause, confirmed.** `settling.ts:92` read the floor `effectClass: "commit"` as lasting, and every click has that floor (`action-effect/table.ts:20`). That floor means "a page decides what this does, so don't repeat it after a lost answer". It does not mean "this lasts". `record.carried` then refused the second press.

**How a plain press is told from a lasting one, using what Core already holds.** A press lasts if any of these holds:
- it declared a class (`metadata.declaredConsequences`);
- a floor names a consequence;
- it is marked destructive;
- its draft step claims a lasting act of the person's request (`flow-run/act-claims.ts`, new). The kinds are the existing `AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS`. `set`, `open` and a choice such as `a1.colour` do not count, as in the build's first test.

Anything else with a commit floor is a plain press, and it runs each time the Flow says.

**An undeclared press with an effect (t861's choice), now at run stage too.**

| What it answered | What the record holds |
| --- | --- |
| It acted | `may_have_landed`, `undeclared`: told to the next round, left out of the result's acts and of every refusal |
| Nothing certain | `may_have_landed` and held to a look. It may be the one that landed, and the engine stops on it anyway |
| Nothing acted, or already in state | nothing |

**Unchanged.**
- A declared or claimed press never goes twice, within a run, across steps or from a by-hand act.
- A plain press of a control a declared one already pressed is refused.
- The row-left-behind guard covers plain presses too.
- The engine's own retry rule still treats a commit floor as lasting.

**Consequences to know.**
- A toggle whose step neither declares nor claims is pressed as often as its Flow says. A model that hides its act gets that; only the Lab's oracle sees it.
- A plain press on a row that comes round in another shape can go twice. In the same shape, the engine's own ledger still stops it.
- A plain repeat is no longer capped by "add 3". The count only applies to a step that says it lasts.
- An old record from an unfinished attempt may still hold a plain press as `flow_step`, so its seed holds it once more.

### 3. A control already in its state read as changed

**Cause, confirmed.** `check.ts:88` answered success with no `skipped`, unlike `click.ts:588`. So `node-answer.ts` called it landed, and the card said "Changed something that was already there".

The evidence's "6 acts" were two things on each of three rows: the `check`, and the plain press that opened the row, read as lasting by defect 2. Fixing both removes all six.

**Fix.**
- `check.ts` says `skipped: "already_in_state"` when nothing changed and the state is the one asked for. It does not say so when the control ended in the wrong state. The dispatcher and the engine already carry that word, so the run reads `skipped`, the card reads "Not pressed: ...", and the record holds nothing.
- By hand: `node-run/run.ts` now puts `skipped` on the evidence, and `act-record/gate/read-answer.ts` reads it as nothing done.

**Outside the listed paths.** `apps/extension/src/content/actions/check.ts` and its test are not under `action-runtime/**`. You named that line as the defect and the fix cannot be made from `action-runtime`, so I changed it. It is two small hunks. Please check no other worker holds that file.

### 4. A remembered prompt stopped a saved Flow

**Why it wasn't flagged, confirmed from `run-mw3o6pgv` steps 0008 and 0010.** The press that opened the location dialog also brought up the prompt in the same instant. `own-layers/memory.ts` read both as opened by that press. So pressing the prompt's way out "answered nothing", `interruption` was not set, the step was required, and it stopped the run once the page remembered declining. That file's own header named this limit.

**Fix (`own-layers/memory.ts`).** A press opens one thing. Where one new layer's own controls are covered by another new layer, the covered one is the press's, and what stands over it came from elsewhere. It uses structure only and names no words. A dialog and its own backdrop stay the press's, as t193 needs.

**How a saved Flow's run handles a prompt today, which the fix relies on.**
- A flagged step is optional in the routing. Target absent means skip and go on; target there means press.
- A prompt that rises at another moment over a covered press is cleared by the extension's defence, which already leaves a body-level layer clearable (`interference/run-opened.ts`).
- The explored layer handlers are not applied on this road: they are only lowered in candidate submission.

**Limit that remains.** An unmarked prompt rising in the instant after a press that opens nothing else new still reads as that press's. A step answering it stays required, and if the prompt is absent next time the run stops and the rounds carry on: it costs money, not the result. Drafts already saved are the same.

## Other modes

- The run gate's change is only under `settle: true`, which is answer-first.
- Three domain changes reach every mode, and all are right for them:
  - the own-layers rule, because a prompt over a press's layer is an interruption anywhere;
  - `extractionBinding` in `ranWith`, because same-process resolution gives the same request;
  - `skipped` from `check`, because a trial's landed acts already leave that out.
- Old-mode and domain tests pass below.

## Commands run and observed results

Core, from `packages/fluxiq`, all with `--minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**"`:

```text
npx vitest run ... src/framework/automation-service/service/answer-first src/runtime/answer-first src/runtime/llm/node-tools src/framework/automation-service/executor/node-execution
  Test Files 137 passed (137)   Tests 1466 passed (1466)
npx vitest run ... src/runtime/flow-authoring/bootstrap/candidate/tests
  Test Files 39 passed (39)     Tests 260 passed (260)
npx vitest run ... saved-read-restart, saved-flow-road, plain-press, act-gate (rerun after a test-only type fix)
  Test Files 4 passed (4)       Tests 46 passed (46)
pnpm.cmd --filter fluxiq check                 exit 0
node scripts/structure-audit.mjs (Core)        exit 0, "passed (529 warning(s), 1097 baselined)"
```

I did not change the engine or the executor, so I ran only `executor/node-execution` from them.

Extension:

```text
DOMAIN_TEST_BUILD_LABEL=t869-saved node scripts/test-domain.mjs runtime/llm-evidence io/tests/gateway-output-dispatcher client/tests/gateway-mapping actions/action-effect     (from domain/)
  tests 1725, pass 1725, fail 0
node scripts/test-extension.mjs action-runtime actions/tests/check actions/tests/click/tests/ensure-state     (from apps/extension)
  tests 507, pass 507, fail 0
npx tsc -p tsconfig.json --noEmit (domain)     exit 0
npx tsc -p tsconfig.json --noEmit (extension)  exit 0
node scripts/structure-audit.mjs               exit 0, "passed (244 warning(s), 552 baselined)"
```

- I ran the domain tests with `test-domain.mjs` directly, so against Core's existing `dist`. The `core-build` gate would refuse it while Core source is newer, and you asked for no rebuild. The domain changes use no new Core code.
- Mutation check: with the own-layers rule disabled, the direct test and the real-runtime test both failed ("tests 11, pass 9, fail 2"). I restored the rule and reran.

The proofs you asked for:

| Defect | Test | Shows |
| --- | --- | --- |
| 1 | Core `answer-first/tests/saved-read-restart.test.ts` | Real service, save, `close()`, new service over the same data directory: 0 decisions, 1 judge call, `path: run_flow`, digest matches, rows right, proven whole. An old draft goes to `repair` and still achieves. Under another Flow too |
| 1 | Domain `extraction/tests/saved-list.test.ts` | Real resolver and store: a process that never saw the list resolves the identical request, in another Flow, past 16 handles, on replay; number collision; model-written refused; not shown to the model |
| 2 | Core `run-acts/tests/plain-press.test.ts`, `flow-run/tests/saved-flow-road.test.ts` | On a toggle stub, a declared Save goes once and stays on; a plain press runs twice; a claimed press goes once |
| 3 | Same road test; `act-gate.test.ts`; extension `check/tests/actionability.test.ts` | `ran: skipped` in Core's words, "Not pressed" on the card, empty record |
| 4 | Road test; domain `own-layers/tests/{memory,prompt-over-opened-layer}.test.ts` | Absent: skipped, run reaches its end. There: pressed, run reaches its end. Real runtime flags the shape from the evidence |

**The two halves of defect 1 are joined by contract, not in one test.** Core must never import this repository, so the Core test uses a stub domain with the same memory behaviour, and the domain test uses the real resolver. The browser runs below are the first place they meet.

## The browser runs to do next

First rebuild Core, the domain and the extension in the t869 trees. The two other workers' files need to be settled first.

```text
FLUXIQ_ATTEMPT_SCRIPT_FORM=<form> pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --scripted-model --attempts 2
```

**1. `again-check`: expect exit 0.** This proves defects 1 and 3.
- `attempt-2/site.json`: `"change": {}`, `"activity": []`.
- `attempt-2/answer-turn.json`: no `siteLines`. It held 6 in `run-mw3r7gal`.
- The picture: no "Changed something that was already there", no "acts on the site", and "Not pressed" on the Saved steps.
- The step log: no "The saved steps did not assemble" line.
- `attempt 2` line: `It took the run of the saved Flow, and needed nothing else`, with the digest proven.

**2. `plain`: expect exit 1, for the reason at the top.** This proves defects 2 and 4 and shows the rule on the road.
- The run gets past step 5, where `run-mw3o6pgv` stopped. Cookies and the prompt are both skipped, on a page that remembers.
- Both Applies run: the URL carries `radius=5`, and neither reads "Already done".
- Then each declared Save is pressed: `unsaved` three times in `activity`, `change` at -1 on all three, and the answer is wrong.
- If `change` is `{}` instead, my reading above is wrong, and I want to know why.

**3. `again-press`: expect exit 1.** The same as `plain`, but the presses now come from the run itself. The by-hand presses in the rounds should not be reached.

**4. Attempt 1 of any of these, on a fresh account.** In the draft, `not-now-N` should carry `interruption`. Attempt 1 is not otherwise changed.

**Not reachable with today's Lab:** a Core restart between attempts with the real domain. `--attempts 2` stays in one Core process, and the Lab is outside my paths. If you want that driven for real, the command needs a restart between attempts.

## Not verified

- Any browser, any real page, any paid run or real model.
- A Core restart with the real domain and real service together (see above).
- The capture's real `parent`/`coveredBy` for the dialog's controls. `page.txt` shows `covered-by t457` and the `t449` dialog, not the raw fields. Rule 4 uses `inDialog`, the `parent` chain or the dialog's box, and I proved it on stubs of that shape.
- The by-hand card for a press already in its state. The record and evidence say so, but I did not trace or change the row a by-hand call draws.
- A second run within one attempt over rows pressed plainly.
- Firefox.
- The full suites: narrow checks only, as asked.
- The "Working · Step 11 of 11" strip the last report noted: not mine, not traced.

**Docs not updated: they are outside my paths.**
- `docs/architecture/automation-studio/` should say a plain press isn't lasting at run stage.
- The extension's page-evidence or extraction doc should name `extractionBinding`.

## Open questions

1. The "same words typed again" rule, which the top of this report makes urgent. I did not touch it.
2. Should answer-first Flows get `ensureState` on a press explored as a toggle, as candidate submissions do? That would make a whole rerun of a real model's Save a no-op, whatever the rule says. I think yes, but it is outside this brief and in the draft/bootstrap paths.
