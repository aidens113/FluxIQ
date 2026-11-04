# Every ending of the keep-going table, proven (t861, worker: endings)

## Outcome

Partial, and the path itself is done. Every row of the table has its own provider-free test through the real service and loop, and they pass. t859 is really wired in, a task that asks for an act several times reaches its result, and `output_not_observed` ends nothing.

**One thing stops the setup step reaching a person, and it is outside my paths.** The service returns `status: "setup_needed"` correctly, but the route turns it into a failure message, and the activity says "Your Flow is ready" after it. I found both by reading the code; no test drives them. Item 1 below gives the exact lines. They must go in before any chat run meets a pre-model refusal.

Nothing has seen a real model, a browser or the Lab.

## Needed from you, outside my paths

I did not touch any of these. The first three are needed for the setup step.

1. **`SVC/flow-bootstrap-requests/generate.ts`, before the `consistent` check (about line 147).** Today a `setup_needed` fails that check and answers `{ ok: false, error: "...inconsistent with the requested authoring mode." }`, which the chat reports as a failure. Add: `if (automationStudioAnswerFirstSetupOf(generated)) return { ok: true, payload: { setupNeeded: generated } };`
2. **`S/runtime/automation-activity/build.ts`, `answeredEnding` (line 22).** It only knows `status: "answered"`, so a setup step falls through to "Your Flow is ready". Add a case that returns `{ phase: "done", label: "Before I can start" }`, or no ending at all.
3. **`S/runtime/conversations/commands/build.ts` (`automationStudioConversationAnswerFirstAttempt`, about line 250) and `create-here.ts`.** Read `payload.setupNeeded` and say its `say`. Today the missing `answered` reads as "the task's answer could not be read".
4. **`SVC/flow-bootstrap-commands/contracts.ts`, optional.** Add `AutomationStudioAnswerFirstSetupNeeded` to the result union. I kept it out because widening that union broke other files' types for the driver. So the return travels under the old type by a cast, and `automationStudioAnswerFirstSetupOf` reads it back.
5. **`packages/contracts/src/task-attempts/loops-caught.ts`, optional.** Add a `same_act` slot. See decision 3.

## The table

Test files are in `SVC/answer-first/tests/endings/tests/`. All names are quoted from the tests. Every row goes through `expectEnded`, which asserts the end status, that nothing hung, that the script did not run out, and that no lasting act landed more times than asked. The reached rows also assert spend above zero. The budget-out rows and the mid-round Stop assert spend themselves, as noted in the last row group.

