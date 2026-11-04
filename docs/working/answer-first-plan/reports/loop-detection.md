# Report: loop detection (t859)

## Outcome

Done, including the lead's six follow-ups and the last change to `same_act`. Nothing was committed. One limit remains: `run-muq310ht-ab80eed0` and `run-muq3ubys-4b4dbf5b` are no longer saved, so their shape is proven only with made-up tests.

Every role that runs the evidence loop now gets the detector, with no model call. Over 388 saved runs and 14,701 model calls:

- **In failed runs** it finds 28 near repeats, 7 cycles, 4 no-progress stretches, 262 same fixes and 8 same lasting acts.
- **In passed runs** the new patterns fire 24 times, every one a steer: no refusal and no signal.
- **On real work:** of 30 passed loops that landed 3 or more lasting acts, it fires in 3, and each is one target acted on twice. It fires in none of the 32 passed loops that read 20 or more distinct rows.

## The lead's six items

### 1. No new way to end

A due signal now does nothing for a caller with no `loopSignal`. Such a caller keeps steer and refuse, and ends only as it could before. Nothing new can end a task, and a test holds this. With a window of unproductive calls and no caller, the loop goes on past the point a caller would hear, and ends on the existing no-progress guard's own bound.

**One thing stays, on purpose.** A ladder refusal counts in the existing run of refused repeats, which stalls at three in a row as it always has. So a call the ladder refused can reach that existing ending sooner than the same call, reworded and run, would have. If you read "ends only as before" more strictly than that, the change is one line in `refused-repeat.ts`: leave ladder refusals out of `refusedAgain`.

The replay still prints `change_approach` and `ask_person` rows. They now mean "what a caller on the new path would hear", not an ending.

### 2. The same lasting act again

New pattern, `same_act`: a stated-lasting act on the same target, landing again with no new row identity since. It is never progress, however much the page changed. What happens next depends on the caller (lead's decision, so it cannot block a task that really asks for repeats):

| Caller | First repeat | Later repeats |
| --- | --- | --- |
| No `loopSignal` (old modes) | Told | Told, and **never refused** |
| `loopSignal` (new path), `askedRepeats` says nothing | Told | Refused before it runs, whatever else has moved |
| `loopSignal`, `askedRepeats` returns N | Up to N landings are work, and nothing is said | The next is refused before it runs |

**`askedRepeats(act) => number | undefined`** is a small input on the loop's configuration. `act` is `{ toolId, input, act? }`, and the Exploration lane fills the answer from the act record.

- **Words never lift it.** Nothing the model writes is read as a count. A `reason` or `summary` saying "asked for ten" changes nothing, and a test holds that.
- **Naming another act does not raise it.** The answer is read once, at the target's first landing, and kept.
- **A bad answer is no answer.** Anything but a whole number of at least one is ignored.
- **It keeps out of other patterns.** A repeat that was told is not counted toward a near repeat, cycle or no-progress window, so another pattern cannot refuse it in the old modes.

| Fact | Where it comes from |
| --- | --- |
| Stated lasting | The call declared a consequence (`automationStudioFlowDraftDeclaresLasting`), or the decision names an act of the instruction |
| Same target | The same fingerprint at the same place: `draft.ranWith` with its handles left out, and `routeState.page.location` |
| Landed | `effectApplied`, not refused |
| Starts again | A new row read since, the task's own row binding (`$row`, `$step`, a pass's `item`), or a landed undo (`undoes`) |

**Replay over passed runs that really acted on many rows.**

| Check | Observed |
| --- | --- |
| Passed loops | 320 |
| With 3 or more lasting acts landed | 30, and `same_act` fired in 3 of them |
| Reading 20 or more distinct rows | 32, and `same_act` fired in none |
| `same_act` firings in passed runs | 4, all steers, none refused |

**The 4 in passed runs,** each the same handle at the same location:

