// An action card in words: Core's short name for the kind, what it acted on
// (or "the page" for an action on the page that named nothing), and how it
// went: done, passed, didn't work with why, and working or waiting only
// while it is the action of the moment.

import assert from "node:assert/strict";
import { test } from "vitest";
import { ACTIVITY_ACTION_NAMES } from "fluxiq/ui";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { actionCard, type ActionCard } from "../action-card.ts";
import { cardWords } from "../card-words.ts";

function card(fields: Partial<ActionCard>): ActionCard {
  return { kind: "click", target: "Get a free quote", outcome: "done", why: null, key: "action:b#1", said: undefined, answer: undefined, check: false, ...fields };
}

test("the name, the target and the outcome, on one accessible line", () => {
  assert.deepEqual(cardWords(card({}), false), { state: "done", name: "Click", target: "Get a free quote", whole: false, outcome: "Done", label: "Click, Get a free quote: Done" });
  assert.deepEqual(cardWords(card({ outcome: "failed", why: "it wasn't on the page" }), false), {
    state: "failed",
    name: "Click",
    target: "Get a free quote",
    whole: false,
    outcome: "Didn't work: it wasn't on the page",
    label: "Click, Get a free quote: Didn't work: it wasn't on the page"
  });
});

// t193 (run-muqiojz4-04a7a8fc): "Click · the page" and "Action · the page" said nothing a person
// could tell apart; the message above the card says what the step did.
test("a card that named nothing says no target, never \"the page\"", () => {
  for (const kind of ["click", "type", "read", "other", "navigate", "look", "wait", "person_check", "permission", "draft", "test", "result_check", "repair"] as const) {
    const words = cardWords(card({ kind, target: null }), false);
    assert.equal(words.target, null, kind);
    assert.equal(words.name, ACTIVITY_ACTION_NAMES[kind]);
    assert.equal(words.label, `${ACTIVITY_ACTION_NAMES[kind]}: Done`);
  }
});

test("a failure says why in words: Core's reason first, else its sentence; a check passes or does not", () => {
  assert.equal(cardWords(card({ outcome: "failed", said: "The field was covered by a banner." }), false).outcome, "Didn't work: the field was covered by a banner.");
  assert.equal(cardWords(card({ outcome: "failed", said: "URL was refused." }), false).outcome, "Didn't work: URL was refused.");
  assert.equal(cardWords(card({ outcome: "failed" }), false).outcome, "Didn't work");
  assert.equal(cardWords(card({ kind: "test", check: true, target: null, said: "The form is open." }), false).outcome, "Passed: the form is open.");
  assert.equal(cardWords(card({ kind: "test", check: true, target: null, outcome: "failed", said: "No price was shown." }), false).outcome, "Didn't pass: no price was shown.");
  assert.equal(cardWords(card({ said: "Clicked it." }), false).outcome, "Done", "a done action's sentence repeats the card");
});

test("working shows only on the action of the moment; a wait says so until Core settles it", () => {
  assert.deepEqual([cardWords(card({ outcome: "working" }), true).state, cardWords(card({ outcome: "working" }), true).outcome], ["working", "Working on it"]);
  assert.deepEqual([cardWords(card({ kind: "person_check", target: null, outcome: "waiting" }), true).outcome, cardWords(card({ kind: "person_check", target: null, outcome: "waiting" }), true).label], ["Waiting for you", "Robot check: Waiting for you"]);
  const old = cardWords(card({ outcome: "working" }), false);
  assert.deepEqual([old.state, old.outcome, old.label], ["settled", null, "Click, Get a free quote"]);
  // Only Core's resolved row (any `resolution`, `cancelled` included) ends a
  // wait; the work moving on or ending does not, as in the Core panel.
  const waiting = cardWords(card({ outcome: "waiting" }), false);
  assert.deepEqual([waiting.state, waiting.outcome, waiting.label], ["waiting", "Waiting for you", "Click, Get a free quote: Waiting for you"]);
});

test("a wait on the person that Core settled says Core's sentence: done with it, or didn't work with why", () => {
  const robot = { kind: "person_check", target: null } as const;
  assert.equal(cardWords(card({ ...robot, answer: "You pressed Continue." }), false).outcome, "Done. You pressed Continue.");
  assert.equal(cardWords(card({ ...robot, outcome: "failed", why: "you pressed Stop", answer: "You pressed Stop." }), false).outcome, "Didn't work: you pressed Stop");
  assert.equal(cardWords(card({ ...robot, outcome: "failed", answer: "Something new happened." }), false).outcome, "Didn't work. Something new happened.", "a way to end Core has no why for yet");
  assert.equal(cardWords(card({ ...robot, answer: "You pressed Continue." }), false).label, "Robot check: Done. You pressed Continue.");
});