| Row | Test | What it now does |
| --- | --- | --- |
| Completion that says it cannot be done | `judge`: "a completion that says it cannot be done keeps going, and reaches the result" | Judged; the no goes back; the next read reaches the result |
| **Judge no** | `judge`: "a judge's no goes back with its reason, and the task reaches its result" | The model sees the judge's reason and carries on |
| Judge unsure | `judge`: "a judge's unsure keeps it looking for evidence, ..." | Refused with `answer_first.judged_unsure`, and it keeps looking |
| Judge not_judged | `judge`: "a judge that gave nothing is not judged: ..." | Not a no, and the same evidence may be asked again |
| Judge refused by the purse | `judge`: "a judge refused by the purse is a budget-out, with the best result and an honest label" | `budget_out`, label `unverified`, `timesChecked: 0`, rows kept. The completion bills past its estimate, so the check cannot be paid for |
| **A failing step** | `steps`: "a failing step is told to the model, and the task reaches its result" | The model sees the failure and reads another way |
| A tool that throws | `steps`: "a tool that throws is told to the model, ..." | The model is told a call failed, never the error's words |
| **Repeat-without-progress stall** | `stalls`: "a repeat-without-progress stall changes approach: ..." | `change_approach`, then a fresh round told what was tried, with no page text |
| Iteration limit | `stalls`: "the iteration limit is a fresh round from the page as it stands, ..." | Fresh round; the note says it "ran out of turns"; no reset |
| Unreadable replies | `stalls`: "unreadable replies are a fresh round, and reach the result" | `llm_evidence_loop.unreadable_replies`, then a fresh round |
| **Provider silent then back** | `stalls`: "a provider silent then back is waited out with backoff, said in chat, with no act repeated" | Waits 5, 10 and 20 s (injected sleep), says so three times, one press. That silence costs nothing is held by the silent-wait Stop test below, whose spend is exactly 0 |
| Uncertain lasting act | `steps`: "an uncertain lasting act is looked at, never repeated blind, ...", "... on a page that has not moved is not pressed again, ...", "a lasting act whose call threw is held to a look, ..." | A blind repeat never reaches the target. See "A retry after a look" under open questions |
| Permission allowed | `person`: "allowed continues in place, with no clock on the question" | No timeout; row reads `waiting_for_person`/`permission`; one press |
| Permission declined | `person`: "declined looks for another way, and reaches the result without that act" | The model sees `declined`, reaches the result, no acts, no press |
| Person-only check | `person`: "waits for the person with no clock, and continues when they clear it" | Row reads `person_only_check`; continues after Continue |
| Its Stop | `person`: "its Stop ends the task as a person's Stop, with what it had" | `stopped_by_person`, rows kept |
| Stuck ask | `person`: "asks the person after two fresh approaches, stops spending, keeps what it has, and resumes on the same record" | Row reads `stuck_in_a_loop`, no model call during the wait, `approaches` stays 2, result reached |
| Stuck ask's Stop, and nobody to ask | `person`: "the person's Stop at that question ends it, ...", "with nobody to ask it keeps going, and the purse is what ends it" | Stop wins; with no thread the purse ends it |
| Stop mid-round and during a wait | `person`: "mid-round is a normal return ...", "during a permission wait ...", "during a check's wait ...", "during a wait for a silent provider ..." | A normal return every time, and the silent wait wakes. The mid-round test asserts spend above zero and the silent wait exactly zero; the permission and check waits do not assert spend |
| **Budget gone by purse** | `budget`: "budget exhaustion by the purse ends budget_out with the best result and the draft" | Rows, the act and the draft all kept; spend within the ceiling |
| Empty balance | `budget`: "an empty balance ends budget_out at once, ..." | Ends on the first refusal; chat says "Reached this task's budget" |
| Pre-model resolved | `pre-model`: "a proposal waiting is resolved: ...", "a Flow that already has steps is resolved: ..." | The attempt runs. The same Flow in the old mode still refuses with its old code |
| Pre-model setup step | `pre-model`: "nothing asked yet ...", "no model to ask ...", "no site to reach ...", "limits the harness refuses ...", "a request a fresh round cannot make small enough ..." | `setup_needed`, no attempt row, and no decision asked of the model |
| Draft could not assemble | `budget`: "costs the draft and not the result: ..." | Result returned, no `candidateId`, says "The steps were not saved as a Flow", steps kept on the row |
| Rerun reset refusal | `rerun-reset`: "is refused and said, ..." | Real rerun: the model sees `rerun_place_unreachable` and `answer_first.no_reset`; no reset reaches the target |
| **All in one script** | `stalls`: "a task with a failing step, a judge's no, a stall and provider errors all in one still reaches its result" | Reaches the result with one press |

Rows in bold are the ones the lane's acceptance names.

### Item 2: an act asked for several times (`asked-count`)

"three asked lands three, and refuses the fourth", "a model claiming ten in its words lands one" (a reason, a summary, an `instructedAct`, `act: "a1"` and `act: "a10"`), "a count outside the request's own words lands one", "a row-bound act stays one per row, ...", "a request naming no count stays at one", "the count stands across a fresh round: ...".

**What it reads:** digits up to three places, the number words two to twelve, "twice" and "thrice", in three closed forms:

- a quantity Core's act reader already gives ("add two packs of the pencils to my basket");
- the same words with no place named ("add three of this");
- "N times" in a clause that tells someone to do something ("renew the card three times").

**What stays at one:** every other form, for example "a dozen", "a couple", "another two", "3x", or a count in another language. A missed count errs toward not repeating.

### Item 3: `output_not_observed` (`output-not-observed`, one test per form)

