# t869 repair: the act's names, and the two refused replies

Runs read: Sonnet `run-mw3if5xt-a2bc72ae`, Haiku `run-mw3itjcy-ce4429f7` (lab-runs/2026-11-05). Core worktree `fxwork/t869/!FluxIQ`, extension worktree `fxwork/t869/!FluxIQWebExtension`. No paid call, no real key. Nothing committed.

## Outcome

Both items are fixed and proven provider-free. All four browser runs show each site line naming its listing, and the two paid replies are now accepted. One wording gap remains: a Flow step written on a control already reading "Saved" says "Saved:" rather than "Save:".

**I edited outside the owned list, in four places.** The brief asks for a reply account on `llm.provider_output_invalid` and for the model to be told the field. The closed case list and the feedback live outside what I owned, so I made small additions there:
- `S/runtime/models/failures/reply-account.ts`: one case and one optional bounded field.
- `S/runtime/models/failures/unreadable-reply.ts`: one line of words.
- `S/runtime/llm/unusable-decision.ts`: one clause in the note.
- `S/runtime/llm/deepseek/tests/off-shape-reply.test.ts`: a new test only, for "test the other providers".

Check these against any other worker's paths before committing.

## Item 1: "Save. Save. Save."

### Why the real path named nothing

Both paid runs pressed all three Saves by hand on the item's own page, with no forward pass.
- A real press there has no `actedOn` or `actedOnItem`, because the page has no list. The call carries no row.
- So both sources the first repair used were empty: `item-words.ts` read a sentence that isn't there, and `row-words.ts` read a row that isn't there.
- Restored records are not the cause. The result is built from the record made once in `run-attempt.ts:135` and never reloaded during these runs.

What a real press does hold of the item is `read.title`, the page it was pressed on: `Round pine dining table, 90cm | Kerbfind Marketplace`. `location` is where the press left the page, and `read.title` is where it stood (Haiku step 44 shows the two differ). In Haiku the press was also already tied to a row by its page, but the record keeps only hashes, so it could not say that row's words.

### Why the stand-in passed

**The scripted presses were not the wrong shape.** I compared call and answer keys across runs: every by-hand press, paid or scripted, has identical keys, with no `actedOn`.

**The script's route was what misled the repair.** Every form pressed only the first table by hand and did the other two by forward pass, whereas both paid runs did all three by hand.

| Run | Press 1 | Press 2 | Press 3 |
| --- | --- | --- | --- |
| Paid Haiku | by hand | by hand | by hand |
| Paid Sonnet | by hand | by hand | by hand |
| Scripted, all forms before this repair | by hand | forward | forward |

So `row-words.ts` lit up two of three lines, and the first line still read `Save.` in that very evidence. The oracle doesn't read those lines, so the run passed. Its unit test used the documented sentence with made-up words, a shape no real on-page press has.

I added two script forms, so the stand-in now takes the paid routes:
- `by-hand`, Haiku's route: read the list first, then press all three by hand.
- `by-hand-unread`, Sonnet's route: no read before the presses.

### The rule now

`act-record/item-names.ts` takes the first of these that says something:

1. The answer's own item sentence, or the row the call came with.
2. The row the act is tied to, by its own first text cell through `row-words.ts`. It is asked when the line is said, so a row tied late names the act too. A row that fits several with different words names none.
3. The title of the page it was pressed on, up to the site's name (`page-words.ts`).
4. Nothing added: the control's name, or the generic line for the act's class.

- **Consistency:** by hand and forward use one form, `<control>: <item>`.
- **Screening:** every item goes through the person-words check, so a credential's shape leaves the plain line. "Save: Save" is dropped.
- **Model's words:** none are a source.
- **Card:** the full stop is no longer doubled after "...".

### Must item words outlive a restart?

No, and persisting them in the act record is not safe. That record is carried across tasks and later attempts, and an existing test forbids page text in it, so I left that test alone. `record.test.ts` now says plainly that a reseeded record's line lacks the row's words.

The cost: a carried-on attempt's earlier acts read "Save" until a new read of the same rows names them again. The attempt's own result does store the named lines. Restoring them on carry-on would mean seeding from `carried.result.acts` in `run-attempt.ts`, which I don't own, so I left it. Tell me if you want it.

### Proof on real shapes

`tests/real-press-answers.ts` copies the real answers key for key, with the scenario's words replaced because Core's tests hold no scenario text. `tests/item-names.test.ts` sends them through the real gate.

All four browser runs: `pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --scripted-model`, each exit 0, answer right, ended achieved, NOT LIVE.

