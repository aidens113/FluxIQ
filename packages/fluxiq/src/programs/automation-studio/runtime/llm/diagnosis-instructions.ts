// What a model is told when the answer it must give is a diagnosis.
//
// These are prompts, not adapter mechanics, and they were in the DeepSeek
// adapter because that is where the system message is assembled. The adapter is
// at its own line budget, so a new task kind that needs a sentence of its own
// could not be added there without pushing an unrelated file past a limit --
// which is the wrong reason to make a design decision. They live here instead,
// and the adapter asks for the instruction its request's task kind calls for.

import { automationStudioLlmTaskExpectsDiagnosis, type AutomationStudioLlmTaskKind } from "./harness.ts";

const AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION = "Put your reading of the failure in the diagnosis object, not only in the summary: expected, observed and changed in at most 500 characters each, stillAchievable and deterministicRecoveryPossible as one of yes, no or unknown, and explorationNeeded and patchNeeded as booleans. Answer stillAchievable no, and patchNeeded false, where the step's intended result can no longer be had: what it acted on is gone with nothing that does the same thing, it is refused on purpose, or only a person can settle it. That answer ends the recovery without changing anything, and it is correct as often as a repair is. Omit a field you cannot answer rather than guessing it. The summary is prose nothing acts on; these fields are what the recovery is decided from.";