// t174-w85 (run-murwd8le-79e735a8, UI review t174-w81).
// D1, 00019 and 00021: the judges disagreed, so the result was unverified, and the
// card read "Check result · Didn't pass" in red on a run that met its task.
test("a result check Core could not confirm says not confirmed, never didn't pass, and is not marked failed", () => {
  const unsure = card({ kind: "result_check", target: null, check: true, outcome: "failed", unconfirmed: true, said: "The two checks of this result disagreed." });
  const words = cardWords(unsure, false);
  assert.deepEqual([words.state, words.outcome, words.label], ["unconfirmed", "Not confirmed: the two checks of this result disagreed.", "Check result: Not confirmed: the two checks of this result disagreed."]);
  assert.equal(cardWords({ ...unsure, said: undefined }, false).outcome, "Not confirmed");
  // A result judged not to answer is still a failure.
  const { unconfirmed: _unconfirmed, ...refuted } = unsure;
  assert.deepEqual([cardWords(refuted, false).state, cardWords(refuted, false).outcome], ["failed", "Didn't pass: the two checks of this result disagreed."]);
});

// D4, 00011 and 00014: every step of the build's test read "Test run · ×".
test("a test run's step is named by its action and says it was a test", () => {
  const typed = cardWords(card({ kind: "type", target: '"Voltbay USB-C hub" into Autumn Mega Sale: up to 70% off', testing: true }), false);
  assert.deepEqual([typed.name, typed.label], ["Testing: Type", 'Testing: Type, "Voltbay USB-C hub" into Autumn Mega Sale: up to 70% off: Done']);
  // Shown with what it typed, leaving out a field too long to fit beside it (t193 1003 D8); the accessible name keeps every word.
  assert.equal(typed.target, '"Voltbay USB-C hub"');
  assert.equal(cardWords(card({ testing: true }), false).name, "Testing: Click");
  assert.equal(cardWords(card({}), false).name, "Click", "a build's own step is not a test");
});

// t193 1002-M (`run-murzln6g-11debe1d`, C10): six test steps the test did not
// press read "Done", and the drawer's "×" the Flow passes over read "Didn't
// work: it didn't work the same way again". Merged with t174-w85 D4: such a
// step is named by its action and marked as a test; these words are its outcome.
test("a test step says what the test did with it: done again, checked, already done on the site, or skipped", () => {
  assert.equal(cardWords(card({ kind: "test", tested: "Checked, not pressed" }), false).outcome, "Checked, not pressed");
  assert.equal(cardWords(card({ kind: "test", tested: "Already done on the site" }), false).label, "Test run, Get a free quote: Already done on the site");
  assert.equal(cardWords(card({ kind: "test" }), false).outcome, "Done");

  const row = (seq: number, text: string): ClientGatewayActivity => ({
    activityId: "build:b", sequence: seq, subject: { kind: "build", id: "b", projectId: "p" }, at: "2026-10-02T06:08:30.000Z", phase: "verifying",
    label: "Trying the Flow from the start: clicking “×”", detail: { kind: "tool", title: "Clicking “×”", status: "succeeded", ref: "core.run_node", text }
  });
  const words = (seq: number, text: string) => cardWords(actionCard(row(seq, text), `action:build:b#${seq}`)!, false);
  assert.deepEqual([words(1, "Result: core.replay.failed · Excused: interruption · Node: web.output.dom-click").state, words(1, "Result: core.replay.failed · Excused: interruption · Node: web.output.dom-click").outcome], ["done", "Skipped: not there, optional"]);
  assert.equal(words(2, "Result: core.replay.verified · Node: web.output.dom-click").outcome, "Checked, not pressed");
  assert.equal(words(3, "Result: core.replay.remembered · Node: web.output.dom-click").outcome, "Already done on the site");
  assert.equal(words(4, "Result: core.replay.replayed · Node: web.output.dom-click").outcome, "Done");
  // Core's reason for a replay that failed (`ui/activity-action/failure-reason.ts`, t174-w116, D21): the result
  // said once, with what happened, not "Didn't work: it didn't work the same way again".
  assert.equal(words(5, "Result: core.replay.failed · Node: web.output.dom-click").outcome, "Didn't work: it couldn't run when the test tried it again");
});