Forms tested: `record_output.records_refused`, `records_missing`, `intermediate_incomplete`, `output_confirmation.not_received`, the domain's refusal with no failure record, that refusal holding what the read came back with, `state_mismatch`, `option_not_offered`.

**One real defect, fixed.** `rows/found-rows.ts` only looked at `answer.failure`, so a refusal carrying `ok: false` and rows stored those rows as a result. Reverting the fix makes a fourth, half-made row appear in the result. `act-record/gate/read-answer.ts` had the same hole for noting rows, and I closed it too.

### Item 4: pre-model refusals

`S/runtime/answer-first/pre-model/table.ts` covers 61 codes: `pre_provider_validation` (38), `provider_resolution` (3), and the provider's own refusals before a request goes out (20). The last two groups go past the brief's wording, because they too refuse before any model call. A code added to the lists fails to compile, and a test walks the lists at run time.

Old modes are guarded by `authoringMode` on three existing lines of `service.ts`, whose line count is unchanged at 4304.

### Item 6: the saved-run shapes (`saved-shapes`)

The brief says three shapes and names two. I tested the third from the report as well.

| Shape | Test | What bounds it |
| --- | --- | --- |
| A new revision each time, judged no | "a new revision each time judged no: ..." and "the same refused evidence again and again spends no judge call, ..." | The digest rule: four changed summaries cost four judge calls, and the repeats cost none. The purse bounds the rest |
| Still moving, never arriving | "still moving, never arriving: ..." | **Only the purse.** No pattern fires, and the test asserts that. This is the plan's stated consequence, and D14 does not help here |
| A fight with the reset gate | "a fight with the reset gate has no gate to fight: ..." | There is no gate on this path: the rerun is refused, the guard stalls it, and a fresh round follows |

## Decisions

1. **The fake now reports state digests on every call,** as a real domain does. Without them the guard and detector judge nothing, and my stall tests passed without ever reaching the ladder. The driver's tests still pass with this.
2. **The model says which act; only the request says how many.** A press naming no act gets the count only where the request asks one count and no other lasting act. The disclosed limit: a model that names the wrong act can press that control as many times as that act asks, and no more. Core cannot tell which control an act's words mean.
3. **`same_act` counts under `exact_repeat`** in `loopsCaught` and on the tried record, as the nearest of the contract's five: it is the same call again. The mapping is needed on the row too, because the store reads strictly and one caught `same_act` would have made the whole attempts file unreadable. A test holds that.
4. **`loopsCaught` is read from each round's trace rows.** A round that returned or stalled keeps them. A round whose decision threw out of the loop keeps none, so its steers and refusals are not counted. Signals are not lost that way, because a signal always ends a round as a stall.
5. **A landing that may have happened holds the act to a look and does not use up the count.** A result's act reads `(3 times)` in its words, so the judge and the person see all of them on the one record.
6. **A refusal with nothing spent writes no attempt row.** My own test caught the alternative: two idle rounds left a `working` row behind a setup step, forever.
7. **A refused code that a fresh round could fix becomes a setup step after three rounds that spent nothing.** Once anything has been spent it stays a fresh round, since the only endings past that point are the three the hard rule names.

## Commands run and observed results

All on the finished code. From `packages/fluxiq`:

```text
pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first src/runtime/answer-first --minWorkers 1 --maxWorkers 2
 Test Files  35 passed (35)
      Tests  341 passed (341)

pnpm.cmd exec vitest run src/runtime/llm/repeat-guard/loop-detection --minWorkers 1 --maxWorkers 2
 Test Files  2 passed (2)
      Tests  51 passed (51)

pnpm.cmd exec vitest run src/runtime/flow-authoring/bootstrap/candidate/tests src/runtime/project-agents/supervisor/tests src/framework/automation-service/service/project-build/tests --minWorkers 1 --maxWorkers 2
 Test Files  95 passed (95)
      Tests  638 passed (638)
```

From the worktree root:

```text
pnpm.cmd --filter fluxiq check            exit 0, 0 "error TS" lines
node scripts/structure-audit.mjs          structure-audit: passed (493 warning(s), 1097 baselined).  exit 0
wc -l service.ts                          4304
git diff --numstat service.ts             3  3
```

