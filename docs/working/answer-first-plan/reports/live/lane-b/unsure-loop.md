# Unsure loop: why attempt 2 re-completed until the ladder asked a person

Run run-mw4dsh8i-3fb9dc39, attempt 2, steps 0040-0097. Read-only investigation, Core tree `fxwork/t876/!FluxIQ`.

## Outcome

Done. The premise is half right. The model **did** go and get the missing evidence: it searched All posts (0049), opened the
new collection (0059), searched the collection's posts for the author (0065, which found two images whose alt text names the
author), opened the author's profile (0074), and re-read the Saved page (0087). **None of that ever reached the judge, and Core
then called the re-completion "same evidence".** Three Core defects combine:

1. **D1, looks are not evidence.** The judge's summary is rows + acts + endView + witnesses only (`completion/check.ts:148-159`,
   `flow-less/types.ts:9-22`). A `find_on_page` result or a page view seen mid-attempt is not in it, so the digest
   (`flow-less/summary-digest.ts:14`) does not change and the next completion is refused `same_evidence` (`check.ts:115-118`).
   The page view also leaves out image alt text, which is where the author was, so the endView never showed it.
2. **D2, the before witness is lost between attempts.** Attempt 1's judge (0036) said **yes**. It had `witnesses.before`, a
   picker showing which posts were ticked. Attempt 2 builds fresh witnesses (`attempt/run-attempt.ts:170`), and its acts are
   carried ("Already done earlier", `runtime/answer-first/act-record/carried-words.ts:8`). The before witness is read only
   ahead of a lasting act in this attempt (`attempt/call-chain.ts:81`, `attempt/flow-stage.ts:53`), so attempt 2 never has one.
   All five of attempt 2's judges had no witnesses, and every unsure asks for "before/after". **No fetch can supply a before
   reading after the act.**