// Asked only of a result verification, because it is the only call whose whole
// job is that one field. A run that finished without a failed step says nothing
// about whether what it produced is what was wanted, and until this call existed
// nothing in FluxIQ ever asked: four live runs on 2026-09-17 returned none of
// eight records, none of five, ten of forty, and all two hundred and forty when
// two were asked for, and every one of them reported success.
//
// The empty-result sentences are load-bearing rather than decorative. Until
// 2026-09-24 a run that stored nothing was never put to this call at all, and
// the reason given was that an empty table is sometimes the right answer -- so
// the first thing this call must be able to do with one is say yes. It is told
// how to tell a Flow that searched and found nothing from one that never looked,
// and told that a run with no record set at all is judged on what it did.
//
// The closing sentences are the 2026-09-26 instruction that this call must issue
// fix instructions rather than a verdict, and they are written to be safe to
// ignore. The repair is handed `failure.expected` and `failure.actual` and
// nothing else (`recovery/context.ts`), so what is written in `observed` and
// `changed` is literally all the repair gets -- which is why the ask says so.
// And the last sentence is load-bearing in the other direction: a terse
// judgement still produces a valid refutation, asserted in `verdict.test.ts`, so
// a model that offers no advice costs the run nothing. Nothing new is demanded
// of the model: these are fields the diagnosis reply already carries.
//
// The `reads` sentence is `run-munq5s8x-6d620cdf`'s: a read that had followed
// five pages and filtered on four conditions was refuted, rightly, with advice
// to add a paging loop and a filter step it already had. The summary now says
// how each read went (`result-verification/read-account/`), and the sentence
// says what to do with that.
//
// The excluded-row sentence is live run `run-muqk713g`'s (C5): both judges read
// earbuds sold "with Wireless Charging Case" as the accessory the request left
// out ("charging cases"), so a condition that removed three asked pairs by
// itself looked right. It is said once, here, and reads for the build-test
// judge's `readRows` too, since one prompt carries both.
//
// The `endView` sentence is run `run-murwd8le-79e735a8`'s (Cause 7): every judge
// of that build and run decided without the page, though it showed `Cart (3)`
// and the coupon "Collected", and one invented a quantity never committed. It
// is said here, where both judges read it, and only a judge whose summary
// carries the view is shown one (`result-verification/result-summary.ts`).
//
// The `leftOutNamingTheItem` and named-rows sentences are t274-c25's (run
// `run-muw60j7c-bb7c9a62`, C-2 and C-5). Both build-test judges said yes over
// three pairs "with Wireless Charging Case" the name condition alone left out,
// beside the excluded-row sentence above; Core now flags such rows
// (`result-verification/request-rows/`) and a yes that does not name each is
// not taken (`result-verification/verdict/`). And the result judges said the
// Plus condition left out two rows that were in the result; the re-author
// followed that and discarded the right answer, so a no names its rows and Core
// checks them (`repair.checked`).
// The quoted-exclusion sentence is t515's (run `run-mv6v2hx5-f448e662`, fixes 1
// and 4): a request stated one exclusion, a judge read the words it searched by
// as a second one, and both judges then said yes over a row a condition left
// out, each naming it and giving a reason of its own. A yes now quotes the
// request's excluding words beside each such row, and Core checks the quote is
// the request's and not only its search (`result-verification/request-rows/`
// `unquoted-rows.ts`). Written abstractly, naming no site or kind of item.
// The settled, numbering and presence sentences are t574's (live run
// `run-mv7vor5f-ea4d08b4`): a yes over an exact answer was held because it did
// not quote the request beside 37 left-out rows, most of them rows a numeric
// bound left out with values that settle them, and the recheck turned it into a
// no; its judges matched rows to the wrong conditions across three numberings,
// and twice refuted a correct presence test as a broken read. Core now settles
// such rows itself (`result-verification/value-readings/settled-rows.ts`) and
// asks one quote of the bound, numbers every condition, and says both sides of
// a presence test. The example is of another kind of site, the same shape.
// t599 (A8 launch 8): a presence test's left-out rows are settled the same way
// where the read's witness found the value missing (or there, for is absent),
// and a left-out row a yes must name carries Core's short id
// (`result-verification/request-rows/row-id.ts`); both said in no site's words.
// The `flowShape[].changed` sentence is run `run-muw5zv4m-52d83027`'s: a
// playback built exactly what was asked, and both judges answered no from
// status rows and an end view that keeps a stale count by the site's design --
// one read a search as the item chosen, ignoring the next step that chose
// another, the other read one "+" press as a quantity of 1. Each step now says
// what this run saw it change where it stayed (`result-verification/`
// `step-changes.ts`), and the sentence says to read that before the end.
// The `startView` sentence is run `run-mux6pndp-16feb842`'s (line 45): a
// finished run starts on whatever the site already held, and both judges read
// the header's "2 · $28.96" -- a soap and an earlier 3-Pack -- as the two towel
// packs asked for. The summary now carries the page before the run
// (`result-verification/result-summary.ts`), and the end view's own "do not
// suppose a step left undone" holds only for what that page did not show.
// Its last sentence is run `run-mv5uu9g1-9d80deea`'s (t477): a trial searched,
// applied filters and read one page of 14 results, and one judge read the start
// view -- the unfiltered search page, with five pages -- as the read's page and
// answered no for pages 2 to 5 never read, while the other read the end view's
// "14 of 14" and answered yes.
// The listing-`where` sentence is t378's (lane D, `run-mv0fuual-f9e6f089`): asked
// to confirm only the requests with five mutual friends, the Flow confirmed all
// eight, and both judges advised a condition on the for-each and the press, which
// sent the model to a filter node a script cannot wire. The rows a repeat visits
// are the rows its listing kept, so the listing's `where` is the fix.
// The `keptEveryRow` sentence is t692's (A8 cost round 2
// `run-mvbr0w7e-6a01c05b`): a read with no condition stored every row of a
// list after an act over the rows a narrower read of it kept, and both judges
// said yes; Core's flag on such a read is named so a yes holds each of its
// rows to the request's words.
//
// The `narrowedBefore` sentence is t482's (lane C rounds 10 and 12,
// `run-mv5uu9g1-9d80deea`, `run-mv62icw3-9118516f`): a Flow pressed a site
// filter that kept less than the request's own bound before its read, and the
// rows it removed never reached the read, so no left-out row witnessed them.
// Every judge named the filter and said yes, because the rule above covered
// only a Flow that could not narrow. The sentence is its converse, written
// abstractly, and its example is of another kind of site with the same shape,
// so it mirrors no scenario the Lab measures.
// The `resultCount` sentence beside it is t660's (A8 frozen pair 6 candidate
// `run-mvac1av6-f7b0f9e2`): a correct playback was refuted by two nos that each
// blamed a site filter for keeping too little, where Core's own record of that
// step, shown to both, said the page stated 16 results before it and 16 after.
// The prompt asked the judge to read a step's words and never said what the
// count is. It says what Core measured, with no example of any site.
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION = "This call judges a finished run's result, not a failure. Read the instructions as the request, resultSummary as what came back, and resultSummary.flowShape as every step the Flow can perform. resultSummary.reads, where present, says how each list read went: the pages it read and the most it may read, why paging stopped, the items it saw and the rows it kept, whether it already pages and keeps one row per key, and each of its conditions as written with the rows that condition rejected; a read reads one page, and one that ran as the passes of a loop (keptPerPage, the rows it kept on each page) gives every pass added up: the pages read, and in stop how the loop ended -- ended, the step that moves the list on found no further page; bound, the loop ran its most passes; failed, a step of the loop failed; leftOutOnlyByThis names the rows that condition alone left out of the result (every other condition kept them), each by its label, or, where the value that condition tested on that row is known, written label — column: value: none of them came back, and if the request asks for any of them, that condition is wrong and is the one to change. Read each row's tested value against the request yourself rather than trusting what the condition was meant to do: a pattern or comparison can leave out a row the request wants, and the value is the only way to see it. resultSummary.reads[].narrowedBefore, where present, lists the steps that acted on the page before that read first ran, in run order -- a search, a filter, a category, a sort, an option chosen, a move to another page -- each by its nodeId, its label, control (the words of what it pressed or chose) and effect (new_page: it went to another page; same_page: it changed the page it stayed on; already_shown: the page already showed it). Its resultCount, where present, is the number of results the page itself stated just before that step (before) and just after it (after), as Core read them off the page: where both are given and after equals before, the step removed no row, whatever its words say, so no row the request asks for can be missing because of it; where after is smaller, the page stated that many fewer results once the step had acted, and the rows it no longer counts never reached the read. The rows such a step removed on the site never reached the read, so no condition's leftOutOnlyByThis and no count can show them. Read each one's own words, with its parameters in flowShape, against the request: a step whose words keep less than the request asks -- a range or bound narrower than the one the request states, or a category, option or value the request does not name that can leave out items the request asks for -- means rows the request asks for may be missing although none is listed, so answer no, say in observed which step and which of its words, and in changed name that step by its nodeId, to be removed or replaced by a condition on the read that keeps exactly what the request states. For example, a request for a library's books published since 2000, read after a step that chose \"2010 and later\", misses every book from 2000 to 2009 though no left-out row names one. A step whose words keep exactly what a clause of the request asks for, or that narrows nothing (a notice closed, a page opened), is correct. The converse holds too: a site's own filter or option whose words look like a clause of the request can keep rows that clause does not ask for, when the site counts a row in it for a reason of its own, so check each kept row against the request's own words, not the filter's label. resultSummary.reads[].keptEveryRow, where present, is Core's flag on a read with no condition that kept every item it saw, run after a step was repeated over the fewer rows its narrowerRead kept: nothing in that read chose which rows the answer holds, so answer yes only if the request's own words ask for each row it stored. Before answering yes, compare the included cohort and every relevant left-out witness against the original request independently of the authored filter or pattern, and state how each tested value meets or fails the request's requirement. Interpret quantities from their complete meaning, including explicitly identified members and additional components; a numeral may describe only one component or a remainder, not the total. A successful act on every kept row does not prove that all required rows were kept. If a required row was omitted, answer no; if a quantity or cohort cannot be established from the evidence, answer unknown instead of accepting the authored condition. A row the request excludes is one that is the excluded kind of thing, not one whose text only mentions it: an item sold with or including an excluded part is still the item. resultSummary.leftOutNamingTheItem, where present, lists rows a condition alone left out, tested on the row's own label, whose label names first the phrase of the request every kept row names first (item) and another phrase of the request only after it (also): by their own words they are the item asked for, sold with or including something else. Answer yes over such rows only if the request excludes each of them, and say so row by row: name each row, by enough of its label to tell it from the read's other rows or by an id it carries, and say why the request excludes it; a yes that does not name each of them is not taken as a yes. Hold every row a condition alone left out (each read's leftOutOnlyByThis, and processing.conditions) to the request's own words: answer yes over such a row only if the request states an exclusion that covers it, and name the row in a sentence that also quotes, in double quotes, the request's words that exclude it -- the words a request searches or navigates by say where to look and exclude nothing, so a quote of only those, or a reason the request never states, leaves the row one the request asks for, and a yes that leaves any such row without its quote is not taken as a yes. The rows in a condition's leftOutSettled are the one exception: Core read each one's tested value as a number that fails that condition's own bound, or found none there, and no bound holds on a row with no value, or, for a condition that asks only whether a value is there (is present, is absent), its read found the value missing where the condition keeps rows that have it, or there where it keeps rows without it, or, for a condition that tests text (contains, startsWith, endsWith, matches, or equals with text, possibly negated), its read found on the row a value that fails that condition as written, or, where the condition is not negated, found none, so none needs a quote beside it; as the condition's settled says, a yes quotes once, in a sentence that names that condition, the request's words stating the bound -- a request for a library's books of at most 300 pages, read by the condition pages atMost 300, is covered by one quote of \"at most 300 pages\" -- and where the request states no such bound, those rows are ones it asks for. Such a presence condition's rows are settled the same way: a yes quotes once, in a sentence that names that condition, the request's words asking for rows with that value, or without it, and where the request asks no such thing, those rows are ones it asks for. Such a text condition's rows are settled the same way: a yes quotes once, in a sentence that names that condition, the request's words asking for rows whose value says what the condition looks for, or for leaving such rows out, and where the request asks no such thing, those rows are ones it asks for. The rows in a condition's leftOutAlsoInResult are left-out rows whose label is also a row of the result: another copy of the same item was kept and came back, so none of them is a row the Flow dropped, none is missing from the result, and none needs a quote or a name in a yes. A left-out row a yes must still name may begin with Core's id for it in brackets, as in [row K4R7M2]: that id names the row as well as its label does. Each condition carries its number, and Core names it condition N (wording) wherever it names it; name a condition the same way. A condition's presence, where present, says that its read found a value on every row it kept and found none on each row it alone left out, each written with (no value): such a row lacks what the condition looks for, which is not a broken read. Each record set holds the run's answer: the rows its reads collected on every page, each row once, then the read's own dedupe, sort and limit; its processing, where present, says how many rows were collected, how many repeated an earlier row, were left out or cut, and what each pass added, and in processing.conditions, for each where condition of the saved answer, the rows that condition alone left out (leftOutOnlyByThis, each by its label): none of them was stored, so read each against the request as you read a read's left-out rows, and answer yes over them only if the request excludes each one, naming each row and saying why the request excludes it. Count distinct required subjects, not the sum of before-and-after reads or record sets containing the same subjects; use the original request to decide which subjects must appear and which remain untouched. Do not advise adding a loop over pages, filtering or deduplication the Flow already does; name the condition, the loop's most passes or the key that has to change. A Flow that acts on more rows of a listing than the request asks -- a press repeated over every row where only some qualify -- is fixed with a where condition on the listing step the repeat goes over, which decides the rows each pass visits, not with a condition on the repeat or the press: name that listing step in changed. resultSummary.endView, where present, is what the Flow acts on -- for a web Flow, the page -- as the run or test ended, after the step endView.after names, in the domain's own compact view: read what it shows, such as a count, the value a field holds, an option marked as chosen or a notice it gave, as evidence of what the steps did, and do not suppose a step left undone what the view shows done and startView did not already show. It shows the end only, not each step. resultSummary.startView, where present, is the same view of the page before the run did anything: what it already shows -- a count, an item in a cart, a collected coupon, a chosen store -- predates the run and is not its doing; credit an act only where startView and endView differ on it or the act's own step shows it. startView is never the page a list read ran on once an earlier step searched, filtered, sorted or went to another page: a read's pages, and whether a further page was found, are in that read's own account (reads, or its step's observed), so never judge a read's paging or count from what startView shows. resultSummary.startedWith, where present, lists what the build itself had already done on the site, and how the site differed from how the build found it, when this run began, because the build could not undo it: each is already done, neither this run's doing nor its failure; a step that found its item already done did nothing wrong, and the request is met when what it asks for holds at the end, these included. resultSummary.flowShape[].changed, where present, is what this run saw that step change on the page it stayed on, once for each time it ran and in order (added: the view lines that appeared; removed: those that left; a step that moved to another page carries none): read each act's own change before endView, which shows only the end. Answer diagnosis.answersRequest yes only when what came back is what the request asked for; answer no when it is not -- too few records, the wrong records, a count that cannot match the request, a Flow with no step that could have narrowed or filtered what the request asked to narrow, or a step before a read that keeps less than the request asks; answer unknown when the summary does not let you tell. An empty result is judged the same way and is not wrong by itself: answer yes when the request's own terms make nothing the right answer and the Flow's steps show it actually looked -- a request to list whatever matches, where the Flow searched, filtered and stored no row, is answered by an empty table. Answer no when the request expected rows and the steps show the Flow never looked, looked somewhere the request did not ask for, or had no step that could store what it found. A run that stored no record set at all is judged on what it did rather than on what it returned: answer yes when the request was to carry something out and flowShape and the steps that ran show it was carried out, no when they show it was not. Put what you compared in observed and what the request asked for in expected. Do not answer yes because no step failed: every finished run you are shown finished without a failed step, and that is exactly why you are being asked. When you answer no, say in observed which rows or columns are wrong -- name the concrete rows that are wrong or missing, by their labels as the summary gives them or by an id they carry, and the condition or step that kept or left out each, and call a row left out only if it is absent from the stored rows: Core checks each row you name against what the run holds, and advice resting on a row the result contradicts is not followed -- and in changed what to change to fix it: name the clause of the request the result does not satisfy, and the step whose parameters would have to change, by its nodeId in resultSummary.flowShape. A bare verdict is not the job -- the repair that follows is given what you write here and nothing else. If you have no suggestion, answer no without one rather than inventing one: a refusal with no advice is still a valid refusal and nothing fails for it.";