// t193 1003 (`run-musp4h2f-72e8ed99`, C13/C14): an edit Core refused, and a call refused as a
// repeat, were a header and prose with no card, ending "so this was not done: <the model's
// summary>". Each is now a card under its decision: what was asked, "Not done", Core's reason.
test("a decision Core declined says not done and why, never didn't work, and an edit done in part says so", () => {
  const refused = cardWords(card({ kind: "draft", target: null, outcome: "failed", why: "that step is already in the Flow", refused: { all: true, because: "that step is already in the Flow" } }), false);
  assert.deepEqual(refused, { state: "refused", name: "Change the Flow", target: null, whole: false, outcome: "Not done: that step is already in the Flow", label: "Change the Flow: Not done: that step is already in the Flow" });
  const part = cardWords(card({ kind: "draft", target: null, outcome: "done", refused: { all: false, because: "that step already does that" } }), false);
  assert.deepEqual([part.state, part.outcome], ["done", "Only partly done: that step already does that"]);

  const row = (seq: number, title: string, status: "succeeded" | "failed", text?: string, ref = "core.flow_draft"): ClientGatewayActivity => ({
    activityId: "build:b", sequence: seq, subject: { kind: "build", id: "b", projectId: "p" }, at: "2026-10-03T18:05:00.000Z", phase: "building",
    label: `${title} — not done`, detail: { kind: "tool", title, status, ref, ...(text === undefined ? {} : { text }) }
  });
  const words = (event: ClientGatewayActivity) => cardWords(actionCard(event, `action:build:b#${event.sequence}`)!, false);
  const edit = words(row(1, "Editing the Flow", "failed", "Result: llm_evidence_loop.draft_amendments_refused · Reason: already_in_flow,already_out"));
  assert.deepEqual([edit.state, edit.name, edit.outcome], ["refused", "Change the Flow", "Not done: that step is already in the Flow; and that step is already out of the Flow"]);
  const rerun = words(row(2, "Running the step again", "failed", "Result: llm_evidence_loop.repeat_refused · Reason: changed_nothing"));
  assert.deepEqual([rerun.name, rerun.target, rerun.outcome], ["Change the Flow", "run the step again", "Not done: it was already tried exactly this way and changed nothing"]);
  const press = words({ ...row(3, "Clicking “Add to cart”", "failed", "Result: llm_evidence_loop.repeat_refused · Reason: failed · Node: web.output.dom-click", "core.run_node"), phase: "exploring" });
  assert.deepEqual([press.state, press.name, press.target, press.outcome], ["refused", "Click", "Add to cart", "Not done: it was already tried exactly this way and did not work"]);
  assert.deepEqual([words(row(4, "Editing the Flow", "succeeded")).state, words(row(4, "Editing the Flow", "succeeded")).outcome], ["done", "Done"]);
  for (const said of [edit, rerun, press]) assert.doesNotMatch(said.label, /so this was not done|llm_evidence_loop|already_in_flow/u);
});