| Form (`FLUXIQ_ATTEMPT_SCRIPT_FORM`) | Evidence (`test-runs/attempts/`) | Result line | Site lines |
| --- | --- | --- | --- |
| plain | `run-mw3klnec-0f563af0` | 5 rows, 25 live steps, 22 calls, 61 s | Save: Round pine dining table, 90cm. / Save: Glass dining table with chrome legs. / Save: Dining table, industrial style, 160cm. |
| open-save-back | `run-mw3kudau-1fd0ba71` | 5 rows, 31 live steps, 25 calls, 74 s | Save: Round pine dining table, 90cm. / **Saved:** Glass dining table with chrome legs. / **Saved:** Dining table, industrial style, 160cm. |
| by-hand | `run-mw3kxgyp-2cf1d396` | 5 rows, 21 live steps, 22 calls, 56 s | Save: Round pine dining table, 90cm. / Save: Glass dining table with chrome legs. / Save: Dining table, industrial style, 160cm. |
| by-hand-unread | `run-mw3l0xen-a4d4619b` | 5 rows, 19 live steps, 20 calls, 52 s | Save: Round pine dining table, 90cm. / Save: Glass dining table with chrome legs. / Save: Dining table, industrial style, 160cm. |

I read the by-hand picture (`answer-turn.jpg`): the three lines show on the card, and five saved items are on the page.

**The remaining "Saved:".** In open-save-back the model wrote the Flow's step on the control while it read "Saved", so the step's own name is "Saved". The form matches and the listing is named, but the word differs. I did not normalise it, because Core would have to guess a control's resting name. The domain could carry the toggle's "before" word if you want that fixed.

## Item 3: the two refused replies

**The shared cause:** Core already had rules to keep these answers, but on Anthropic the schema match ran first (`provider.ts:73`) and refused them. DeepSeek's path never had that check.

### The constraint that failed at step 74

I ran the real matcher on the raw reply. Only `diagnosis.observed` failed, at **575 characters against `maxLength: 500`**. Every other field fit, `confidence: 0.8` included.

This was a length limit failing a good answer. It was a judge's clear yes, thrown away over 75 characters, which broke the standing rule against capping model output. The harness had read such text whole since t665, but the provider refused it before the harness saw it.

### The fix (`llm/anthropic/task-answer.ts`)

1. **The wrong outer word is repaired** (`reply/own-word.ts`), only when all three hold:
   - the schema fixes the word as a const;
   - the reply's word is the one its inner object carries under the same key;
   - that inner object fits its place in the schema.

   A word naming another answer stays refused. The repaired reply is billed once and judged as the real decision.
2. **A decision is read as every provider's is:** a missing wrapper is lifted, and a summary that is missing or past its length is written or cut.
3. **A length never refuses a judge's answer or a decision.** Every limit is below. Other tasks keep every bound here, since nothing else holds them.
4. **What still doesn't fit is refused with an account:** case `content_off_shape`, plus `misses` by path and rule, never a word of the reply. The `reply` field is no longer null. The model is told, for example, `At fault: response.kind must be exactly "evidence_tool_decision".` A key the reply wrote is named only if it has the shape of a name, and no guidance was added.

### Every limit on the two schemas

| Limit | Before, on Anthropic | Now |
| --- | --- | --- |
| Judge `expected`, `observed`, `changed` at 500 | refused the reply | read whole, with a warning |
| Judge `summary` at 20,000, blank texts | refused the reply | passed on to the harness |
| Decision `summary` at 240 | refused the reply | cut, as on DeepSeek |
| Decision `amendments` at 16 | refused the reply | passed on; `readAmendments` still refuses, under the loop's own code |
| Tool inputs (`query` at 200, `consequences` at 5, `ids` at 64) | refused the reply | passed on to the harness and the tool's own check, as on DeepSeek |
| Judge `defects` at 12 or text at 500 | refused the reply | passed on; **a current "no" with one is still refused, see below** |
| Judge `checked` at 12 or text at 500 | refused the reply | the extra cell is dropped with a warning, and a yes stands |
| `confidence` range, patterns, consts, enums | refused | still refused, now saying where |

**One waste remains.** A current judge's "no" with 13 or more defects, or a defect text past 500, is still refused at `harness/provider-result.ts:56`, under `llm_output.verification_defects_required`. The earlier test `diagnosis-channel.test.ts` deliberately pins the limits behind this, and that file isn't mine. It didn't happen in these runs, and it is no worse than before. It should change if never-cap is to hold there too.

### What each reply does now

- **Step 74** ($0.0020): accepted whole, so the judge's yes stands at step 74. The run saves that call, plus the "not judged" round and the second judge call at steps 76 and 77.
- **Step 67** ($0.0026): accepted as `amend_draft`, dropping steps 20, 21, 22, 24 and 25.

### The consequence you asked about: step 67's wrong plan

The reply was a wrong plan, and it was refused only by luck of its shape. Once repaired, it applies.
- **On the site:** nothing changes. The three saves stay landed on the act record and on the card.
- **The draft:** it loses the second and third table's open-and-save steps, and act a1's "done" mark on step 25 goes with them. So the saved Flow would be worse until the model put them back with `keep`.
- **The money and the answer:** unaffected.

That is correct behaviour: a draft edit is not lasting and is on the record.

The real risk is the plan itself, not the repair. Its summary said it would next press Save on the £30 and £55 tables, which are outside the radius. The same belief came back at step 69 even after the refusal, and the model completed without pressing. A press would be a real wrong act, and the refusal did nothing to stop it. The debug note's first watch item already covers this.