| Run | Steps | What happened | Verdict |
| --- | --- | --- | --- |
| `run-mv9q50uu-43801c27` | 24, 30 | A `modify_existing` press, two other clicks, the same press; both ended on the same page digest | Same act twice. Digests cannot say whether the clicks between undid it |
| `run-mvanrgho-fbff7480` | 108, 114 | The same shape | The same |
| `run-mvcws1l9-f43e197f` | 31, 33 | One `modify_existing` press twice in a row, moving the page each time | Same act twice. **It may have been meant,** for example a quantity, which `askedRepeats` now answers on the new path |
| `run-mvsknffp-153bc89a` | 132, 175 | A `create_new` press, a submission and a trial between, the same press; both ended on the same page digest | Same act twice, across a trial. The trial's reset may have undone the first, which a log cannot show |

None of the four would have been refused on any path, since no run landed the act a third time.

**In failed runs,** 8 firings and 2 refusals. The replay answers for the new path with no `askedRepeats`, so with no `loopSignal` those 2 would be steers: `run-mutcbgbx-812e88c5`, `run-mv6i28zl-a53d36db` (twice, then refused), `run-mv8c7unr-42a8456d` (twice), `run-mvac0ddx-f52ba929`, `run-mve8vn94-023a5213`, `run-mvswhobv-5eb308c0` (then refused).

### 3. The same control under a renumbered handle

Live, a call is keyed on what it really ran with (`draft.ranWith`) with its handles left out. A log does not keep that, so the replay uses the line the last page view printed for the handle, and its place among lines the same.

Handles do not reliably name one control. In the corpus, of 1,157 later uses of a handle whose earlier line was known, 903 printed the same line and 254 (22%) a different one.

**What each key costs, as `same_act` firings:**

| Key | Passed | Failed | Reading |
| --- | --- | --- | --- |
| Handle at a place (`--by-handle`) | 8 | 18 | Twice the firings: a reused handle reads as the same control |
| Fingerprint alone | 22 | 13 | **18 of the 22 were false:** one printed line, such as an add button, on different pages, each with a different handle and location |
| **Fingerprint at a place (built)** | **4** | **8** | The 4 above |

The other patterns barely move between handle and fingerprint: near repeat 28 failed and 1 passed both ways, cycle 8 and 4 by handle against 7 and 4 by fingerprint. Renumbered handles are rare inside one loop on one page, so the fingerprint's value is mostly in not confusing two controls. It newly finds one renumbered case, `run-mve8vn94-023a5213`.

**A limit.** Before a call runs only its handle is known. A handle not seen yet therefore runs once and is caught from then on, so a lasting act under a new handle can land once more before it is told.

### 4. The failed runs of 40 or more calls where nothing new fired

The count is now 18 of 96, down from 19 because `same_act` fires in one. By counts and codes, every one kept producing new facts. None shows one call or short block going round. They fall into three shapes:

| Shape | Runs | What the counts show |
| --- | --- | --- |
| A. A fight with the reset gate | `mvdflu8o`, `mvdhyf9k`, `mvdl5eg0`, `mvgf801u`, `mvgw1854`, `mvhibit5`, `mv85xmgq`, `mvrj7qg9` | Repeated `candidate.trial_reset_required`, `candidate.undo_unproved`, `candidate.undo_already_done`, up to 11 of one code in a run, spread over several fresh builders, each on new pages |
| B. A new revision each time, judged no | `mv7vor5f`, `mv8p0p7c`, `mv9ml775`, `mvdec14t`, `mvgo5xft`, `muxkzdjw` | 3 to 10 accepted revisions, or 24 edits, with `subflow.trial_no`, `trial_not_judged`, `trial_execution_failed`. Each fix was different, so none is the same fix |
| C. Still moving, never got there | `mv7vk3ol`, `mvcwf9u2`, `mvgo9wzn`, `mvhibk0z` | 12 to 20 distinct pages, 22 to 29 landed acts, few refusals, few or no trials |

