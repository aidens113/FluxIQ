# A records yes stands on the rows (t875, lane A)

## Outcome

Partial. The rule, the field, the re-ask and the wording are in place, and every check the brief
names passes: the vitest directories, `pnpm --filter fluxiq check`, the structure audit and the
Core library builds. Two things stop it merging as it stands:
- **It breaks answer-first tests I may not touch.** 119 tests in
  `service/answer-first/tests/**` fail (31 of 40 files). Their scripted judge answers a plain
  `judgeReply("yes")` over held rows. That yes is now refused and asked again, the scripts run out
  of replies, and the tests fail on `scriptRanOut` or on a status other than `achieved`.
  The rule causes this: with `yesOnRows` switched off, a failing file (`endings/tests/steps.test.ts`)
  passes 5/5. The fixtures need a yes that cites the held rows and gives `answerRecords`. That is
  exactly what the lead's rule asks for, and those files are in `service/answer-first/**`.
- **I edited two files outside the owned list.** The new diagnosis field needed small additions in
  `runtime/llm/harness/provider-result.ts` and `structured-response.ts`. Without them the harness
  rejects any reply that carries the field (`llm_output.unexpected_field` is an error).

## What the run showed

`run-mw4b7kav-cbff03e1`, step 0111-judge (Haiku). The yes cited three rows, and all three matched
the stored cells, so the existing citation check passed it. Its own `observed` said the list the
request names shows 5 while `totalRecordCount` was 3. A rule that only checks citations cannot
catch this; the check needs a count to compare. Step 0062-judge (unknown) read
the line "Page 1 of 5 …" from `witnesses.before`'s page view as five pages and asked for pages 2 to 5.

## Design

**Field.** `diagnosis.answerRecords`, optional, closed:
`{ asked: boolean, siteShows?: integer >= 0 }`. `asked` says whether the request asks for
records as its answer. `siteShows` says how many records the site shows that answer it (the
records the request names, counted as the site shows them, never the rows that happen to be
stored). The schema and the well-formed reader are in `runtime/llm/verification-checked/answer-records.ts`.
The verification output schema offers the field after `checked`. Only `loop_verification` gets it.
A malformed value is dropped with a warning (`llm_output.diagnosis_answer_records_dropped`), and the
verdict stands. The Anthropic schema stays native: `native-judge-schema.test.ts` passes, and
`models/providers/anthropic/schema.ts` needed no change.

**Rule** (`runtime/result-verification/cited-yes/records-yes.ts`,
`automationStudioResultRecordsYesRefuted`). It applies only where the verdict's caller sets
`yesOnRows: true` (`verdict/types.ts`), and only the Flow-less judge sets it. H is the number of
rows the answer holds: each answer record set's `recordCount`, never a working set's. A yes is
refused when any of these holds:
1. H > 0 and it cites no row in `checked`. This is the lead's rule.
2. H > 0 and `answerRecords` is absent. A records yes can only be told from another kind of yes by
   this field, so its absence is not read as "no list asked". It costs one re-ask, and only for a
   judge that forgot the field.
3. `asked` is true with no `siteShows`, so there is nothing to compare.
4. `asked` is true and `siteShows` differs from H. This is the leading reason, quoted below.

`asked: false` with H > 0 needs only a citation, for a request for an act or a value where rows
were read along the way. When a yes is refused, the verdict is `unsure` with code
`yesCitationRefuted`. Core's sentences come first in `yesCitations.refuted`, ahead of any citation
refutations. The verdict reason is "…the judgement does not stand on the rows the result holds…".

**Empty result.** An honest empty result is a yes with `{ asked: true, siteShows: 0 }` over 0
rows, and it passes. With 0 rows and no `answerRecords`, a yes is read as before, on what was
done. With 0 rows and `siteShows > 0`, it is refused.

**Re-ask.** This goes through the existing loop in `flow-less/judge.ts`. A refuted yes is asked
again with Core's sentences until the same refutation comes back, and then it is `unsure`. The
re-ask summary keeps the key `citationsNotMatched`, with a broader note, the existing
`validCitation`, and a new `onRows` rule. When the yes ends unsure, the reason the answering model
gets starts "The check said yes, but it does not stand on the rows the result holds, so it stands
unconfirmed." and then gives Core's sentences, which hold counts and Core's own words only. A cited
cell's words never go into this reason.