### Other providers and modes

- **DeepSeek:** no change. It holds no reply to the whole schema, so step 74 was already read, and it still refuses step 67's shape with no account. Pinned in `deepseek/tests/off-shape-reply.test.ts`. Live tests all use Claude.
- **Anthropic native-schema mode:** takes the same path. The grammar relaxes lengths into a description, so the same reading holds.
- **The judge:** a judge's reply that still doesn't fit carries the account in the step log, but the judge itself is not told, because nothing feeds a judge's own reply back to it. The deciding model hears "not judged" and completes again.

## Commands run and observed results

| Command | Observed |
| --- | --- |
| vitest by path: `act-record`, `result`, `llm/anthropic`, `llm/deepseek/tests/off-shape-reply.test.ts`, `models/providers/anthropic`, `row-identity.test.ts` (`--minWorkers 1 --maxWorkers 2`) | 29 files passed, 456 tests passed |
| vitest beside it: `unusable-decision.test.ts`, `provider-cache-prefix.test.ts`, `long-diagnosis-text.test.ts`, `failure-disposition.test.ts` | 4 files passed, 95 tests passed |
| ui-components vitest `src/chat/answer` | 5 files passed, 66 tests passed |
| `pnpm.cmd --filter fluxiq --filter @fluxiq/ui-components check` | Done, exit 0 |
| `pnpm.cmd --filter @fluxiq-web-extension/test-runner check` | exit 0 |
| `node --test` on the script's built test | 15 tests, 15 passed |
| Core `node scripts/structure-audit.mjs` | `structure-audit: passed (529 warning(s), 1097 baselined)` |
| Extension `node scripts/structure-audit.mjs` | `structure-audit: passed (243 warning(s), 552 baselined)` |
| Real matcher on steps 67 and 74 | step 74: only `diagnosis.observed` (575 characters); step 67: only `kind` |
| Key comparison of paid and scripted presses | by-hand presses identical in call and answer keys |

The browser runs are in the table above. I rebuilt all packages after the last Core edit, and the browser runs predate that rebuild; that edit doesn't touch the act path.

## Not verified

- No paid re-run, so the real models have not been seen producing these lines.
- Step 67's repair went through the provider, the harness's parse and the decision parser, not the whole evidence loop. The draft's "a drop that leaves a kept step no way to its page is put back" guard may have put some of those five back. I did not run that.
- A site whose title names the site first would read "Save: Sitename". It names less than it should but says nothing false.
- No full sweep, per the rule.

No orphaned process: a count of `node.exe` and `chrome.exe` with this worktree in their command line came to 0.

## Open questions

1. Should "Saved:" be normalised to "Save:" for a step written on a toggled control? That is a domain change.
2. Should carry-on restore the named lines from the stored result? That is one wiring change in `run-attempt.ts`.
3. Should `harness/provider-result.ts:56` stop refusing a current "no" over a defect's length or count?

## Return contract

```text
Outcome: Done
Changed: S/runtime/answer-first/act-record/{item-names,page-words}.ts (new), {record,words,contracts,index,item-words,row-words}.ts, gate/{act-gate,read-answer}.ts, tests/{item-names.test,real-press-answers}.ts (new), tests/record.test.ts; S/runtime/llm/anthropic/{task-answer}.ts (new), provider.ts, tests/off-shape-reply.test.ts (new); S/runtime/models/providers/anthropic/{schema-misses,reply/own-word}.ts (new), schema.ts, messages.ts, index.ts, reply/index.ts; outside owned: S/runtime/models/failures/{reply-account,unreadable-reply}.ts, S/runtime/llm/unusable-decision.ts, S/runtime/llm/deepseek/tests/off-shape-reply.test.ts (new); packages/ui-components/src/chat/answer/words/act-words.ts, tests/model.test.ts; docs/architecture/automation-studio/llm-flow-bootstrap.md; extension packages/test-runner/src/attempt-lane/scripted-model/scripts/local-classifieds-save-dining-tables.ts and its test
Validation: `vitest by path (act-record, result, llm/anthropic, deepseek off-shape, providers/anthropic, row-identity)` -> 29 files, 456 tests passed; `ui-components src/chat/answer` -> 66 passed; `fluxiq and ui-components check`, `test-runner check` -> exit 0; both structure audits passed; four browser runs exit 0, each line names its listing
Not verified: no paid re-run; step 67's repair not run through the whole loop, so the draft's drop guard is untested; a site naming itself first in its title
Report: C:/Users/osrs_/FluxStuff/fxwork/t869/!FluxIQ/docs/working/answer-first-plan/reports/attempt-road/repair-names-and-replies.md
Notes: Edited four paths outside the owned list because the reply account's closed case list and the model's feedback live there; check them before committing.
Open-save-back still reads "Saved:" on its forward lines, since the Flow's step was written on that word. A judge's "no" past a defect limit is still refused at the harness.
```