// t193 1003 D8 (`run-musp4h2f-72e8ed99`, 12/16-mid-build-panel): two test cards read "Testing: Click ·
// ValueRidge Everyday Di…", cut before the words that told the 3-Pack from the single pack.
// Round 12, lane D (`run-mv62icw0-070f88ad`, 00010): cut to the head, equal labels read "wait …
// be accepted · Jonas Weber" and "wait … to be accepted · Lin Zhao", and the view's own cut read
// "friend requests pa…". A target of several words is shown whole and wrapped, never cut there.
test("a long target of several words is shown whole and wrapped, so the words that tell two cards apart stay visible", () => {
  const pack = cardWords(card({ target: "ValueRidge Everyday Dinner Napkins 250 Count (3-Pack)", testing: true }), false);
  const single = cardWords(card({ target: "ValueRidge Everyday Dinner Napkins 250 Count", testing: true }), false);
  assert.notEqual(pack.target, single.target);
  for (const [words, whole] of [[pack, "ValueRidge Everyday Dinner Napkins 250 Count (3-Pack)"], [single, "ValueRidge Everyday Dinner Napkins 250 Count"]] as const) {
    assert.deepEqual([words.target, words.whole], [whole, true]);
  }
  // Equal labels read the same on every row, whatever the row's name.
  const waits = ["Jonas Weber", "Lin Zhao"].map((row) => cardWords(card({ kind: "wait", target: `wait for the request to be accepted · ${row}` }), false).target);
  assert.deepEqual(waits, ["wait for the request to be accepted · Jonas Weber", "wait for the request to be accepted · Lin Zhao"]);
  // The accessible name keeps every word.
  assert.equal(pack.label, "Testing: Click, ValueRidge Everyday Dinner Napkins 250 Count (3-Pack): Done");
  // A target that fits is left whole on one line, and a long path is cut where one of its parts ends, keeping its end.
  assert.deepEqual([cardWords(card({ target: "Add to cart", testing: true }), false).target, cardWords(card({ target: "Add to cart", testing: true }), false).whole], ["Add to cart", false]);
  const path = cardWords(card({ kind: "navigate", target: "/scenarios/bigbox/store/product/valueridge-dinner-napkins-250", testing: true }), false).target!;
  assert.ok(path.endsWith("napkins-250"), path);
  // Cut where one of its parts ends (U-13 of the run-muw60j7c-bb7c9a62 review: "Hybr…"), never inside one.
  assert.ok(path.startsWith("…") && /^[/-]/u.test("/scenarios/bigbox/store/product/valueridge-dinner-napkins-250".slice(-(path.length - 1) - 1)), path);
  assert.ok("Testing: Open page".length + path.length <= 36, path);
  // A typing step keeps every word it typed, wrapped, and leaves out the field when both do not fit the head.
  const typed = cardWords(card({ kind: "type", target: '"ValueRidge Everyday Dinner Napkins 250 Count" into Search', testing: true }), false);
  assert.deepEqual([typed.target, typed.whole], ['"ValueRidge Everyday Dinner Napkins 250 Count"', true]);
  assert.equal(cardWords(card({ kind: "type", target: '"Napkins 250 Count" into Search' }), false).target, '"Napkins 250 Count" into Search', "a typed target that fits keeps its field");
  // Past what a few wrapped lines hold, it is cut from the middle where words end, keeping both ends.
  const long = Array.from({ length: 30 }, (_, index) => `word${index}`).join(" ");
  const cut = cardWords(card({ target: long }), false).target!;
  assert.ok(cut.length <= 120 && cut.startsWith("word0 ") && cut.endsWith(" word29") && cut.includes(" … "), cut);
  for (const word of cut.replace(/…/gu, " ").split(/\s+/u).filter(Boolean)) assert.ok(long.split(" ").includes(word), `"${word}" is not a whole word`);
});

// U-13 of the run-muw60j7c-bb7c9a62 UI review: "Read list · name, ... rating and 3 more" elided
// inside the list, and "Look · Sponsored ⓘ ... Earbuds, Hybr..." cut a word.
// R2-U-8 of the run-muwansvz-a2b4a987 UI review: renamed to fit, one list had three names --
// "name, price and 4 more", "name and 5 more" (test card) and the overlay's "name, price,
// rating and 3 more". Core's name for a list is shown as Core gave it, whole: the view wraps it.
test("a long target keeps whole words: a list keeps Core's name, whole, and no word is cut", () => {
  for (const testing of [false, true]) {
    const list = cardWords(card({ kind: "read", target: "name, price, rating and 3 more", ...(testing ? { testing: true as const } : {}) }), false);
    assert.equal(list.target, "name, price, rating and 3 more", `testing: ${testing}`);
    assert.equal(list.whole, true, "longer than the head holds, so the view shows it whole rather than cut");
  }
  const fits = cardWords(card({ kind: "read", target: "name, price and rating" }), false);
  assert.deepEqual([fits.target, fits.whole], ["name, price and rating", false], "a list that fits is left as it is");
  // U-R3-1 of run-mux6nxst-c9bca37c: Core names a list of two or three fields by all of them
  // ("name and mutualFriends"), with no "and N more"; its test card read "Testing: Read list ·
  // name and…". A read's target is Core's name for its list, whatever its shape: never cut.
  for (const name of ["name and mutualFriends", "name, price and averageRatingOutOfFive"]) {
    const tested = cardWords(card({ kind: "read", target: name, testing: true }), false);
    assert.deepEqual([tested.target, tested.whole], [name, true], name);
  }
  const words = "Sponsored Pulsebud Earbuds Hybridnoisecancellingwirelessbuds";
  const look = cardWords(card({ kind: "look", target: words }), false);
  assert.deepEqual([look.target, look.whole], [words, true], "several words are shown whole, wrapped, and no word is cut");
  const one = "Hybridnoisecancellingwirelessbudswithcase";
  assert.equal(cardWords(card({ kind: "look", target: one }), false).target, one, "one word with nowhere to cut is left for the view");
});