| Run | Calls | Pages | Rows | Landed | Refused | Accepted/rejected | Longest dry | Top codes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `run-muxkzdjw-31a13429` | 26, plus 50 replayed and 24 edits | 14 | 0 | 12 | 4 | 0/0 | 5 | `web.action.succeeded` 12, `web.inspect.succeeded` 10 |
| `run-mv7vk3ol-9e11b266` | 60 | 20 | 0 | 29 | 9 | 1/3 | 6 | `web.action.succeeded` 24, `project.brief_refused` 3, `project.allowance_unavailable` 2 |
| `run-mv7vor5f-ea4d08b4` | 45 | 13 | 58 | 10 | 16 | 5/6 | 4 | `subflow.trial_no` 4, `project.brief_refused` 2 |
| `run-mv85xmgq-8a6a6f43` | 53 | 16 | 17 | 18 | 8 | 1/0 | 10 | `web.structure.detected` 12, `candidate.undo_wrong_target` 3 |
| `run-mv8p0p7c-c8412344` | 68 | 13 | 67 | 17 | 19 | 10/4 | 10 | `subflow.trial_no` 6, `subflow.trial_not_judged` 5 |
| `run-mv9ml775-9872e63e` | 90 | 13 | 8 | 39 | 21 | 5/4 | 17 | `web.action.rejected.target_covered` 6, `candidate.trial_unsure` 4 |
| `run-mvcwf9u2-28bb44fd` | 52 | 15 | 7 | 28 | 2 | 0/0 | 8 | `web.action.succeeded` 26, `web.inspect.succeeded` 17 |
| `run-mvdec14t-5b320706` | 48 | 4 | 0 | 6 | 9 | 5/3 | 7 | `subflow.trial_execution_failed` 4, `web.action.rejected.output_not_observed` 2 |
| `run-mvdflu8o-d99d3100` | 48 | 21 | 3 | 25 | 12 | 2/1 | 4 | `candidate.undo_unproved` 4, `candidate.trial_reset_required` 2 |
| `run-mvdhyf9k-3afd7eb6` | 49 | 20 | 2 | 32 | 5 | 1/0 | 4 | `candidate.undo_unproved` 2, `candidate.trial_reset_required` 1 |
| `run-mvdl5eg0-a56fdad7` | 47 | 20 | 0 | 22 | 16 | 4/2 | 6 | `candidate.undo_unproved` 6, `candidate.trial_reset_required` 2 |
| `run-mvgf801u-cc23575e` | 97 | 28 | 48 | 42 | 24 | 7/1 | 13 | `candidate.trial_reset_required` 5, `web.action.rejected.target_unobserved` 5 |
| `run-mvgo5xft-25460ba2` | 56 | 19 | 2 | 27 | 16 | 3/8 | 7 | `flow_bootstrap.evidence_completion_plan_invalid` 4, `subflow.scope_refused` 3, `candidate.trial_reset_required` 3 |
| `run-mvgo9wzn-fad4e050` | 55 | 18 | 7 | 26 | 5 | 0/0 | 6 | `web.action.succeeded` 24, `web.inspect.succeeded` 17 |
| `run-mvgw1854-5d10955b` | 95 | 16 | 11 | 35 | 23 | 3/1 | 9 | `candidate.undo_unproved` 8, `candidate.undo_already_done` 4 |
| `run-mvhibit5-e1d3a4f3` | 89 | 27 | 0 | 43 | 31 | 4/7 | 10 | `candidate.trial_reset_required` 11, `candidate.undo_unproved` 4 |
| `run-mvhibk0z-1950493f` | 47 | 12 | 21 | 22 | 3 | 2/0 | 6 | `web.action.succeeded` 18, `candidate.reset_witness_required` 1 |
| `run-mvrj7qg9-b6dc94f6` | 99 | 20 | 9 | 44 | 18 | 4/4 | 11 | `web.action.succeeded` 38, `web.action.rejected.target_unobserved` 4 |

"Longest dry" is the longest stretch in one loop with no new page, row or accepted submission. It is a simpler count than the detector's, which also counts a landed act as progress, so a stretch above 12 here need not have reached its window.

**Shape A is the one pattern that showed up, and I did not add it.** A generic rule would be "the same refusal code again with nothing new". It does not separate failed from passed:

| Measure | Passed | Failed |
| --- | --- | --- |
| Longest run of one code inside one loop | up to 5 (`subflow.scope_refused`, `run-mvcx106k-2c9e375d`) | up to 9 |
| One code across a whole run: median, 90th percentile, max | 2, 4, 10 | 3, 7, 20 |