// The build-test sentences are t195-w25's. A build's Flow is now tested from its
// start before it is proposed, and the test is judged by this same call from
// `resultSummary.buildTest` (`result-verification/build-test/`). A test is not a
// finished run: it stored nothing, a step whose effect lasts was only checked
// rather than done again, and the build's own checklist and the model's claims
// travel beside it. The model has to be told how to read each of those -- above
// all that a claim is not proof, which is the whole of live run 40 (the napkins
// claimed on the towels' Search press), and that a step carried from an earlier
// Flow and not run is no evidence, which is run 41. It is said only to a call
// whose summary carries a `buildTest` (run `run-murwd8le-79e735a8`, Cause 9):
// said on every verification call, it led both post-run checks of that run to
// call the playback "a build test" and to judge it as one. A system message
// that differs between the two judges costs one cached prefix each, which is
// less than a judge reading a finished run as a test.
//
// t195-w28a added two. `buildTest.notes` is what the completion check's
// capability questions found -- no step producing the records asked for, none
// going to where the Flow starts -- which used to refuse the completion and is
// now the judge's to confirm. And an observation no longer repeats text another
// step's already sent: it writes `as step <n>`, which the judge must be told.
//
// t193 1002-M added `excused` (`run-murzln6g-11debe1d`, C6): the judge was
// shown a step the Flow passes over as plain `failed`, and asked to "fix or
// remove" it.
//
// t194 w55 added `readRows` (`result-verification/build-test/read-rows.ts`):
// run `run-muqk713g`'s build-test judge saw a replayed read as counts only and
// passed 10 of 13 earbuds, the other three left out by one condition alone.
//
// t195-w39 added what a repeated step acts on: run `run-murwcaj0`'s judge read a
// Confirm repeated over a listing as one remembered card pressed again.
//
// t252 added two more (D4, D6). A span that repeats now runs once per row in
// the test, so a repeated step carries `passes`, each naming its row by label
// (`result-verification/build-test/pass-lines.ts`): a judge reading a pass on
// another row as the step acting on the wrong item would refuse every correct
// loop. And `buildTest.inputs` says which values are the Flow's parameters at
// their test values rather than text typed in for good. Lane D's target words
// for a repeated step name no row (`build-test/summary.ts`), so the passes are
// what names each row.
//
// t174-w106 and t193 1003 w3, merged in t264, added two. A replayed press now
// carries what the replay saw it change (`result-verification/build-test/`
// `change-lines.ts`, `observation.ts`): run `run-musp8nz1-dbd3905a`'s two Space
// Grey presses, one un-choosing and one choosing again, were shown as two
// `replayed`, and run `run-musp4h2f-72e8ed99`'s judge answered no for want of
// the quantity its "+" set. And the test's reset is a navigation and a lasting
// step is only checked, so the page keeps what exploration did: run
// `run-musp8nz1-dbd3905a`'s judge cited the cart's "3 Cart", exploration's add,
// as the Flow's result.
//
// t273 S2 (D phase 2) added the named-route sentence. Core holds a build to the
// route the person named only through each step's own `place` claim
// (`../flow-draft/route-places/`), which is a claim, not proof the step went
// there; the judge is the one that sees from the steps and the person's words
// whether the Flow really starts at the route's first place and goes through
// every place on it.
//
// t275 lane D added the `afterWithheld` sentence (run `run-muw6144a-e56f945d`,
// C1). A test only checks a lasting act, so a read after it cannot show what
// the act makes: round 1's read of accepted requests kept only the row
// exploration had confirmed, and the judge refused the right Flow for the
// other three, asking that the checked step "actually run". Such a
// read now names the checked steps before it (`result-verification/build-test/`
// `summary.ts`), and the judge is told what that means.
//
// t274-c3 added `buildTest.stores` (`result-verification/build-test/stores.ts`;
// run `run-muw60j7c-bb7c9a62`, C-3): told the test "stored nothing", both judges
// read its result as empty and said yes while two reads appended 30 rows into
// one dataset, 20 of them an unfiltered page and 3 of them twice.
//
// The build-test `startView` sentence replaces "may predate the test" (runs
// `run-musp8nz1-dbd3905a`, `run-musq0b1m-0472cfa0`, `run-mux6pndp-16feb842`):
// told only that a count might predate the test, judges still read
// exploration's cart count and collected coupon as the Flow's result. The
// test now looks at the page just before it starts
// (`llm/node-tools/dry-run-gate.ts`), and the judge credits only what changed.
//
// The `explored.landed` sentence (t443, run `run-mv4dgmki-2b13db91`, R4b): a
// lasting act the build test withholds was pressed once by a repair rerun and
// then only checked, so its record read `changed: no` and the judge had no
// evidence the act works; the landing is now shown, counted only when it ran
// after the steps before it (`result-verification/build-test/landing.ts`).
const AUTOMATION_STUDIO_BUILD_TEST_VERIFICATION_INSTRUCTION = "When resultSummary.buildTest is present, what you judge is not a finished run but a build's test, run before its Flow is proposed: the Flow was run once from its start with no model attached and stored nothing itself, so its record sets are empty; buildTest.stores is the answer the Flow would give: each dataset it would write, the steps that write it, writeMode (append adds to what earlier steps stored, replace clears it first), passes, how many times those steps' reads filled it (once per page a loop read), collected, the rows they returned on every page, answer, what the run would store of them -- each row once, then the read's own dedupe, sort and limit -- with rows, its count, and labels, every row in the order it would be stored; removed, the collected rows the answer leaves out as repeats of an earlier row (duplicates), by a condition (filteredOut) or past a limit (cut), absent when the test could not make the answer; keptNone, when the reads collected rows and the answer keeps none; and repeated, the labels the answer would still store more than once. A row page 2 repeats from page 1 is counted in removed and is no row stored twice. Judge buildTest.stores' answer as the result, as you would a finished run's stored rows: answer no when it would store a row twice (repeated), a row the instructions leave out -- every row of a read that keeps everything it sees, stored beside a read that filters, is such a row -- or too few or no rows where the instructions ask for rows (a read with afterWithheld excepted, as below); and judge from buildTest.steps whether the Flow does everything the instructions ask. Each step gives its action, target (the step's own words: what it acted on, the item, the option chosen, the text typed), its outcome in this test, and observed (what the test saw: the rows a read returned, a check's answer, or, for a changing step run again, what it changed or what the page answered -- a replayed press's observed.changed is what the test saw it change). A replayed list read's observed may carry readRows: rows, the labels of the rows it returned (rowsNotShown more not listed), and readRows.leftOutOnlyByThis, per condition, the rows that condition alone left out, each written label — column: value where the test knows the value that condition tested on it, read as a read's leftOutOnlyByThis is above: none of them came back, and if the instructions ask for any of them, answer no and name that condition in changed. A withheld step changes something that lasts, so the test only checked it and did not do it again: verified means it could act now, present means its effect is already in place; judge it from explored (whether it changed anything when the build did it) and its target. explored.landed, where present, is that act as the build did it earlier: with counts true it ran once after the steps before it -- after names them with the choices they made -- as the step now stands, so it is done and shows the act works with those choices, and never ask for it to be run again; with counts false it did not run that way (why says how), and it shows nothing about the Flow. The test started from a page that kept what the build did while it explored, and going back to where the Flow starts undoes nothing that lasts. resultSummary.startView, where present, is that page just before the test did anything: what it already shows -- a count, an item in a cart, a collected coupon, a chosen store -- predates the test and is not its doing, so credit an act only where startView and endView differ on it or the act's own step shows it; what a withheld step's effect shows, in endView or elsewhere, is exploration's doing, not proof the Flow does it. A read with afterWithheld ran after the withheld steps it names, whose acts the test did not do, on a page without what those acts make -- a status they set, a row they add, a count they change -- so a row it lacks for that reason is missing because of the test, not the Flow: judge the read by whether its conditions would keep what those acts make on the rows their passes name (explored says what the act changed when the build did it), and never answer no, or ask for a withheld step to be run, because what they make is absent. A replayed step's observed.changed gives the lines about its own control first, then text that now reads otherwise, such as a quantity it set (changedNotShown more not listed): read it for a step that undoes what another step did. A step with excused did not hold in this test, and the Flow passes over it as written; excused says why (optional, an interruption that was not there, a check, a fallback, a repeat, or a step that needed what a checked step would have done), and the test passed with it. An excused step is not a defect: it is no reason to answer no on its own, and changed never asks to fix, rerun or remove it; judge whether the instructions are done from the other steps. A step's claims, buildTest.checklist and buildTest.missingActs are the build's own reading and are information, not proof: decide from what the steps' own words and observations show was done, and to which item. A carried step was copied from an earlier Flow; with outcome not_run it is no evidence that its act is done. runs says when a step runs: optional, only if another step succeeded, or repeated over another step's rows. A repeated step acts on each row that step keeps, finding its control again inside each row, never only on the row it was built on, so its target names no row: read it as acting on every kept row. A repeated step runs once for each row of the list it repeats over, and its passes give each pass: pass (its number), row (the label of the row that pass acted on), its own outcome and observed. Judge each pass against its own row, not the row the build explored: a pass acting on its own row, not the explored one, is what a repeat does. A step that did not pass on some rows has not done its act for those rows. buildTest.inputs, where present, are the Flow's parameters at the values this test ran on (name, test, and the steps using it): a value shown there is the parameter at its test value, not fixed text, and a later run may supply another. A value written as step N inside observed is the same text step N's observed gave in that place. buildTest.notes, where present, are what Core's own checks found the Flow's steps cannot do: produce or save the records the instructions ask for (with the columns they named), or go to where the Flow starts (starts). Confirm each against the steps; when one holds, answer no and say it in observed, and in changed the step to add. Answer no when a clause of the instructions is done by no step -- an item never searched for, chosen or acted on, a step acting on another item than the one asked for, a value or count never set, a list not read whole -- and say in observed which clause is not done, in expected what the instructions ask, and in changed which step to change or add, by its step number in buildTest.steps. When the person's instructions name a route to follow -- pages, menus or links to go through in order -- a Flow that starts deeper than the route's first place, or skips a place on it, does not do what was asked.";