The leading sentence (rule 4), exactly:
"The judgement counts N records the site shows as the answer, but the result holds H rows. The answer is the list the request names, as the site shows it: read that list itself and hold exactly the records of it the request asks for."

## Words added to the judge's instructions

Added to the end of `AUTOMATION_STUDIO_FLOW_LESS_VERIFICATION_INSTRUCTION` (Flow-less only. The
other judges' texts are unchanged, and their digests in `llm/tests/flow-less-diagnosis.test.ts` still pass):

> A yes over rows stands on the rows themselves: cite in diagnosis.checked each stored row that answers the request, by its label, a stored column and that row's own value there, and say in diagnosis.answerRecords whether the request asks for records as its answer (asked) and, where it does, how many records the site shows that answer it (siteShows), counting the records the request names as the site shows them, never the rows that happen to be stored. Where the site shows more or other records as the answer than the rows held, the rows are not the answer: answer no. A request whose answer is that there are none is a yes with asked true and siteShows 0 over no rows. A number shown beside a page number may count results rather than pages: take a list to go on past what was read only where the page shows a way on to a further page, never from such a number alone.

The re-ask's `onRows` rule (`flow-less/judge.ts`, `RECORDS_RULE`):

> A yes on a result that holds rows cites in checked each stored row that answers the request, and says in answerRecords whether the request asks for records as its answer (asked) and, where it does, how many records the site shows that answer it (siteShows): the records the request names, counted as the site shows them, never the rows that happen to be stored. Where that count is not the rows held, the rows are not those records: answer no, naming what is missing in defects. A request whose answer is that there are none is asked true, siteShows 0, over no rows.

None of these words name a site, product, job or person. A test checks the added instruction
against the scenario word lists.

## Page-count finding

Neither Core text tells the judge to read such a line as a page count:
`diagnosis-instructions.ts` (Flow-less branch) and `flow-less/question.ts` say nothing about
pages. But two things invite it:
- **The judge's system message also carries the extension domain's "Lists." paragraph.** It
  begins "Every page of a list is a loop the Flow states: read the list, then Next page…" and
  comes from `!FluxIQWebExtension/domain/src/runtime/llm-evidence/system-instructions/instructions.ts`,
  which is outside this brief and in the extension repository. That paragraph is build guidance,
  and every task kind gets it, the judge included. It primes paging.
- **The Flow-less instruction gave no rule for paging words.** Its "unknown … saying in
  diagnosis.observed what would" let the judge name "pages 2 to 5" as what would settle it, and
  that sent the attempt hunting. The Flow run's instruction has a paging sentence; the Flow-less
  one had none.

The fix in Core is the last sentence above. In the run, the line came from the site's own text in
`witnesses.before`. Not done: the domain's "Lists." paragraph could be left out of `loop_verification`
system messages. That change is in the extension, and I made no edit there.

## Files

Owned:
- `packages/fluxiq/src/runtime/llm/verification-checked/answer-records.ts` (new), `index.ts`, `tests/answer-records.test.ts` (new)
- `packages/fluxiq/src/runtime/llm/provider-task/output-schema.ts`
- `packages/fluxiq/src/runtime/llm/diagnosis-instructions.ts`
- `packages/fluxiq/src/runtime/result-verification/cited-yes/records-yes.ts` (new), `index.ts`, `tests/records-yes.test.ts` (new)
- `packages/fluxiq/src/runtime/result-verification/verdict/types.ts`, `result-verdict.ts`, `index.ts` (header), `tests/cited-yes.test.ts`
- `packages/fluxiq/src/runtime/result-verification/flow-less/judge.ts`, `tests/judge.test.ts` (fixture yes now cites a row and says `asked: false`), `tests/records-yes.test.ts` (new: the brief's five shapes, plus an empty result with a count above 0, a malformed field, and a yes that keeps citing nothing)
- Schema key pins: `packages/fluxiq/src/runtime/llm/deepseek/tests/output-schema.test.ts` (plus a test of the new field's shape), `packages/fluxiq/src/runtime/llm/tests/diagnosis-channel.test.ts`
- Instruction words: `packages/fluxiq/src/runtime/llm/tests/flow-less-diagnosis.test.ts` (new describe: the sentences are present and no scenario words appear)

Outside the owned list (needed plumbing for the field):
- `packages/fluxiq/src/runtime/llm/harness/provider-result.ts`: `answerRecords` added to the allowed diagnosis keys, kept rebuilt or dropped in `readDiagnosisText`, and a warning when it is malformed.
- `packages/fluxiq/src/runtime/llm/harness/structured-response.ts`: the optional `answerRecords` added to `AutomationStudioLlmDiagnosisFields`.

## Commands run and observed results

(Each run with `--maxWorkers 2 --minWorkers 1`, from `packages/fluxiq`.)
- `npx vitest run src/runtime/result-verification/flow-less src/runtime/result-verification/cited-yes src/runtime/result-verification/verdict src/runtime/llm/verification-checked` -> 8 files, 94 tests passed (then +1 test in records-yes, passed in the next run).
- `npx vitest run src/runtime/result-verification/flow-less/tests/records-yes.test.ts src/runtime/llm/tests src/runtime/llm/deepseek src/runtime/llm/anthropic src/runtime/models/providers/anthropic` -> first run 4 failed / 784 passed. The failures were the schema key pins in `deepseek/tests/output-schema.test.ts` (2) and `llm/tests/diagnosis-channel.test.ts` (2). I updated those pins and added a schema test, then re-ran those two files: 50/50 passed.
- `npx vitest run src/framework/automation-service/service/answer-first/completion src/runtime/llm/harness` -> 55 files, 427 tests passed.
- `npx vitest run src/framework/automation-service/service/answer-first/tests src/framework/automation-service/service/answer-first/run-acts` (outside the list, run to measure impact) -> 31 of 40 files failed, 119 of 369 tests (assertions `attempt.scriptRanOut` expected false; `status` 'stopped_by_person' expected 'achieved').
- Cause check: I set `yesOnRows` to undefined in `flow-less/judge.ts`, ran `npx vitest run src/framework/automation-service/service/answer-first/tests/endings/tests/steps.test.ts` -> 5/5 passed, then set it back to `true` (confirmed by grep).
- I moved the instruction-word tests from `flow-less/tests/records-yes.test.ts` to `llm/tests/flow-less-diagnosis.test.ts`, then re-ran both -> 14/14 passed.
- `pnpm.cmd --filter fluxiq check` -> exit 0 (tsc --noEmit, rebuilt). The first run, before the test move, also passed.
- `node scripts/structure-audit.mjs` -> first run FAIL: one deep import in my new test (`../../../llm/diagnosis-instructions.ts`, not in the llm barrel). After the move -> `structure-audit: passed (531 warning(s), 1097 baselined)`, exit 0.
- `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` -> exit 0. fluxiq and ui-components rebuilt; contracts and client-gateway-websocket were reused from the stamp.

## Not verified

- No live run.
- Judges other than the Flow-less one (build test, finished run) are deliberately unchanged:
  `yesOnRows` is unset for them. The field is offered in their schema but nothing asks for it or
  reads it.
- Whether Haiku fills `answerRecords` reliably is unknown until a live run. If it leaves the field
  out, the cost is one re-ask (rule 2), and a judge that never fills it ends unsure.

## Open questions or contradictions found

1. **Harness edits outside the owned paths.** `provider-result.ts` refuses any diagnosis key it
   does not name, so a schema field alone would have made every judge reply carrying it unreadable.
   The additions only add lines; check them for conflicts with other lanes.
2. **Rule 2 goes beyond the lead's wording.** A yes over rows with no `answerRecords` is refused.
   Without that, the run's exact shape passes again whenever the judge leaves the count out
   (its citations matched).
3. **Answer-first fixtures need updating before merge** (119 failures, see Outcome). A one-place
   fix is not possible. The shared `judgeReply` (`framework/automation-service/tests/service-bootstrap/tests/fixtures.ts`)
   also serves Flow judges, and each yes has to cite its own test's rows. The likely shape is a
   helper in `service/answer-first/tests/endings/support.ts` that builds
   `{ checked: <each held row's first column>, answerRecords: { asked: true, siteShows: <rows held> } }`.
   The other choice is to keep `yesOnRows` off until the fixtures move.
4. The domain's "Lists." paragraph in the judge's system message (see the page-count finding) is
   an extension-repository change for the lead to weigh.


---

# Follow-up (supervisor's two items)

## Outcome

Done. Both items are built and tested. Every listed check passes: the vitest directories, the
typecheck, the structure audit and the Core library rebuild. `service/answer-first/**` is untouched
as instructed, and its fixtures still need the change described above. They now also need
`checked: []` and `answerRecords` on a yes over no rows.

## 1. A yes over no rows, and a yes that says it could not judge (lane C, `run-mw4bxkn9-004e2667`)

What I found in step 0025-judge: the result held 0 rows (`totalRecordCount: 0`). The yes still
cited 3 rows. The citations were not refuted, because Core holds no answer set and so cannot call
the set complete. The yes carried no `answerRecords`, and its summary said the table "is not shown
and cannot be judged".

What changed, in `cited-yes/records-yes.ts` (the Flow-less judge only, through `yesOnRows`). A yes
is now refused (`unsure`, through the existing re-ask) when:
- **It cites rows over no rows held:** "The yes cites N rows, but the result holds none." followed
  by FIND_THEM.
- **It leaves out `answerRecords`, now over rows or over none.** Over none the sentence is "The
  result holds no rows, and the yes does not say in answerRecords whether the request asks for
  records." followed by FIND_THEM.
- **Records are asked with no count over no rows.** FIND_THEM is added to the existing sentence.
- **Its own words say it could not judge** (`cited-yes/unjudged-words.ts`). Only `observed`,
  `changed` and the summary are read, never `expected`. The match is "cannot / could not / unable
  to / impossible to / no way to" followed by "(be) judged / verified / confirmed / determined /
  assessed / settled / told". "Cannot be seen", which an honest removal yes can say, is not
  matched. Core's sentence: "The yes says in its own words that what was asked could not be judged
  from what is here, and a yes stands only on what is here. Find where the site now shows what the
  request asks for and read it into the result; a judge that cannot tell answers unknown."

FIND_THEM is "Where the request asks for records, find where the site now shows them and read them
into the result; a yes over no rows says the site shows none (answerRecords asked true, siteShows 0)."

**Still passing:**
- an honest empty answer: `{checked: [], answerRecords: {asked: true, siteShows: 0}}`;
- an act-only yes over no rows: `{checked: [], answerRecords: {asked: false}}`.

**Words added:**
- In the Flow-less instruction, after the empty-answer sentence: ", citing none. Where what was
  asked cannot be judged from what is here, the answer is unknown, never yes."
- In the re-ask rule: ", citing none. A yes stands only on what is here: where what was asked
  cannot be judged from it, answer unknown."

**Tests:**
- `flow-less/tests/records-yes.test.ts`:
  - the lane C shape (no rows, 3 rows cited, "cannot be judged" in the summary) is refused, asked
    again, and ends unsure with the reason leading to where the records are shown;
  - a yes over no rows with no `answerRecords` is refused, then taken once it says the site shows
    none;
  - a yes on matching rows whose words say "cannot be determined" is refused, and the unknown it
    gives on the re-ask stands.
- `cited-yes/tests/records-yes.test.ts` and `cited-yes/tests/unjudged-words.test.ts` hold the unit
  cases.

## 2. The native grammar matched to what the reader needs (lane B, `run-mw4coxdn-e2b30c8c`)

**Cause:** step 0040-judge was a yes with only `answersRequest`, `defects`, the two flags and
`summary: ""`. The reader refused it with `llm_output.missing_summary`
(`harness/output-validation.ts`: a blank summary is an error), so the check was not judged. The
grammar can't ask for a non-empty string: `schema.ts` moves `minLength` into the description.

**One source:** `llm/verification-checked/reply-required.ts`.
- The reply needs `kind`, `diagnosis` and `summary`.
- Each diagnosis key carries when the reader needs it: `answersRequest` always, `defects` on a no,
  and on the Flow-less judge only `checked` (yes over rows) and `answerRecords` (yes).
- `automationStudioLlmVerificationDiagnosisRequired(flowLess)` gives the required list.
- `provider-task/output-schema.ts` builds both verification schemas from it. The Flow-less one is
  chosen by `metadata.source === AUTOMATION_STUDIO_LLM_FLOW_LESS_JUDGE_SOURCE` ("answerFirstJudge",
  now a shared constant that `flow-less/judge.ts` uses). It requires `["answersRequest", "defects",
  "checked", "answerRecords"]`. Every other judge's schema is unchanged: `["answersRequest", "defects"]`.

**Reader relaxed** (`harness/provider-result.ts`): a blank summary on a diagnosis is downgraded
from an error to the warning `llm_output.diagnosis_summary_blank` and read as no summary (the
Flow-less judge then passes no summary text). No other reader rule changed.

**Tests:**
- `flow-less/tests/reply-required.test.ts` measures the reader behaviourally through the real
  harness. It removes each key from a sound reply and records which removals change the judge's
  conclusion (its verdict or its number of calls). The members whose absence changes it equal the
  schema's `required` exactly. Over a sound yes and a sound no together, the diagnosis keys whose
  absence changes it equal the schema's diagnosis `required`. A blank summary still gives a yes in
  one call.
- `llm/anthropic/tests/native-judge-schema.test.ts` (A6's file) gains four cases:
  - the Flow-less grammar is native and closed, with `required` taken from the table;
  - other judges are unchanged;
  - `output_config` and `system` are byte-identical across two steps;
  - the exact step-40 reply is read with no errors, and as the new grammar now forces it, it passes
    the provider's schema check too.

**Not matched (the reader is still stricter than the grammar can express):**
- A **no** whose defect has a blank `row` or `requestWords`, or an `act_wrong` with no `step`, is
  still refused (`verification_defects_required`). `minLength` and a requirement that depends on
  the kind can't be expressed natively, and that refusal is pinned by
  `harness/tests/no-cap-on-model-output.test.ts` and `reask-route/tests/unsupported-no-route.test.ts`.
- `provider-task/system-prompt.ts`, which I don't own, still has the literal "answerFirstJudge"
  rather than the shared constant.
- Because the original Flow-less schema now requires `checked` and `answerRecords`, a JSON-text
  (non-native) Anthropic reply that leaves them out would be refused by the provider's schema
  check. Today the judge grammar is native, as the test asserts.

## Files (follow-up)

New: `llm/verification-checked/reply-required.ts`, `result-verification/cited-yes/unjudged-words.ts`, `result-verification/cited-yes/tests/unjudged-words.test.ts`, `result-verification/flow-less/tests/reply-required.test.ts`.
Changed: `llm/verification-checked/index.ts`, `llm/provider-task/output-schema.ts`, `llm/harness/provider-result.ts`, `llm/diagnosis-instructions.ts`, `llm/anthropic/tests/native-judge-schema.test.ts`, `result-verification/cited-yes/records-yes.ts`, `result-verification/cited-yes/index.ts`, `result-verification/cited-yes/tests/records-yes.test.ts`, `result-verification/verdict/result-verdict.ts` (passes the summary text), `result-verification/flow-less/judge.ts`, `result-verification/flow-less/tests/judge.test.ts` (the no-rows yes now cites none), `result-verification/flow-less/tests/records-yes.test.ts`.

## Commands run and observed results (follow-up)

- `npx vitest run src/runtime/result-verification/flow-less src/runtime/result-verification/cited-yes src/runtime/result-verification/verdict src/runtime/llm/verification-checked src/runtime/llm/anthropic/tests/native-judge-schema.test.ts --maxWorkers 2 --minWorkers 1` -> 117 passed, 1 failed. The failure was my blank-summary test: the provider's original-schema check refused the old reply because it lacks the newly required `checked` and `answerRecords`. That is expected, so I split the test (see above).
- `npx vitest run src/runtime/llm/tests src/runtime/llm/deepseek src/runtime/llm/anthropic src/runtime/models/providers/anthropic src/runtime/llm/harness --maxWorkers 2 --minWorkers 1` -> 106 files, 1202 tests passed.
- `npx vitest run src/runtime/result-verification/flow-less src/runtime/result-verification/cited-yes src/runtime/result-verification/verdict src/runtime/llm/verification-checked src/framework/automation-service/service/answer-first/completion --maxWorkers 2 --minWorkers 1` -> 12 files, 114 tests passed.
- `pnpm.cmd --filter fluxiq check` -> exit 0.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (531 warning(s), 1097 baselined)`, exit 0.
- `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` -> exit 0. fluxiq and ui-components rebuilt; contracts and client-gateway-websocket were reused.
- After the checks I converted four new files from LF to CRLF to match the checkout. That changed line endings only, not content.

## Not verified (follow-up)

- No live run. I have not seen whether Sonnet or Haiku fill the newly required fields well, though
  the native grammar forces them to be present.
- I did not re-run `service/answer-first/tests` (must not touch). They will still fail, as before,
  until the fixtures are updated.
- The "could not judge" match is a wording heuristic. A false positive costs one re-ask and then an
  unsure.
