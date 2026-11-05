# A lasting act per row on a toggle site (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`. Task `local-classifieds-save-dining-tables`, Kerbfind, scripted model, no provider, no spend, visible Chrome.

## Outcome

**Done.** Each of the three tables was saved once, on a site where a second Save press unsaves the row. Both forms came out right in a visible browser from the real chat. With the row-identity rule taken out, the reshaping form did press the first table twice, unsaved it, and the run exited 1 with a wrong answer. No Core change is left: the temporary edit was restored byte for byte. The task was not reworded.

## Final proofs (rule restored, everything rebuilt)

Command for both: `pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --scripted-model`, the reshaping one with `FLUXIQ_ATTEMPT_SCRIPT_FORM=reshape`. Evidence under `fxwork/t869/!FluxIQWebExtension/test-runs/attempts/`.

| Run | Form | Exit | Result line | Evidence |
| --- | --- | --- | --- | --- |
| Plain | plain | 0 | `answer right. Ended achieved, 5 rows stored, 5 shown, 24 live steps, 22 calls, $1.0667, 63 s. NOT LIVE, stand-ins: model, spend.` | `run-mw2w9zcx-62b4daeb` |
| Reshape | reshape | 0 | `answer right. Ended achieved, 5 rows stored, 5 shown, 26 live steps, 23 calls, $1.1338, 78 s. NOT LIVE, stand-ins: model, spend.` | `run-mw2wd9iu-608f2cdf` |

Both score `repeatedActs: []`, `missingActs: []`, `unaskedChanges: []`, flow unproven.

## Proof the first table was not pressed again

- **The hand press.** One step, `save-first` (step 26 in the log of both runs), is Save on the pine table's own page, with `modify_existing` declared. The page said "Saved now pressed".
- **No forward pass for it.** The forward run's step log has `forward.12.pass.2` and `.3` (plain) and `forward.13.pass.2` and `.3` (reshape), each an open of a table's address followed by its Save. The opens are the glass table (`.../item/1054419573499480/`) and the industrial table (`.../item/1055628457179429/`). There is no pass 1 and no pass 4. The pass 2 and 3 Saves report "Saved now pressed", so they landed and did not undo anything.
- **The answer says skipped.** The forward run's answer to the model reads `Rows: 2 done, 2 skipped as already done, 0 failed.` in both runs. The two skips are the pine table (done by hand) and the second copy of the industrial table, which the feed sends twice. The count alone does not say which two; the passes above do.
- **The site's own record**, `site.json`, identical in both runs:

```text
before  saved:1057533328723847, saved:1030986358004719           (the armchair and lamp, already saved)
change  saved:1003207682554201 +1, saved:1054419573499480 +1, saved:1055628457179429 +1
activity  consent all, notifications dismissed, saved pine-round-table, saved glass-table, saved industrial-table
```

  No "unsaved" in the activity, three listings changed by one, nothing else touched.
- **The answer turn** (`answer-turn.json`, same rows in both): lamp £22 Available, pine £45 Available, glass £60 Available, armchair £65 Sold, industrial £95 Available, cheapest first, with "On the site" showing three Saves and "5 rows, 3 acts on the site". I read the reshaping run's picture, `answer-turn.jpg`. The panel is scrolled to the turn's tail: CSV and JSON, the three Saves, "Checked once against what was asked for: 5 rows, 3 acts on the site", "Took 1m 18s · $1.13", "Saved today: the steps. They only partly work, so next time I will fix what changed.", and the closing line. The site behind it shows Saved 5 and the five rows.
- **The forward run pressed the other two, not the script.** The script's only Save is `save-first`. The steps `forward.*.pass.N` carry `core.replay.replayed` and are made by Core's replay, not by a script decision. The script makes no decision between `core.run_flow` and the read-back.

**The reshape really differs.** From the reshaping run's step log: the read the model explored with (`read-tables`, step 22) has columns `title, price, url`. The Flow's read (`forward.12`) has `listing, link`: renamed, and the price dropped. The rows the passes carried were `{"listing": ...}` rows.

## The proof can fail

| Run | What it is | Exit | Result | Evidence |
| --- | --- | --- | --- | --- |
| Rule out | Reshape form, `automationStudioAttemptActSameRows` made to return `[]`, Core rebuilt | **1** | `answer wrong because records, final_state, change, not_shown. Ended achieved, 4 rows stored, 4 shown` | `run-mw2vyrxd-f31dc2a3` |

With the rule out, `forward.14.pass.1` was the **pine table** again: Save reported "no longer pressed" and "Removed from saved items". `site.json` activity: `saved pine-round-table, unsaved pine-round-table, saved glass-table, saved industrial-table`; change has only the glass and industrial tables. `missingActs: ["The three cheapest dining tables saved"]`.

