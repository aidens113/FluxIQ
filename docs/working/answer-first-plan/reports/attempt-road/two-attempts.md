# Two attempts, one command, no reseed (t869)

## Outcome

Done, and it found what attempt 2 paid runs need to know first.

- `pnpm lab attempt ... --attempts 2` runs attempts 1 and 2 from the real chat, with no reseed, and judges attempt 2 against what attempt 1 left.
- **Right proof:** exit 0. Attempt 2 pressed nothing, changed nothing on the site, showed the right rows, started from attempt 1's saved work by digest, and spent less.
- **The proof can fail:** exit 1, answer wrong, naming all three rows. I took nothing out of Core for this, because nothing in Core stops it: the act record starts empty after an achieved attempt (`S/runtime/answer-first/act-record/seed.ts:32`). A press across attempts lands. The Lab catches it, and Core does not.
- **The road did not work before this.** Attempt 2 in the chat never ran the saved Flow, because of a defect in the task key. That is fixed. Three more defects outside my paths are listed below, and one of them decides whether attempt 2 works the day after attempt 1.

**Decision for you:** Core's rule is that the same words after an achieved attempt mean "do it again" (`second-attempt/design.md`, "What carries between attempts"; pinned by `later-attempt.test.ts`). This brief says they do not. That rule is written by an agent, not stated by the user as far as I can find. I judged the Lab by the brief and left Core's rule alone, since you told me to keep that test running. My recommendation: carry an achieved attempt's landed acts when the same words are typed again, and let the Run again button be what means "do it again". Until that is settled, a real model on attempt 2 can undo a person's saves, and only the Lab would notice.

## What "right" is

On attempt 2 the site already holds attempt 1's acts, so right means:

- the task's end state still holds;
- no lasting act landed again, which is a change of nothing;
- the rows are right and shown.

If attempt 1 was cut short, what it left undone is still asked. Pressing again reads as:

- **On a count:** `repeated_act`, asked 0 and what landed.
- **On a toggle:** a change away from the end state, named in `unaskedChanges`, and the rows and the final state fail too.

Attempt 1's oracle is untouched and never reaches this code (`flow-lane/creation/site-change/later/`). A task that means "do it again" says so in its own words, which makes it another task with another key and its own row in the asked table.

## One thread, and why

Both attempts use one workspace and one thread. The second is the same words typed into the same chat. That is what a person with the panel open does, and the second answer sits under the first with the "This time / First time" line. `--reseed` is not on the command, as there is no use for it. The series still takes `between: "reseed"` for the older scripted proof.

## What changed and why

**Core: the read of what an attempt started from.**
- `attempt.startedFrom` is `{ route, attemptId, stepsDigest }`, and `saved.stepsDigest` is on `ready` and `partly_works`. Both are in the contract and restated in `ui-components/src/chat/ports/results.ts`.
- I put them there rather than as a new outcome field because the extension's reader refuses any unknown outcome key (`read-task-outcome.ts:6`). This way `apps/extension` needs no change.

**Core: defects fixed on the road.**
- **The task key (`attempt/task-words.ts`, new).** The attempt keyed a task by every active instruction as `title\nbody`, and the chat looked it up by what the person typed. They never matched, so every repeat in the chat made a new blank Flow. A saved read names its list by a handle that belongs to one Flow, so the saved steps did not assemble and never ran. The key now comes from the Flow's one generation goal. Tasks saved under the old key start at attempt 1 again.
- **The chip (`attempt-store/outcome-of-record.ts`).** Under a whole run judged yes, the chat said "They have not run on their own yet". It now says "They worked last time".
- **The step log (`attempt/opening.ts`, `flow-run/assemble.ts`).** It now says why saved steps did not assemble, with each issue's code and place.
- **One edit outside the listed paths:** `apply-proven/tests/apply-proven.test.ts:63` asked by the old key, so it now asks by the person's words.

**Lab.**
- `--attempts 1|2` in `commands.ts`; one attempt stays the default. `scripts/lab` needed no change.
- `run-attempt-series.ts`: `between` and `mayGoOn`. Attempt 2 does not run after a wrong first answer, a person's Stop, a wait with nobody coming, or an empty balance, and it says so and exits 1 (`live/can-go-on.ts`).
- `live/live-driver.ts`: baseline read at each attempt, known attempts, `startedFrom` from Core, what attempt 1 left.
- `live/result-line.ts`, `report.ts`, `run-attempt-command.ts`: one line per attempt, the comparison, `attempt-1/` and `attempt-2/` folders. `attempt.json` carries both attempts.
- `AttemptReportRow.against` is added and validated in `attempt-score/`.
- `live/balance-failures.ts` split out of the paid bundle. `docs/architecture/testing-facility.md` updated.
- Script forms `again-check` and `again-press` in `local-classifieds-save-dining-tables.ts`.