// The lead's contract for t276 item 7: Core's `ActivityAction.result` ("13 rows from 5 pages",
// "removed step 9, Add to cart") says what a finished action came to. A read card said a
// bare "Done" while the chat claimed every page was read (U-1, run-muw60j7c-bb7c9a62).
test("a done card says what it came to after Done, and a test step says both what it did and what it came to", () => {
  assert.equal(cardWords(card({ kind: "read", target: null, result: "13 rows from 5 pages" }), false).outcome, "Done: 13 rows from 5 pages");
  assert.equal(cardWords(card({ kind: "draft", target: null, result: "Removed step 9, Add to cart" }), false).outcome, "Done: removed step 9, Add to cart");
  assert.equal(cardWords(card({ kind: "read", target: null, result: "13 rows from 5 pages" }), false).label, "Read list: Done: 13 rows from 5 pages");
  assert.equal(cardWords(card({ kind: "read", target: null, testing: true, tested: "Already done on the site", result: "8 rows" }), false).outcome, "Already done on the site — 8 rows");
  assert.equal(cardWords(card({ kind: "person_check", target: null, answer: "You pressed Continue.", result: "ignored" }), false).outcome, "Done. You pressed Continue.", "a settled wait says how it was settled");
  assert.equal(cardWords(card({ kind: "read", target: null, result: "  " }), false).outcome, "Done", "an empty result says nothing");
  assert.equal(cardWords(card({ kind: "read", target: null, outcome: "working", result: "8 rows" }), true).outcome, "Working on it");
});

// U-8 of the run-muw60j7c-bb7c9a62 UI review: refusals read as work, three "Edit the Flow · run the
// step again / Not done: ..." cards in a row.
test("a refused decision never reads as work done or under way, and a repeated refusal says how many times", () => {
  const because = "that step was already tried exactly this way on this same page";
  const refused = { all: true, because } as const;
  for (const outcome of ["working", "done", "failed"] as const) {
    for (const current of [true, false]) {
      const words = cardWords(card({ kind: "draft", target: "run the step again", outcome, refused }), current);
      assert.deepEqual([words.state, words.outcome], ["refused", `Not done: ${because}`], `${outcome}, current ${current}`);
    }
  }
  // live-C round 3 (run-mux6naez-6c20f26e, moment 05; steps 0019-0020): "Edit the Flow / Only partly
  // done: that step is already in the Flow" said only what was refused, so it read as the work. It
  // says what landed, then what did not and why.
  const part = cardWords(card({ kind: "draft", target: null, outcome: "done", refused: { all: false, because: "that step already does that" }, result: "added step 4" }), false);
  assert.deepEqual([part.state, part.outcome], ["done", "Only partly done: added step 4; not done: that step already does that"]);
  const bare = cardWords(card({ kind: "draft", target: null, outcome: "done", refused: { all: false, because: "that step is already in the Flow" } }), false);
  assert.equal(bare.outcome, "Only partly done: that step is already in the Flow", "with nothing said of what landed, the reason alone");
  const thrice = cardWords(card({ kind: "draft", target: "run the step again", outcome: "failed", refused, times: 3 }), false);
  assert.deepEqual([thrice.outcome, thrice.label], [`Not done (3 times): ${because}`, `Change the Flow, run the step again: Not done (3 times): ${because}`]);
  assert.equal(cardWords(card({ kind: "draft", target: null, outcome: "failed", refused, times: 1 }), false).outcome, `Not done: ${because}`, "once is said as once");
});

// Lane A U1: an option chosen and a box ticked read "Click"; lane C: "Action · Dom next page".
test("a card names the act where Core names one narrower than the kind, and keeps its target", () => {
  assert.equal(cardWords(card({ name: "Choose", target: "Size" }), false).label, "Choose, Size: Done");
  assert.equal(cardWords(card({ name: "Tick", target: "Gift wrap", testing: true }), false).name, "Testing: Tick");
  assert.equal(cardWords(card({ kind: "navigate", name: "Next page", target: null }), false).label, "Next page: Done");
  assert.equal(cardWords(card({ kind: "draft", name: "Send the Flow again", target: null, outcome: "failed", refused: { all: true, because: "the same Flow was already sent exactly like this and was not accepted" } }), false).label,
    "Send the Flow again: Not done: the same Flow was already sent exactly like this and was not accepted");
});