- **`repeatedActs` is empty here**, not full. The toggle undid the first press, so the oracle sees a missing act, not a repeated one. The proof is the exit code, the wrong answer, the site's `unsaved` line and the pass 1 in the log.
- **The sentence tie did not save it.** The hand press's wording did not stop pass 1, so I did not need to take `row-ties.ts` out, and did not edit it.
- **Restored.** I copied both files first, edited only `same-row.ts`, and after the run copied the original back. `cmp same-row.ts same-row.ts.orig` and `cmp row-ties.ts row-ties.ts.orig` both printed nothing and exited 0; md5 before and after: `7b4439f66bdbed3178aeb5340725dfc7` and `8c19b8e4c2b28a47a6904fb175b3b334`. Core was rebuilt, then the Extension's domain, test-contracts and test-runner, and the two final proofs ran after.

## Findings on the way (outside my paths, not fixed)

1. **A repeated click on a row whose control is the row's whole link is not re-aimed.** First design: the Flow clicked the row's link, then pressed Save, repeated over the read. Every pass clicked the same absolute selector, `main > section > div:nth-of-type(1) > div:nth-of-type(4) > a` (the pine card), so the passes pressed pine's Save again and again and never reached glass or industrial. No "another row's control" refusal came, unlike the Accept case. Site state after that run: pine saved, nothing else. Evidence: `run-mw2udxzh-d8d29f9e` (call.json of `forward.12.pass.2` and later) and `run-mw2txff1-2546a76f` (four passes, pine's Save alternating "Saved" and "Removed"). This is a real double press landing on this site, from a cause other than row identity. I did not trace the line; the pass's re-aiming is in the span replay (`runtime/llm/node-tools/replay/span.ts`) and the client's other-record refusal (`candidate-trial/target-on-page.ts`). My script works around it by opening each table through `browser-navigate` with its address bound to `$row.url`, which is also what the guidance teaches.
2. **The repeat guard blocks the site's swallowed first Apply.** The radius picker swallows its first Apply after a choice. The same Apply again is refused as `llm_evidence_loop.repeat_refused (the same call before: changed_nothing)`, three times, and a change-approach followed. The script's second Apply carries `timeoutMs: 12000`, a different input. Run `run-mw2t6310-0a68fbc8`. A model that does not vary the call would lose its radius.
3. **After a forward run Core gives no newer page view.** `core.current_view` still held the list from before the run, while the browser was on the last table's page. A handle read from it failed `target_not_found` (`run-mw2udxzh-d8d29f9e`, `open-saved-17`). The script goes to the saved items by address instead.
4. **A hand step without `add` is "taken" in one form and "kept" in the other.** The unadded navigate back to the list was `taken` in the plain draft and `kept` in the reshaping one (same call, same position). Not traced. The script finds its steps by what they do, so it holds either way.
5. **The card says "Save (On the site)." three times**, a generic line by act class. It does not name the table. Minor, in `call-chain.ts` as the earlier report says.

## What I changed

All in the Extension, `packages/test-runner/src/attempt-lane/scripted-model/scripts/`:

- `local-classifieds-save-dining-tables.ts` (new), forms `plain` and `reshape`, listed in `index.ts`.
- `tests/local-classifieds-save-dining-tables.test.ts` (new), nine tests.

Core: nothing left (the temporary `same-row.ts` edit was restored byte for byte). No oracle, fixture, guidance or task wording was touched.

## Checks

```text
pnpm.cmd --filter @fluxiq-web-extension/test-runner check                 exit 0
node --test dist/.../local-classifieds-save-dining-tables.test.js         # tests 9, pass 9, fail 0
  (with the professional-network script's test beside it)                 # tests 15, pass 15, fail 0
node scripts/structure-audit.mjs                                          structure-audit: passed (240 warning(s), 552 baselined)
Win32_Process filtered on t869 (node, chrome, msedge) after the last run  0 left over
```

## Not proven

- **Any real model.** A script made every choice; it proves the road and the record.
- **That passes pressed the right row on page state alone.** The three `saved:` entries in `site.json`, the log's passes and the page's "Saved now pressed" agree, but no run shows the Flow's replay on a stored Flow from the start.
- **Which two rows were the two skipped**, from the count. Only the passes name the rows that ran.
- **The click-the-row's-link design.** It fails as finding 1 shows, so the proof is for the navigate-by-address design only.
- **Row identity with the sentence tie out.** The tie did not need removing, so what `row-ties.ts` alone would do was not measured.
- **A rebuilt Core and the Lab's cache.** The rebuild was run as the brief says, with no `FLUXIQ_CORE_WEB_BUILD_CACHE`.
- **Sixteen scouting runs** before the proofs, all stopped by my script's own gaps or the findings above, none a judged result. Two reached the forward run and are named in finding 1.