3. **D3, the stated missing piece is dropped.** The judge put "what would settle it" in its `summary` (0052: "A check of the
   Saved page's collection order and of the contents and authors of Kiln Theory notes against the all-posts list would settle
   it"; 0077: "To settle it, open the Kiln Theory notes collection and compare..."). `verdict/advice.ts:4-7` uses `changed` and
   falls back to `summary` only when `changed` is empty, so the reason (`flow-less/judge.ts:166-169`) is
   observed + "Asked for:" expected + changed. Grep confirms "would settle it" / "To settle it" appear in no decide request.

## (1) What the model receives

After judged_unsure (0053, read at 0054), in `feedback[].value.instruction`: the judge's `observed` ("...Two acts are recorded
as landed, but only as generic presses with no names. The end view shows the All posts page with no authors, no collection
contents, and no Saved page collection order. No before/after witnesses are given."), then "Asked for: <expected>", then
`changed`, then NEW_EVIDENCE (`refused-words.ts:10`): "Only new evidence changes the check's answer: an act on the site that
lands, **a read that returns different rows** or the same rows in a different order, the site showing something different...".
After same_evidence (0056, 0068, 0081, 0095): "This completion was refused without being checked: what you hold is exactly what
the check last could not confirm..." + the same reason + NEW_EVIDENCE + "**If you cannot get anything new you need not keep
trying**: completing again with nothing new starts a fresh round, and the time after that the person is asked..."
(`refused-words.ts:29-30`). Fresh rounds (0072, 0085) get `freshRound` (`refused-words.ts:39-40`) and `lastCheck.reason`.

- The missing pieces appear only as absences ("no authors, no collection contents"). The judge's "what would settle it" is
  not carried (D3).
- It never says which page or read would count. Worse, it defines new evidence as different rows, an act, or a changed
  site, so a confirming look counts as nothing. The "tried" block then lists `web.find_on_page outcome changed_nothing x2`
  under "These were already tried in this task and did not get there" (0072, 0082, 0085).
- "You need not keep trying" invites the wait the person's rule forbids.

## (2) What the model decided

| Step | Decision and summary |
|---|---|
| 0047, 0049 | Open All posts; find "Kiln Theory": "to check that exactly the account's saved posts went into the new collection" |
| 0051 | complete -> 0052 unsure |
| 0054 | complete, nothing new: "matching the 2 Kiln Theory posts in All posts" -> same_evidence |
| 0057, 0059 | "Open the Kiln Theory notes collection to check it holds exactly the two saved Kiln Theory posts" -> 0061 complete -> 0062 unsure |
| 0064 | find "Kiln Theory" on the collection page: "Check that both posts ... are by Kiln Theory" (found both, by alt text) |
| 0066, 0069 | complete ("matching the only 2 in All posts") -> same_evidence, then change_approach (0070) |
| 0072, 0074 | open a post; open the author's profile "to list its posts" -> 0076 complete -> 0077 unsure |
| 0079, 0082 | complete, nothing new -> steer, change_approach (0083) |
| 0085, 0087 | back to Saved; re-run the read (same rows) -> 0090 complete -> 0091 placeholder |
| 0093, 0096 | complete -> same_evidence -> ask_person (0097) |

The model believed it held the evidence, because it had seen it. From its side, re-completing was rational. Twice (0054, 0079)
it completed with nothing new, which the same_evidence refusal correctly caught.

## (3) Where it is built

- Refusal texts: `framework/automation-service/service/answer-first/completion/refused-words.ts:10,22,29-30,39-40`.
- Check, digest compare, and summary: `.../answer-first/completion/check.ts:103-159`.
- Ladder: `.../answer-first/loop-signal/completion-refused-again.ts:29-65` (steer, change_approach, ask_person). It does what
  it says. The loop is not the defect: it climbs on a digest that cannot see looks.
- Witnesses: `.../answer-first/witnesses/witnesses.ts`, created per attempt at `attempt/run-attempt.ts:170`.
- Reason words: `runtime/result-verification/verdict/advice.ts:4-7`, `flow-less/judge.ts:166-169`. Summary type and judge view:
  `flow-less/types.ts:9-22`, `flow-less/judged-summary.ts:36-60`, `flow-less/question.ts:15`. **This is lane A's
  (result-verification/flow-less/**, verdict/).** D3, and the `looked` field of D1, belong there.

## (4) Least general fix (generic, no scenario words)

- **F1 (D1, lane B plus a lane A field):** add `looked?: { where: string; found: string }[]` to `AutomationStudioFlowLessSummary`
  (`flow-less/types.ts:21`). Fill it from Core's own call results, not the model's words: in `attempt/call-chain.ts:47-52`
  (`stored`), record each answered look (`web.find_on_page`, inspect) that comes after the first lasting act or the last check,
  bounded (about the last 6), screened as endView is (`judged-summary.ts:36`). Pass it through `check.ts:148-159`
  (`input.looked()`). The digest then changes after a real look. In `question.ts:15` add one line: "looked is what was found
  on pages looked at during the attempt, from the site itself." Rewrite NEW_EVIDENCE (`refused-words.ts:10`) to say "a look at
  the page that shows what the check said it could not see (open it, then read or search it there)". Drop "you need not keep
  trying" (`:30`). The ask still comes from the ladder, so no ending is added.
- **F2 (D2, lane B):** persist attempt 1's `witnesses.before` with the carried act record and seed `automationStudioAnswerFirstWitnesses`
  with it when `opening.seed` carries acts (`run-attempt.ts:170`, `attempt/opening.ts:65-70`). Until that lands, tell the judge
  that a before reading is absent because the acts were made by an earlier attempt (`question.ts`), so it does not ask for
  something no fetch can supply.
- **F3 (D3, lane A):** in `flow-less/judge.ts:147`, for an unsure, append the screened `response.summary` as "What would settle
  it: ...". Alternatively, make the system prompt's "saying in diagnosis.observed what would" a required field such as
  `diagnosis.wouldSettle`, which `readingWords` (`:166`) carries.
- **Tests:** `answer-first/completion/tests/looked-evidence.test.ts`: a judge stub says unsure, a complete with an unchanged
  `looked` returns `same_evidence` with no judge call, then a new `looked` entry produces a judge call whose summary carries it.
  `flow-less/tests/judge.test.ts`: an unsure reply with both `changed` and `summary` has a reason containing the summary's
  sentence. A witness-seed test beside `witnesses/tests`: seeded `before` is returned by `readings()` with no read.

## Were the generic act lines what the judge lacked?

Partly, but they were not decisive. Attempt 1's judge (0036) got the **same** two generic lines ("Pressed a control that changed
the page", "Done") and said yes, because its before witness showed the ticked picker. Attempt 2's judges name the vague acts
as one gap among four. The others (contents and authors, Saved order, before/after) are D1 and D2. Better act names alone would
not have settled it.

## Commands run and observed results

File reads and greps only (ls, cat, grep over the step folders and the Core source). No tests run, per the brief.

## Not verified

- The fixes are unbuilt and untested.
- Whether `web.find_on_page` passes the `stored` executor in `call-chain.ts` (it is a domain tool, so it probably does).
- Why attempt 2 ran after attempt 1's yes ("saved steps did not assemble", 0039).
- 0045 and 0091 are placeholders, ignored per the brief.

## Open questions

- F1 enlarges the judge's input. The bound and the screening of page text need lane A's agreement.
- Should D2 seed the before witness, or accept attempt 1's yes as carried?