So any threshold that fires on shape A also fires on passed runs. Most of it also crosses fresh builders, which D7 removes, and the reset gate itself is what D1 removes from exploration. Naming the codes would be fitting to these runs. If it survives the single-loop path it would need a rule on the attempt's record, and that path's runs are what can show whether it does.

**Two findings for other lanes, not loops:**
- `web.action.rejected.output_not_observed` appears in 14 failed runs (up to 16 in one) and no passed run.
- `candidate.trial_reset_required` reaches 13 in a failed run against 4 in a passed one.

**How far this goes.** Counts and codes show whether new facts kept arriving. They cannot show whether those facts were useful, so a run wandering through new pages reads as progress here. Shape C may be that.

### 5. The two small gaps

- **The card's words.** A refused call now reads per pattern (`ui/activity-action/refusal-words.ts`), such as "the same thing was already tried and nothing changed" and "that was already done, and doing it again would do it twice". The guard's own refusals keep "exactly this way".
- **A hidden card.** `refused-call.ts` and `draft-edit.ts` now pass over the detector's own rows when they look for what a decision came to.

Both were seen failing with the old code: `Tests 8 failed | 1 passed (9)` in `refused-loop-call.test.ts`.

These files are outside the original owned list. You named both gaps, so I took that as the instruction to change them.

### 6. The changed expectation in `stalled-amendments-replay.test.ts`

It stays changed, because item 1 does not touch it. The refusal comes from the refuse step, not from `due()`, so it happens for a caller with no signal too. The recorded toggle adds a step, drops it and keeps it again, which is the same fix, so the next drop is refused before it runs. The list reads `draft_amended`, `draft_amendment_undone`, `repeat_refused`, `draft_unchanged`, and the test's redirect assertions are unchanged.

## What changed and why

### Core

**`runtime/llm/repeat-guard/loop-detection/` (new).**

| File | What it holds |
| --- | --- |
| `types.ts` | The patterns, the facts of one call and one edit, the finding, and the signal the caller answers |
| `meaningful-input.ts` | Takes free text out of a call's input (`reason`, `summary`, a plan's `purpose`, `purposes`, `notAsked`, plain synonyms, never anything under `parameters`); the key of a call as it ran; row binding |
| `row-digests.ts` | A digest per kept row, from `readRows.rows` or the domain's `readRowsKey` |
| `detector.ts` | The rules, reading facts only |
| `watch.ts` | The ladder |
| `attempt-record.ts` | What an attempt tried, as a typed record |
| `feedback.ts` | The model's note, the refusal's words and the chat step's words |
| `loops-caught.ts` | Counts by pattern from a run's rows |
| `step-folder.ts` | A `NNNN-loop` folder in the step log |
| `replay.ts` | The ladder over a recording, with the real repeat guard beside it |
| `limits.ts` | The thresholds |

**`decision-handlers/loop-check.ts` and `loop-signal.ts` (new).** What the loop does with a finding. The other handlers and `evidence-loop.ts` gained small calls, and `evidence-loop.ts` is 799 lines against its 800 limit.

**The refusal path is reused.** A ladder refusal goes through `automationStudioLlmEvidenceHandleRefusedRepeat`, recorded `llm_evidence_loop.repeat_refused` with the pattern as its reason, and reaches the same stall, recovery and chat card.

### The rules as built

**Progress** is a page state, row digest, plan or revision, draft key or build key this loop has not seen, or an act that landed and moved the page for the first time from this page. A repeated lasting act is never progress. Counting calls decides nothing.

| Pattern | Fires when |
| --- | --- |
| `exact_repeat` | The guard refuses, as today. It stays the first case and refuses at once |
| `near_repeat` | One call, free text out, comes to nothing twice on one page |
| `cycle` | The last block of up to 4 calls equals the block before it with nothing new in its last pass, or one call runs 3 times in a row across pages |
| `no_progress` | 12 calls in a row without progress |
| `same_fix` | An edit brings the draft back to a Flow it already stood at for the second time, an identical edit changes nothing twice, or a submission that was refused or failed its trial comes back |
| `same_act` | Item 2 |