// Lane D finding 2: a retried press read as a red card followed by a green one.
test("a step that worked when tried again says on which try, and why the tries before did not", () => {
  const words = cardWords(card({ target: "Confirm · Jonas Weber", retried: { tries: 2, why: "the site asked FluxIQ to slow down" } }), false);
  assert.equal(words.state, "done");
  assert.equal(words.outcome, "Done on the 2nd try. The first try didn't work: the site asked FluxIQ to slow down");
  assert.equal(cardWords(card({ retried: { tries: 3, why: null }, result: "8 rows" }), false).outcome, "Done on the 3rd try: 8 rows. The first 2 tries didn't work");
});

// t649 (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, 00012): a builder's submission of its part's steps
// that Core refused under a code with no failing word in it read a green "Action · Submit subflow /
// Done", while the refusal just above it read "Didn't work". Nothing of either was saved: both are
// "Not done", in words, and an accepted one is still "Done".
test("a submission of steps Core refused is never drawn as done", () => {
  const row = (seq: number, text?: string): ClientGatewayActivity => ({
    activityId: "build:b", sequence: seq, subject: { kind: "build", id: "b", projectId: "p" }, at: "2026-10-15T20:33:06.000Z", phase: "exploring",
    label: "Using “Submit subflow” — done", detail: { kind: "tool", title: "Using “Submit subflow”", status: "succeeded", ref: "core.submit_subflow", ...(text === undefined ? {} : { text }) }
  });
  const words = (event: ClientGatewayActivity) => cardWords(actionCard(event, `action:build:b#${event.sequence}`)!, false);
  const unresolved = words(row(1, "Result: flow_bootstrap.evidence_completion_parameters_unresolved:c01a26f6"));
  assert.deepEqual([unresolved.state, unresolved.outcome], ["refused", "Not done: some steps weren't written in a way the Flow can run"]);
  const scope = words({ ...row(2, "Result: subflow.scope_refused:ba64ff77"), label: "Using “Submit subflow” — didn't work" });
  assert.deepEqual([scope.state, scope.outcome], ["refused", "Not done: some steps weren't written in a way the Flow can run"]);
  const again = words(row(3, "Result: candidate.unchanged_submission"));
  assert.equal(again.outcome, "Not done: it was the same as the steps already sent, sent again unchanged");
  const accepted = words(row(4));
  assert.deepEqual([accepted.state, accepted.outcome], ["done", "Done"]);
  // Core's own refusal, when it gave one, stands: a repeat refused says why it was not sent again.
  const repeat = words({ ...row(5, "Result: llm_evidence_loop.repeat_refused · Reason: failed"), label: "Using “Submit subflow” — not done" });
  assert.equal(repeat.outcome, "Not done: the same Flow was already sent exactly like this and was not accepted");
  for (const said of [unresolved, scope, again]) assert.doesNotMatch(said.label, /Done(?!:)|flow_bootstrap|subflow\.|candidate\./u);
});

// Round 2 of t649: Core now reads a project builder's refused submission itself and says why in words
// (`Declined: ...`, Core's `runtime/activity/candidate/result.ts`); the card says Core's words, and the
// extension's own reading stands back.
test("a refused submission Core says in words reads Core's reason", () => {
  const row: ClientGatewayActivity = {
    activityId: "build:b", sequence: 1, subject: { kind: "build", id: "b", projectId: "p" }, at: "2026-10-15T20:33:06.000Z", phase: "exploring",
    label: "Using “Submit subflow” — not done",
    detail: { kind: "tool", title: "Using “Submit subflow”", status: "failed", ref: "core.submit_subflow", text: "Result: flow_bootstrap.evidence_completion_parameters_unresolved:c01a26f6 · Declined: some steps point at things that weren't seen on the page; 2 things to fix" }
  };
  const words = cardWords(actionCard(row, "action:build:b#1")!, false);
  assert.deepEqual([words.state, words.outcome], ["refused", "Not done: some steps point at things that weren't seen on the page; 2 things to fix"]);
});