The audit's warnings are advisory, up from 490. Those I looked at in this lane's files: `attempt/` at 18 source files, and `support.ts` (12) and `fake-library.ts` (11) past the exports threshold.

### Mutations: each change made, the named test seen failing, the file restored

| Change | Test that failed | Observed |
| --- | --- | --- |
| Loop given no `askedRepeats` | "three asked lands three, ..." | `expected { card: 2 } to deeply equal { card: 3 }` |
| Act record given no count | The same | `expected { card: 1 } to deeply equal { card: 3 }` |
| A refused read may store rows | "... holding what the read came back with: ..." | Four rows where three were expected |
| Round gives no `loopSignal` | "a repeat-without-progress stall ..." | `expected 0 to be greater than or equal to 1` |
| Pre-model refusal only a fresh round | "limits the harness refuses ..." | `expected undefined to be 'setup_needed'` |
| `same_act` left as it is on the row | "... still parses as the contract's" | `expected false to be true` |
| A reset reaches the target | "is refused and said, ..." | Evidence lacks `answer_first.no_reset` |
| Digest rule off | Both digest tests | `'achieved'` where `'budget_out'` was expected, and no `same_evidence` |
| A Stop does not wake the silent wait | "during a wait for a silent provider ..." | `Test timed out in 180000ms` |

**A mistake of mine in these runs.** My mutation script split multi-word `-t` values under `shell: true`, so the extra words became path filters. Several early runs covered far more than one file; one summary read `642 passed | 157 skipped (801)`. That is against the brief's "never a whole package suite". I stopped the last one, fixed the quoting, and re-ran the affected mutations (m3, m7, m9) on their own files; those are the results above. The digest-rule row comes from an over-broad run, which still shows its two named tests failing. No provider or paid call was involved. `git diff` and the final runs show every mutated file restored.

## Not verified

- **Any real model, browser or the Lab.** No provider or paid call was made. How a real model reads the fresh-round note and the `already_done` refusal is unmeasured.
- **The real web domain's answers.** The `output_not_observed` shapes are read from the extension's source (`action-failure/refusal.ts`, `tool-rejection.ts`) and restated in tests. No real refusal went through them.
- **The setup step past the service.** See "Needed from you". The route and activity behaviour are from reading the code, not from a run.
- **Most of the 61 codes through the service.** Only these were driven: `pending_adaptation_exists`, `blank_target_required`, `active_instructions_required`, `provider_resolver_unavailable`, `evidence_runtime_unavailable`, a request-total refusal, and a bad-timeout refusal whose exact code the test does not pin. The rest are checked only as table entries with readable words.
- **A pre-model refusal after something was spent.** It stays a fresh round by the code, and no test drives it.
- **A counted act on a real page:** the detector's place and fingerprint with real `ranWith` values.
- **Old modes "byte for byte".** The code is guarded by mode, the old-mode suites pass, and three old refusals are asserted by their code. I did not compare whole diagnostics.

## Open questions or contradictions found

- **Whose words is "the request"?** `asked-count` reads `instructionText`, the saved instruction. `create-here.ts` records `said.from`, so that text is not always the person's own. If the chat's interpreter (a model) writes a count into it, that count lifts the rule, which conflicts with "a model's reply never lifts it". I did not trace how often this happens. You may want the count read only where `said.from === "person"`.
- **A retry after a look.** With state digests, the repeat guard refuses an identical press on a page that has not moved, even after a look. So a retry happens only once the page moves, or in a fresh round with a new guard, where the act record admits it. It never goes blind, so the rule holds, but an act that truly did not land on a page that shows no change costs a stall first. The test covers the page-moved case; I did not drive the fresh-round retry.
- **A small `maxCallsPerRun` makes rounds that can do nothing.** At 3, a round is told "only a few decisions are left" and no tools are offered, so it can never act. The default of 64 does not meet this. The round only bought nothing because I set it that low in a test, but a host setting a tiny limit would spin until the purse or a Stop.
- **Asked by the brief to read "three" shapes, it names two.** I covered the third; see item 6.