**A temporary edit, restored.** `domain/src/runtime/llm-evidence/structure/handles.ts` carried a trace while I found the cause. I copied it first, restored it from the copy, `cmp` said identical, rebuilt, and `git status` shows `domain/` clean.

## What a real attempt 2 does

`partly_works` and `unproven` do **not** stop Core from running saved steps: it runs them, and only `repair` (steps that do not assemble) stops it. Attempt 1 leaves `partly_works, unproven`, and attempt 2 takes it up.

| Saved Flow | What attempt 2 did | Evidence |
| --- | --- | --- |
| `plain`: hand journey, plain press | Stopped at step 5, the "Not now" prompt the site now remembers. Cookies were skipped correctly. | `run-mw3o6pgv-ffa1a04c` |
| `again-check` before its Flow changed, prompt marked optional | Stopped at step 9, because the second Apply was held back as already done, so the dialog stayed open. | `run-mw3ommzb-d16323ec` |
| `again-check`: list by address, `set Saved to checked`, read of saved items | Ran whole. Judge only. Pressed nothing. | `run-mw3r7gal-3ef7639e` |
| `again-press`: hand journey, then the model presses each table again | Stopped on the way, then the three presses landed, with their act declared. | `run-mw3rfe9e-af5a3ce8` |

So the right proof holds for a Flow shaped to run whole. A paid model's Flow will more likely keep its hand journey, stop, and reach the rounds, where nothing stops it pressing again.

## Commands run and observed results

Evidence folders are under `fxwork/t869/!FluxIQWebExtension/test-runs/attempts/`.

**Right, on final code.** Visible browser, real chat, provider-free.

```text
FLUXIQ_ATTEMPT_SCRIPT_FORM=again-check pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --scripted-model --attempts 2
exit 0, run-mw3r7gal-3ef7639e

attempt 1: answer right. Ended achieved, 5 rows stored, 5 shown, 33 live steps, 27 calls, 0% of input from cache, $1.3842, 69 s. NOT LIVE, stand-ins: model, spend.
attempt 2: answer right. It ran against what attempt 1 left, with no reseed; it found already done: The three cheapest dining tables saved. It changed nothing on the site. It took the run of the saved Flow, and needed nothing else. It started from the first attempt's saved work, proven by the digest. Ended achieved, 5 rows stored, 5 shown, 16 live steps, 1 calls, 0% of input from cache, $0.0098, 38 s. NOT LIVE, stand-ins: model, spend.
attempt 2 beside attempt 1: 26 less calls, 675580 less tokens, $1.3744 less dollars, 30 s less time, 17 less live steps
second attempt started from the first's draft: proven
```

- `attempt-2/site.json`: `"change": {}`, `"activity": []`. No `unsaved`.
- Digests: attempt 1 `saved.stepsDigest` and attempt 2 `startedFrom` are both `663706175ea3d7c7c89689c1c35d45b272cc298f9357ab085953c9c751787321`.
- Attempt 2 made **2 model requests**: the chat's and the judge's. No decision. The row's "1 calls" is the judge alone, because the chat's request is not in an attempt's spend.
- Spend figures are made up by the stand-in server. The real difference will not be these numbers.
- Rows shown in the chat: lamp £22, pine £45, glass £60, armchair £65, industrial £95.

**The proof can fail, on final code.**

```text
FLUXIQ_ATTEMPT_SCRIPT_FORM=again-press pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --scripted-model --attempts 2
exit 1, run-mw3rfe9e-af5a3ce8

attempt 2: answer wrong because records, final_state, change, not_shown. It ran against what attempt 1 left, with no reseed; it found already done: The three cheapest dining tables saved. It changed the site: unsaved pine-round-table, unsaved glass-table, unsaved industrial-table. It took the run of the saved Flow, then explored on from where that stopped. It started from the first attempt's saved work, proven by the digest. Ended achieved, 2 rows stored, 2 shown, 19 live steps, 12 calls, 0% of input from cache, $0.4836, 63 s. NOT LIVE, stand-ins: model, spend.
```

`site.json`: all three `saved:` names at -1. Core said `achieved`, because the scripted judge says yes to anything in this form. The Lab said wrong, which is the point.

**What I saw in the attempt-2 pictures.**
- Right run: the saved items show 5 with the three tables "Saved just now". The answer turn shows "Used what I saved", "This time 38s and $0.01. First time 1m 9s and $1.38", "Saved today: the steps. They worked last time."
- Same picture, wrong: "Changed something that was already there" three times and "6 acts on the site", though nothing changed (defect 3).
- Same picture: a "Working · 39s, Step 11 of 11" strip still under the finished answer, half a second after the attempt ended. An earlier run on the same road showed "Finished", so this looks like timing. I did not trace it.
- Failing run: the saved items show 2. The chat lists "Saved: Dining table, industrial style, 160cm." and its like, in the words of the control that was pressed, though the press unsaved it, then "I got what you asked for". A person reading only the chat is told the opposite of what the site holds, which is why the Lab reads the site.