**The ladder.**
1. Steer: a `core.loop_check` note, a chat step, a row and a `NNNN-loop` folder.
2. Refuse: the next call that continues it is refused before it runs. A cycle's refusal falls on its acts, not its looks. A lasting act is refused only on the new path (item 2).
3. Change approach, then ask the person: typed signals, only to a caller that gave `loopSignal`.

Progress ends the incident at any step, except for a lasting act.

**Lifts stay lifts.** A near repeat the guard has since lifted starts again from nothing. Nothing here grants anything, so a call it lets through still reaches every permission gate.

**Never counted as repeats,** though what they bring still counts as progress: a validated temporary failure, a trial whose gate bounds its own re-tests, a rerun (measured as its amendment), a check, a written step, a person-needed answer, and a prior-node batch member.

**Decisions under the brief.**
- **A call on a page the loop cannot name, keyed on nothing else, is not judged,** as the guard records nothing there. A loop whose tools report no state is watched only for the same fix and the same act.
- **A look that came to nothing starts again from nothing once an act has landed,** because a reload needs handles shown again.
- **The place is read from the route state** that the result's parser lists and never reads, by shape, as a digest compared for equality. Without one, a lasting act's target is the call as written.
- **The domain's name for a target is asked only when it decides a refusal,** so a decision costs no extra `describeCall`. An existing test caught my first version doing that.

### What the Exploration lane must wire

1. Create one `automationStudioLlmLoopAttemptRecord(seed?)` per attempt and pass it to every loop of the attempt as `attemptRecord`.
2. Pass `loopSignal: (signal) => "continue" | "end"`. It is synchronous.
3. On `change_approach`, answer `end`, then start a fresh loop from the page as it stands, with the same record, the notes and the act record. `record.data().tried` is the list of what was already tried.
4. On `ask_person`, answer `end`, keep the best result and the draft, ask, and resume with a fresh loop on the same record. This comes after 2 fresh approaches.
5. Pass `askedRepeats`, filled from the act record, for a task that really asks for one act several times. Without it, a lasting act is refused from its second repeat on this path. The act record has to say how many a task asks for.

### The interface the lead can fix in the plan

```ts
type AutomationStudioLlmLoopAttemptRecordData = {
  version: 1;
  tried: ReadonlyArray<{
    kind: "call" | "fix"; key: string; toolId: string;
    outcome: "failed" | "changed_nothing" | "applied" | "undone";
    times: number; pattern?: AutomationStudioLlmLoopPattern;
    changes?: ReadonlyArray<{ step: number; change: string }>;
  }>;
  approaches: number;
};
```

`data()` is plain JSON for the attempt row and goes back in as `seed`. It holds digests, tool ids and closed words only, and a test holds it to that.

### What the run reports

- **In Core:** `automationStudioLlmLoopsCaught(result.trace)` counts by pattern. The rows use existing members, so no rebuilder changes.
- **For the Lab:** `loopsCaughtInSteps(stepsDirectory)` in `packages/test-runner/src/loop-replay/`. Wiring it into the Lab's report is the Lab lane's.

### Extension

`packages/test-runner/src/loop-replay/` (new): `read-steps.ts`, `replay-run.ts`, `corpus.ts`, `loops-caught.ts`, `cli.ts`, `index.ts`, with 6 tests. Run it with `node packages/test-runner/dist/loop-replay/cli.js <lab-runs directory> [--by-handle]`.

### Docs

`failure-control.md` has the full account. `llm-flow-bootstrap.md` and `automation-studio.md` point to it.

## Commands run and observed results

### Seen failing first

All run on `ladder.test.ts` from `packages/fluxiq`, each restored afterwards.

