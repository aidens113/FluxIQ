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
// The `flowShape[].changed` sentence is run `run-muw5zv4m-52d83027`'s: a
// playback built exactly what was asked, and both judges answered no from
// status rows and an end view that keeps a stale count by the site's design --
// one read a search as the item chosen, ignoring the next step that chose
// another, the other read one "+" press as a quantity of 1. Each step now says
// what this run saw it change where it stayed (`result-verification/`
// `step-changes.ts`), and the sentence says to read that before the end.
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION = "This call judges a finished run's result, not a failure. Read the instructions as the request, resultSummary as what came back, and resultSummary.flowShape as every step the Flow can perform. resultSummary.reads, where present, says how each list read went: the pages it read and the most it may read, why paging stopped, the items it saw and the rows it kept, whether it already pages and keeps one row per key, and each of its conditions as written with the rows that condition rejected; leftOutOnlyByThis names the rows that condition alone left out of the result (every other condition kept them), each by its label, or, where the value that condition tested on that row is known, written label — column: value: none of them came back, and if the request asks for any of them, that condition is wrong and is the one to change. Read each row's tested value against the request yourself rather than trusting what the condition was meant to do: a pattern or comparison can leave out a row the request wants, and the value is the only way to see it. A row the request excludes is one that is the excluded kind of thing, not one whose text only mentions it: an item sold with or including an excluded part is still the item. Do not advise adding paging, filtering or deduplication a read already does; name the condition, page limit or key that has to change. resultSummary.endView, where present, is what the Flow acts on -- for a web Flow, the page -- as the run or test ended, after the step endView.after names, in the domain's own compact view: read what it shows, such as a count, the value a field holds, an option marked as chosen or a notice it gave, as evidence of what the steps did, and do not suppose a step left undone what the view shows done. It shows the end only, not each step. resultSummary.flowShape[].changed, where present, is what this run saw that step change on the page it stayed on, once for each time it ran and in order (added: the view lines that appeared; removed: those that left; a step that moved to another page carries none): read each act's own change before endView, which shows only the end. Answer diagnosis.answersRequest yes only when what came back is what the request asked for; answer no when it is not -- too few records, the wrong records, a count that cannot match the request, or a Flow with no step that could have narrowed or filtered what the request asked to narrow; answer unknown when the summary does not let you tell. An empty result is judged the same way and is not wrong by itself: answer yes when the request's own terms make nothing the right answer and the Flow's steps show it actually looked -- a request to list whatever matches, where the Flow searched, filtered and stored no row, is answered by an empty table. Answer no when the request expected rows and the steps show the Flow never looked, looked somewhere the request did not ask for, or had no step that could store what it found. A run that stored no record set at all is judged on what it did rather than on what it returned: answer yes when the request was to carry something out and flowShape and the steps that ran show it was carried out, no when they show it was not. Put what you compared in observed and what the request asked for in expected. Do not answer yes because no step failed: every finished run you are shown finished without a failed step, and that is exactly why you are being asked. When you answer no, say in observed which rows or columns are wrong, and in changed what to change to fix it: name the clause of the request the result does not satisfy, and the step whose parameters would have to change, by its nodeId in resultSummary.flowShape. A bare verdict is not the job -- the repair that follows is given what you write here and nothing else. If you have no suggestion, answer no without one rather than inventing one: a refusal with no advice is still a valid refusal and nothing fails for it.";

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
const AUTOMATION_STUDIO_BUILD_TEST_VERIFICATION_INSTRUCTION = "When resultSummary.buildTest is present, what you judge is not a finished run but a build's test, run before its Flow is proposed: the Flow was run once from its start with no model attached and stored nothing, so judge from buildTest.steps rather than from record sets whether the Flow does everything the instructions ask. Each step gives its action, target (the step's own words: what it acted on, the item, the option chosen, the text typed), its outcome in this test, and observed (what the test saw: the rows a read returned, a check's answer, or, for a changing step run again, what it changed or what the page answered -- a replayed press's observed.changed is what the test saw it change). A replayed list read's observed may carry readRows: rows, the labels of the rows it returned (rowsNotShown more not listed), and readRows.leftOutOnlyByThis, per condition, the rows that condition alone left out, each written label — column: value where the test knows the value that condition tested on it, read as a read's leftOutOnlyByThis is above: none of them came back, and if the instructions ask for any of them, answer no and name that condition in changed. A withheld step changes something that lasts, so the test only checked it and did not do it again: verified means it could act now, present means its effect is already in place; judge it from explored (whether it changed anything when the build did it) and its target. The test started from a page that kept what the build did while it explored: going back to where the Flow starts undoes nothing that lasts, so a count, an item already in a cart or a coupon already collected may predate the test, and what a withheld step's effect shows, in endView or elsewhere, is exploration's doing, not proof the Flow does it. A read with afterWithheld ran after the withheld steps it names, whose acts the test did not do, on a page without what those acts make -- a status they set, a row they add, a count they change -- so a row it lacks for that reason is missing because of the test, not the Flow: judge the read by whether its conditions would keep what those acts make on the rows their passes name (explored says what the act changed when the build did it), and never answer no, or ask for a withheld step to be run, because what they make is absent. A replayed step's observed.changed gives the lines about its own control first, then text that now reads otherwise, such as a quantity it set (changedNotShown more not listed): read it for a step that undoes what another step did. A step with excused did not hold in this test, and the Flow passes over it as written; excused says why (optional, an interruption that was not there, a check, a fallback, a repeat, or a step that needed what a checked step would have done), and the test passed with it. An excused step is not a defect: it is no reason to answer no on its own, and changed never asks to fix, rerun or remove it; judge whether the instructions are done from the other steps. A step's claims, buildTest.checklist and buildTest.missingActs are the build's own reading and are information, not proof: decide from what the steps' own words and observations show was done, and to which item. A carried step was copied from an earlier Flow; with outcome not_run it is no evidence that its act is done. runs says when a step runs: optional, only if another step succeeded, or repeated over another step's rows. A repeated step acts on each row that step keeps, finding its control again inside each row, never only on the row it was built on, so its target names no row: read it as acting on every kept row. A repeated step runs once for each row of the list it repeats over, and its passes give each pass: pass (its number), row (the label of the row that pass acted on), its own outcome and observed. Judge each pass against its own row, not the row the build explored: a pass acting on its own row, not the explored one, is what a repeat does. A step that did not pass on some rows has not done its act for those rows. buildTest.inputs, where present, are the Flow's parameters at the values this test ran on (name, test, and the steps using it): a value shown there is the parameter at its test value, not fixed text, and a later run may supply another. A value written as step N inside observed is the same text step N's observed gave in that place. buildTest.notes, where present, are what Core's own checks found the Flow's steps cannot do: produce or save the records the instructions ask for (with the columns they named), or go to where the Flow starts (starts). Confirm each against the steps; when one holds, answer no and say it in observed, and in changed the step to add. Answer no when a clause of the instructions is done by no step -- an item never searched for, chosen or acted on, a step acting on another item than the one asked for, a value or count never set, a list not read whole -- and say in observed which clause is not done, in expected what the instructions ask, and in changed which step to change or add, by its step number in buildTest.steps. When the person's instructions name a route to follow -- pages, menus or links to go through in order -- a Flow that starts deeper than the route's first place, or skips a place on it, does not do what was asked.";

/**
 * The instruction a diagnosis-shaped task is given: the fields, plus what this
 * particular call is for. A verification of a build's test (`buildTest`) is
 * also told how to read one; a finished run's is not.
 */
export function automationStudioDiagnosisPromptInstruction(taskKind: AutomationStudioLlmTaskKind, judged: { buildTest?: boolean } = {}): string {
  if (!automationStudioLlmTaskExpectsDiagnosis(taskKind) || taskKind !== "loop_verification") return AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION;
  const verification = `${AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION} ${AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION}`;
  return judged.buildTest ? `${verification} ${AUTOMATION_STUDIO_BUILD_TEST_VERIFICATION_INSTRUCTION}` : verification;
}