**Checks, all on final code.**

```text
node --test (13 dist files: attempt-lane, site-change, answer)     tests 99, pass 99, fail 0
npx vitest run --minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**" <14 files by path, later-attempt and carry-on among them>     14 files, 148 passed
npx vitest run ... --exclude "**/.tmp/**" answer-first/ contracts/task-attempts/ ui-components/chat/answer/     89 files, 750 passed
pnpm.cmd --filter fluxiq --filter @fluxiq/contracts --filter @fluxiq/ui-components check     exit 0
pnpm.cmd --filter @fluxiq-web-extension/test-runner --filter @fluxiq-web-extension/test-contracts check     exit 0
node scripts/structure-audit.mjs, Extension and Core     exit 0 both, advisory warnings only
paid form with --attempts 2 --dry-run, stand-in key, env files off     ready, providerCallCount 0, attempts 2, claude-sonnet-5-5
scripted form with no --attempts --dry-run     ready, attempts 1
```

My first vitest run by path also matched 24 stale copies under `.tmp/web-build/`: 336 files, 24 failed, the failures I read being that one test asking by the old key. That is why `--exclude` is there. I only read the last 40 lines of that run, so the clean rerun above is the result to trust.

No process of this task is left: the process list for `fxwork/t869` was empty after the last run.

## Defects outside my paths, not fixed

1. **A saved read does not survive leaving its Flow or its Core process.** `domain/src/runtime/llm-evidence/node-run/node-call.ts:37` keeps the read's list as `extraction.N`, and that handle lives only in memory, per Flow (`structure/handles.ts:177`), 16 at most across the whole runtime (`:43`).
   - Seen: under another Flow, the saved steps fail with `web.handle.unknown:extractList` and the attempt repairs without running them (`run-mw3nhfbd-dffb54bf`).
   - By reading, not driven: the same happens after a Core restart, or after 16 other detections. That means attempt 2 the next day would not run the Flow. It costs money, not the result.
   - `later-attempt.test.ts` "uses the steps saved under another" passes only because its fake domain has no such handles.
   - **I would fix this first.**
2. **The run gate holds back every repeated plain press.** The domain calls every click a commit (`domain/src/actions/action-effect/table.ts:20`). `run-acts/settling.ts:92` reads that as lasting, against that file's own header ("What it does not hold: a press that declared nothing"), and `act-record/record.ts:324` refuses the second.
   - Seen: the second Apply was skipped, and the Flow stopped at the next step.
   - By reading: Next page in a row-less loop would hit the same.
3. **A check that pressed nothing reads as an act that landed.** `apps/extension/src/content/actions/check.ts:88` answers success with no `skipped`, unlike `click.ts:588`, so `run-acts/node-answer.ts` calls it landed and the chat claims changes that did not happen.
4. **A remembered prompt stops a saved Flow.** The "Not now" press was not flagged as answering an interruption, though the cookies press was, so a second run fails there instead of skipping it (`run-mw3o6pgv-ffa1a04c`).

## Not verified

- Any paid run or any real model. Every number here comes from the stand-in server.
- What a real chat model does with a second identical message. It may answer in words, and then the watch waits 10 minutes and says "not judged".
- What a real model does in the rounds after a stopped run, and whether a by-hand Apply there is refused for good. The record holds Apply as landed.
- Attempt 2 after a first attempt whose budget ran out, in a browser. It is covered by Core's tests and the Lab's unit tests only.
- A repair path (`run_flow_then_repair`) in a browser.
- Core restart between attempts, a new thread, Firefox.
- The toggle form's Flow as a whole plain-press rerun: it stops on the way in `again-press`, so the run itself never presses Save again; only the rounds do.
- The full suites. Narrow checks only, as asked.

## Open questions

1. The rule above: does the same wording after an achieved attempt mean do it again?
2. Whether `run_flow`, with its unproven first run, should be allowed to run a Flow holding a plain lasting press on a site it cannot tell is a toggle.

## The paid command for attempt 2

Held until t870's double-act proof passes. I would also settle the rule above and defect 1 first, or the run mainly measures those.

```text
FLUXIQ_LAB_INSTANCE=t869-live FLUXIQ_TEST_ENV_FILES=none pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --live-llm --llm-model claude-sonnet-5-5 --llm-max-cost-usd 5 --attempts 2
```

**It can spend up to $10:** each attempt opens its own $5 purse (`attempt.json` shows `budgetUsd` 5 on both), plus the two chat requests, which sit outside the purse and outside the ledger's figure. There is no shared limit across the two. Attempt 1 is expected to cost what the last paid runs did. Attempt 2 costs a judge's call if the Flow runs whole, and more if it stops and reaches the rounds, which is the likely case. It does not start after a wrong first answer or an empty balance.

**Stop it on:** a balance error; any `unsaved` in attempt 2's activity; a wait for a person, as nobody is coming; a loop line repeating.