// The verdict before the narration (t653). Live run `run-mva6mlo8-f519063c`:
// four of 21 judge replies wrote `summary` first, repeated one sentence in it
// until the provider's output ceiling cut them off, and so never reached the
// diagnosis object their verdict lives in. The verification's schema lists
// `diagnosis` before `summary` (`deepseek/output-schema.ts`), and this says so
// right after the fields are named: a reply cut off after its diagnosis closed
// still carries its verdict, which the reply envelope reads
// (`deepseek/verdict-before-cut.ts`). It asks for an order, not a length.
const AUTOMATION_STUDIO_RESULT_VERIFICATION_ORDER_INSTRUCTION = "Write the reply's members in the order the outputSchema lists them: kind first, then the whole diagnosis object with answersRequest and every field you answer, closed, and summary last. Your verdict is read from the diagnosis, and a reply cut off before its diagnosis closes gives none, so decide and write the verdict before you explain it in summary.";

/**
 * The instruction a diagnosis-shaped task is given: the fields, plus what this
 * particular call is for. A verification of a build's test (`buildTest`) is
 * also told how to read one; a finished run's is not.
 */
export function automationStudioDiagnosisPromptInstruction(taskKind: AutomationStudioLlmTaskKind, judged: { buildTest?: boolean } = {}): string {
  if (!automationStudioLlmTaskExpectsDiagnosis(taskKind) || taskKind !== "loop_verification") return AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION;
  const verification = `${AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION} ${AUTOMATION_STUDIO_RESULT_VERIFICATION_ORDER_INSTRUCTION} ${AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION}`;
  return judged.buildTest ? `${verification} ${AUTOMATION_STUDIO_BUILD_TEST_VERIFICATION_INSTRUCTION}` : verification;
}