| Change to the code | Observed |
| --- | --- |
| Detector out of the loop | `Tests 22 failed \| 13 passed (35)`, on the final code |
| Detector counts calls (`progressed = false`) | Next-page and row-by-row failed: `Tests 2 failed \| 1 passed \| 25 skipped (28)` |
| Temporary failures counted, typed text taken as free text | Both failed: `Tests 2 failed \| 26 skipped (28)` |
| Place ignored | "the same control on another page" failed |
| Row binding ignored | "the task's own row binding" failed |
| Undo ignored | "an act undone may be done again" failed |
| New rows ignored | "a new row identity" failed |
| Fingerprint ignored | "is the same call: the fingerprint says so" failed |
| `askedRepeats` ignored | "+1 three times with askedRepeats 3 goes through" failed |
| `askedRepeats` read again at each landing | "the model's words never lift it" failed |
| Any count accepted | "an answer that is no whole number" failed |
| Lasting acts refused with no `loopSignal` | Both old-mode tests and "with no loopSignal it is not needed" failed: `Tests 3 failed \| 11 passed \| 21 skipped (35)` |

Place, row binding, undo, new rows and fingerprint each read `Tests 1 failed | 8 passed | 19 skipped (28)`, and `refused-loop-call.test.ts` with the old words and row lookup read `Tests 8 failed | 1 passed (9)`. Those, and the "counts calls" and "temporary failures" rows, ran before the last two changes (asking the target's name lazily, and `askedRepeats`), and I did not repeat them. The four `askedRepeats` and old-mode rows and "detector out of the loop" ran on the final code; the first three of those four each read `Tests 1 failed | 13 passed | 21 skipped (35)`.

**The last change, before it was built.** With the tests written and the code unchanged, the same-act tests read `Tests 6 failed | 8 passed | 21 skipped (35)`. One of the six, "the model's words never lift it", failed there for a wrong reason of my own: its script's decision had an extra member, so it ran nothing. I corrected the script, and its mutation above is what shows it failing for the right reason.

**Passing with the detector out and with no mutation to fail them:**
- "a loop with no caller to ask": an existing guard, the refusal run, reaches the same ending code, so it pins the ending rather than the path.
- "two controls that really are different": a negative test whose handles already differ.
- "a press that states nothing lasting": a negative test, not mutated.

### Final checks, on the finished code

| Check | Observed |
| --- | --- |
| `pnpm.cmd exec vitest run src/runtime/llm/repeat-guard src/runtime/llm/evidence-loop/tests src/runtime/llm/tests src/runtime/llm/decision-handlers/tests src/runtime/adaptation/recovery/tests src/runtime/project-agents/supervisor/tests src/runtime/flow-authoring/bootstrap/candidate/tests src/runtime/automation-activity/tests src/ui/activity-action --minWorkers 1 --maxWorkers 2 --reporter=dot` | Exit 0. `Test Files 214 passed (214)`, `Tests 2295 passed (2295)`. The last two paths are added because item 5 changed that code |
| `pnpm.cmd --filter fluxiq check` | Exit 0. `"build-cache":"build","step":"fluxiq:check"`, so it really ran |
| `node scripts/structure-audit.mjs`, Core | `structure-audit: passed (489 warning(s), 1097 baselined).` |
| `node scripts/structure-audit.mjs`, Extension | `structure-audit: passed (233 warning(s), 553 baselined).` |
| `pnpm.cmd --filter @fluxiq-web-extension/test-runner build` | Built, no `error TS` |
| `node --test dist/loop-replay/tests/replay.test.js` | `# pass 6`, `# fail 0` |
| `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` | Rebuilt, and the extension's gate reads that Core's build is current with its source |

### The replay's table

`node dist/loop-replay/cli.js C:/Users/osrs_/FluxStuff/lab-runs`, exit 0, as printed.

```
runs scanned: 388; model calls: 14701

| verdict | runs | fired | exact_repeat | near_repeat | cycle | no_progress | same_fix | same_act |
| failed  | 235  | 182   | 386          | 28          | 7     | 4           | 262      | 8        |
| passed  | 151  | 50    | 69           | 1           | 4     | 1           | 13       | 4        |
| unknown | 2    | 2     | 1            | 0           | 0     | 0           | 5        | 0        |

| ladder step     | pattern      | failed | passed | unknown |
| steer           | near_repeat  | 34     | 1      | 0       |
| steer           | cycle        | 7      | 5      | 0       |
| steer           | no_progress  | 8      | 1      | 0       |
| steer           | same_fix     | 345    | 13     | 5       |
| steer           | same_act     | 8      | 4      | 0       |
| refuse          | exact_repeat | 863    | 113    | 3       |
| refuse          | no_progress  | 6      | 0      | 0       |
| refuse          | same_fix     | 5      | 0      | 0       |
| refuse          | same_act     | 2      | 0      | 0       |
| change_approach | no_progress  | 2      | 0      | 0       |
| change_approach | same_fix     | 1      | 0      | 0       |
| ask_person      | no_progress  | 1      | 0      | 0       |
```

Counts in the first table are incidents; the second counts each step of the ladder. The table is unchanged by the last change to `same_act`: it answers for the new path with no `askedRepeats`, and those are the facts logs can give. "Fired" includes the exact-repeat guard, as today. The survey found 393 runs with step folders; 5 hold no call or edit to replay.

### The recorded loops

| Run | Recorded loop | What the replay does |
| --- | --- | --- |
| `run-muq310ht-ab80eed0` (a button pressed 20 times, one read rerun 8 times) | Not saved: absent from `lab-runs`, and a search of `FluxStuff` to depth 7 found nothing | Same shape proven with made-up data: a replay test catches 20 reworded presses at the second, refuses the third and signals; another catches 8 reruns; a scripted-model test does it through the real loop |
| `run-muq3ubys-4b4dbf5b` | Not saved, same search | Not replayed |
| `run-musr9pv3-f4bf6256` (one part run about twenty times) | Saved | 20 refusals from step 72 to step 174, the guard's own case. Three same-fix steers before that |
| `run-muwaobm2-882cadd9` (one amendment six times) | Saved | Same fix steered at step 85, refused at step 93 |
| `run-mv5uu9g1-9d80deea` (one stale detection four times) | Saved | Refused at steps 36, 42 and 44 |

### Every firing of the new patterns in a passed run

All 24 are steers. The 4 `same_act` are under item 2; these are the other 20. None is on a read that brought new rows.

| Run | Step | Pattern | Repeats | What happened | Verdict |
| --- | --- | --- | --- | --- | --- |
| `run-mut4fvkm-e2fc03e6` | 26 | same_fix | 2 | The same edit sent twice on one draft, nothing applied | Loop |
| `run-mut4fvkm-e2fc03e6` | 47 | same_fix | 2 | The same again, later in the run | Loop |
| `run-mv6i27oi-a87fb247` | 32 | same_fix | 2 | A script sent again after its trial said no; Core refused it unchanged | Loop |
| `run-mv6i2akr-516b2f03` | 66 | same_fix | 2 | The same | Loop |
| `run-mv9t72wa-84115545` | 175 | cycle | 2 | Describe and navigate to the same page, twice; the guard refused the next one | Loop |
| `run-mv9tx8ss-b9561b9e` | 68 | same_fix | 2 | A script sent again, refused unchanged, then the guard refused it | Loop |
| `run-mva4488t-c51bd732` | 39 | same_fix | 2 | A script sent again, refused unchanged. **The same revision then passed on retest** | Loop, with the words overstated (caveat 1) |
| `run-mvabzvhz-7202c977` | 59 | near_repeat | 2 | The same text typed from the same page twice, bouncing between visited pages | Loop |
| `run-mvabzvhz-7202c977` | 109 | no_progress | 12 | Bouncing between two addresses and repeating looks; the next submission was accepted and passed | Loop, steer came late (caveat 2) |
| `run-mvan7giv-4246aafb` | 152 | same_fix | 3 | One refused script sent again | Loop |
| `run-mvan7giv-4246aafb` | 158 | same_fix | 4 | The same script again after moving page | Loop |
| `run-mvapdyn2-a19374da` | 26 | cycle | 2 | Navigate to one address and detect, twice, with four more detections answered from memory | Loop, borderline (caveat 3) |
| `run-mvapdyn2-a19374da` | 28 | cycle | 3 | The same incident one call later, told again | Loop, borderline (caveat 3) |
| `run-mvdgaz8z-27ff3d1b` | 51 | cycle | 2 | Navigating back and forth between two addresses, no read | Loop |
| `run-mvdi9e8u-678c35df` | 68 | same_fix | 2 | A refused script sent again after a detection; refused again | Loop |
| `run-mvebbnwm-47169b0d` | 81 | same_fix | 2 | A revision whose trial failed brought back; its trial failed again, and a new one then passed | Loop |
| `run-mvebqbm4-b3f3b742` | 67 | same_fix | 2 | A script sent again, refused unchanged | Loop |
| `run-mvsknffp-153bc89a` | 203 | same_fix | 2 | A script sent again after its trial said no; refused, then the guard refused it | Loop |
| `run-mvsknvqv-555a5de2` | 81 | same_fix | 3 | A script sent again, refused unchanged | Loop |
| `run-mvtdpdpf-76a54b57` | 53 | cycle | 2 | Bouncing between two addresses, the guard refusing, the same find again | Loop |

**The caveats,** each only a steer:
1. `run-mva4488t-c51bd732`: the repeat was real, but the steer says the fix "did not work" when the revision later passed on retest.
2. `run-mvabzvhz-7202c977` step 109: 12 unproductive calls were real, but the steer arrived as the model was already leaving the stretch.
3. `run-mvapdyn2-a19374da`: the repeats were real, but the model was on its way to a good read at step 30.

### What this leaves uncaught

- **An act that states nothing lasting** and lands on a new page each time. It reads as work, because only a declared consequence or a named act makes it lasting. An under-declared lasting press is the plan's disclosed limit on D6 too.
- **A repeated lasting act in the old modes.** It is told every time and never stopped, by the lead's decision.
- **A renumbered handle's first landing.**
- **A loop in tools that report no state.** Only the same fix and the same act are watched there.
- **Loops shorter than a threshold.** A look repeated once, or 11 unproductive calls.
- **One gate refusing fresh builders in turn** (item 4, shape A).
- **A run that wanders through new pages to no use,** which reads as progress (item 4, shape C).

## Not verified

- **No live, browser, Lab or paid run,** as briefed. The chat step is proven as an activity event, not on screen.
- **The live fingerprint.** The replay's fingerprint is a page-view line and its place, because logs do not keep `draft.ranWith`. The live detector uses `ranWith`, whose selector could separate two rows the line cannot, or not. So the figures in item 3 are for the replay's key, and only live runs can measure the real one.
- **`askedRepeats` in a real path.** It is proven with a scripted model. The act record does not yet say how many a task asks for, and no caller gives `askedRepeats` or `loopSignal` today.
- **The live place.** A scripted-model test reads it from `routeState`. No real web result was run through it, though the domain's `webAutomationRouteState` writes `page.location`.
- **The replay approximates the page and the draft.** Saved logs hold no state digest or Flow signature, so a page is a digest of its page view or location, and a draft is the last edit of each step. Most of the 262 same-fix incidents in failed runs rest on that.
- **`exact_repeat` in the replay** is today's guard run over each recording, so for old runs it counts what the guard would refuse now.
- **Trials in the replay** are treated as bounded by their gate whenever they applied an effect, because logs do not keep `ownRetestBound`.
- **Stored run artefacts.** The new rows use existing members, but I did not run a stored build through `service/flow-bootstrap-commands/evidence-trace.ts`.
- **Downstream.** The extension's other packages were not typechecked or tested. `pnpm check`, `pnpm test` and Core's whole vitest run were not run, per the twice-a-day rule.
- **The audit's warning counts.** I did not check how many warnings are mine, and `.structure-baseline.json` was not touched.

## Open questions or contradictions found

Decided under the brief unless you overrule them.

1. **The new path depends on the act record saying how many.** Until it does, a task that really asks for three presses would have its third refused there, since `askedRepeats` answers nothing. `run-mvcws1l9-f43e197f` may be such a task. The old modes are not affected. D6 should carry the count.
2. **The steer's "did not work" for a same fix** can overstate, because a retest can pass on an unchanged revision (caveat 1). I left it.
3. **The no-progress window of 12** is measured only against these logs, whose builds were shorter and cut up by the supervisor. Re-measure it once the single-loop path has runs.
4. **Package versions** were not bumped, as briefed. This adds exports to `fluxiq/automation`, fields to the loop's input, and words to the card, all optional.
