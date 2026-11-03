// Which events become FluxIQ's step messages, and what each says: every
// explained decision is a message with its reason, the actions after it are
// that message's cards, checks, asks and repairs are messages, a decision
// still being made and Core's bookkeeping are not, a message and a card are
// keyed by the event that opened them and updated in place, and no raw id is
// ever shown.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { activityEvent, eventTime } from "../../../tests/activity-fixture.ts";
import { ACTIVITY_RESULT_CHECK_LABELS } from "fluxiq/ui";
import { cardWords } from "../card-words.ts";
import { stepMessages, type StepMessage } from "../messages.ts";

type Detail = NonNullable<ClientGatewayActivity["detail"]>;

const decide = (sequence: number) => activityEvent(sequence, { phase: "thinking", detail: { kind: "thought", title: "Deciding the next step", status: "started" } });
const thought = (sequence: number, title: string, text: string, phase: ClientGatewayActivity["phase"] = "exploring") =>
  activityEvent(sequence, { phase, label: title, detail: { kind: "thought", title, text, status: "succeeded" } });
const tool = (sequence: number, title: string, status: Detail["status"], fields: Partial<Detail> = {}) =>
  activityEvent(sequence, { phase: "exploring", detail: { kind: "tool", title, ref: "core.run_node", ...(status === undefined ? {} : { status }), ...fields } });

const QUOTE = "Clicking “Get a free quote”";

function said(messages: StepMessage[]): Array<[string, string | undefined, string | null]> {
  return messages.map((message) => [message.title, message.text, message.actions.at(-1)?.outcome ?? null]);
}

test("each explained decision is one message with its reason; the action after it is its card", () => {
  const events = [
    activityEvent(1, { detail: { kind: "step", title: "Build started", status: "started" } }),
    decide(2),
    thought(3, QUOTE, "The quote form is behind this button, so I'm opening it."),
    tool(4, QUOTE, "started"),
    tool(5, QUOTE, "succeeded", { text: "Result: web.click.succeeded" }),
    decide(6),
    thought(7, "Typing the postcode", "The form asks where the job is.", "building"),
    tool(8, "Typing the postcode", "failed", { text: "The field was covered by a banner." })
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(said(messages), [
    [QUOTE, "The quote form is behind this button, so I'm opening it.", "done"],
    ["Typing the postcode", "The form asks where the job is.", "failed"]
  ]);
  assert.deepEqual(messages.map((message) => message.kind), ["decision", "decision"]);
  assert.deepEqual(messages.map((message) => message.actions.map((card) => [card.key, card.kind, card.target])), [
    [["action:build-1#4", "click", "Get a free quote"]],
    [["action:build-1#8", "type", null]]
  ], "one card each, keyed by the event that started it");
  assert.equal(messages[0]!.actions[0]!.said, undefined, "a result code is not words");
  assert.equal(messages[1]!.actions[0]!.said, "The field was covered by a banner.");
  assert.deepEqual(messages.map((message) => message.key), ["step:build-1#3", "step:build-1#7"]);
  assert.deepEqual(messages.map((message) => message.latest), [false, true]);
});

test("a decision still being made, a pure status change, a build's start and finish, and bookkeeping are not messages", () => {
  const events = [
    activityEvent(1, { detail: { kind: "step", title: "Build started", status: "started" } }),
    decide(2),
    activityEvent(3),
    activityEvent(4, { detail: { kind: "tool", title: "Using core.state_digest", ref: "core.state_digest", status: "succeeded" } }),
    activityEvent(5, { detail: { kind: "check", title: "Answer check before repeating a look", status: "succeeded" } }),
    activityEvent(6, { detail: { kind: "thought", title: "Deciding the next step", status: "succeeded" } }),
    activityEvent(7, { phase: "done", final: true, detail: { kind: "step", title: "Build finished", status: "succeeded" } })
  ];
  assert.deepEqual(stepMessages(events, 100), []);
});

// t378 W4: Core's "Asking the AI model again" row (failed, with Core's sentence)
// is FluxIQ's own status, not the model's reason: told as a note, never as a
// decision, and the action the next decision leads to is not its card.
test("Core's asking-again row is a note, not a decision, and owns no card", () => {
  const again = "The AI model's answer didn't make sense, so FluxIQ is asking it again. If that keeps happening, the build stops.";
  const events = [
    decide(1),
    activityEvent(2, { phase: "thinking", label: "The AI model's answer couldn't be used", detail: { kind: "thought", title: "Asking the AI model again", status: "failed", text: again } }),
    decide(3),
    tool(4, QUOTE, "started")
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => [message.kind, message.title, message.text, message.actions.length]), [
    ["note", "Asking the AI model again", again, 0],
    ["action", QUOTE, undefined, 1]
  ]);
});

test("checks and repairs are messages with their verdict and diagnosis; a check that started is updated in place", () => {
  const events = [
    thought(1, "Fixing the search click", "The button moved after the banner closed.", "repairing"),
    activityEvent(2, { phase: "verifying", detail: { kind: "check", title: "Completion check", status: "started" } }),
    activityEvent(3, { phase: "verifying", detail: { kind: "check", title: "Completion check", text: "The quote form is open with the postcode filled.", status: "succeeded" } }),
    activityEvent(4, { phase: "verifying", detail: { kind: "check", title: "Completion check", text: "No price was shown.", status: "failed" } }),
    activityEvent(5, { phase: "failed", final: true, detail: { kind: "step", title: "Build failed", status: "failed" } })
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => [message.kind, message.title, message.text]), [
    ["repair", "Fixing the search click", "The button moved after the banner closed."],
    // Core's "Completion check" checks whether the proposed Flow is finished, never its result:
    // "The result didn't pass its check" headed "Sent back because some steps weren't written in a
    // way the Flow can run" (run-mux74k5q-1c3c2127 UI review).
    ["check", "Checked the Flow is finished", "The quote form is open with the postcode filled."],
    ["check", "The Flow isn't finished yet", "No price was shown."],
    ["step", "The build failed", undefined]
  ]);
  assert.equal(messages[1]!.key, "step:build-1#2", "the check keeps the key of the event that opened it");
  assert.equal(messages[1]!.sequence, 3);
  assert.deepEqual(messages.map((message) => message.actions.map((card) => [card.key, card.kind, card.outcome, card.check])), [
    [],
    [["action:build-1#2", "test", "done", true]],
    [["action:build-1#4", "test", "failed", true]],
    []
  ], "a check is its own card, updated in place; a repair's diagnosis and the failure marker are words");
});

test("an action with no decision before it is a message that is its card; every action after a decision is one of its cards", () => {
  const events = [
    tool(1, "Using core.run_node", "started"),
    tool(2, "Using core.run_node", "succeeded", { text: "Result: web.click.succeeded" }),
    thought(3, "Opening the results", "The list is on the next page."),
    activityEvent(4, { phase: "exploring", detail: { kind: "tool", title: "Opening the results", ref: "web.navigate", status: "succeeded" } }),
    activityEvent(5, { phase: "exploring", detail: { kind: "tool", title: "Using web.inspect_current_page", ref: "web.inspect_current_page", status: "succeeded" } })
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(said(messages), [
    ["Clicked on the page", undefined, "done"],
    ["Opening the results", "The list is on the next page.", "done"]
  ]);
  assert.deepEqual(messages.map((message) => message.kind), ["action", "decision"]);
  assert.deepEqual(messages.map((message) => message.actions.map((card) => [card.key, card.kind])), [
    [["action:build-1#1", "click"]],
    [["action:build-1#4", "navigate"], ["action:build-1#5", "look"]]
  ]);
  for (const message of messages) {
    assert.doesNotMatch(`${message.title} ${message.text ?? ""}`, /\b[a-z]+\.[a-z_]+/u, "no raw id");
    for (const card of message.actions) assert.doesNotMatch(`${card.target ?? ""} ${card.said ?? ""} ${card.why ?? ""}`, /\b[a-z]+\.[a-z_]+/u, "no raw id");
  }
});

test("a run's steps are messages; one Core started is over once anything after it happened", () => {
  const run = (sequence: number, index: number, label: string) => activityEvent(sequence, {
    activityId: "run:r1",
    subject: { kind: "run", id: "r1", projectId: "p" },
    phase: "running",
    step: { index, count: 3, label },
    detail: { kind: "step", title: label, status: "started" }
  });
  const messages = stepMessages([run(1, 1, "Open the shop"), run(2, 2, "Search for lamps")], 100);
  assert.deepEqual(said(messages), [["Step 1: Open the shop", undefined, "done"], ["Step 2: Search for lamps", undefined, "working"]]);
  assert.deepEqual(messages.map((message) => message.actions.map((card) => [card.kind, card.target])), [[["navigate", "Open the shop"]], [["type", "Search for lamps"]]]);
});

test("units of work never share a message, and at most the limit are kept, the newest", () => {
  const events = [
    thought(1, "Clicking Search", "It runs the search."),
    tool(2, "Clicking Search", "started"),
    activityEvent(3, { activityId: "run:r9", detail: { kind: "tool", title: "Clicking Search", ref: "core.run_node", status: "succeeded" } }),
    tool(4, "Clicking Search", "succeeded")
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => [message.key, message.actions.map((card) => card.outcome)]), [["step:build-1#1", ["done"]], ["step:run:r9#3", ["done"]]]);
  const many = Array.from({ length: 30 }, (_, index) => thought(index + 1, `Step ${index + 1}`, "Because."));
  assert.deepEqual(stepMessages(many, 2).map((message) => message.key), ["step:build-1#29", "step:build-1#30"]);
  assert.deepEqual(stepMessages(many, 0), []);
});

test("messages keep their keys and order as events arrive; an unreadable time takes the one before", () => {
  const events = [thought(1, "Looking for the form", "It should be on the home page.")];
  const first = stepMessages(events, 100);
  events.push(tool(2, "Looking for the form", "started"), activityEvent(3, { at: "not a time", phase: "exploring", detail: { kind: "note", title: "Found the form", text: "It is under the header." } }));
  const later = stepMessages(events, 100);
  assert.equal(later[0]!.key, first[0]!.key);
  assert.equal(later[0]!.at, first[0]!.at);
  assert.equal(later[1]!.at, eventTime(2), "the time of the event before it");
  assert.deepEqual(later.map((message) => message.title), ["Looking for the form", "Found the form"]);
});

test("a question to the person is a card waiting on them: a robot check, or a permission", () => {
  const events = [
    activityEvent(1, { phase: "waiting_permission", detail: { kind: "ask", title: "Asked the person to complete a check", text: "Complete the check on this page, then press Continue." } }),
    activityEvent(2, { phase: "waiting_permission", detail: { kind: "ask", title: "Asked for permission to send the message" } }),
    activityEvent(3, { phase: "exploring", detail: { kind: "ask", title: "Asked for permission to pay" } })
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => [message.kind, message.actions.map((card) => [card.kind, card.outcome])]), [
    ["ask", [["person_check", "waiting"]]],
    ["ask", [["permission", "waiting"]]],
    ["ask", [["permission", "waiting"]]]
  ]);
});

test("an action that started keeps its card and its place when it ends; nothing is reordered", () => {
  const events = [thought(1, QUOTE, "It opens the form."), tool(2, QUOTE, "started")];
  const first = stepMessages(events, 100);
  events.push(tool(3, QUOTE, "failed", { text: "Result: web.target.not_found · Node: web.output.dom-click" }));
  const later = stepMessages(events, 100);
  assert.equal(first[0]!.actions[0]!.key, later[0]!.actions[0]!.key);
  assert.deepEqual([first[0]!.actions[0]!.outcome, later[0]!.actions[0]!.outcome], ["working", "failed"]);
  assert.equal(later[0]!.actions[0]!.why, "FluxIQ couldn't find it where it was saved");
  assert.equal(later[0]!.actions[0]!.said, undefined, "the observer's record is not words");
  assert.equal(later[0]!.actions.length, 1);
});

const CHECK = "Asked the person to complete a check";
const PERMISSION = "Asked a question (permission)";
const waitFor = (sequence: number, title: string, ref: string | undefined, phase: ClientGatewayActivity["phase"] = "waiting_permission") =>
  activityEvent(sequence, { phase, detail: { kind: "ask", title, status: "started", ...(ref === undefined ? {} : { ref }), text: "FluxIQ needs you: complete the check on this page, then press Continue." } });
const settle = (sequence: number, title: string, ref: string, resolution: string, status: Detail["status"], text: string, phase: ClientGatewayActivity["phase"] = "building") =>
  activityEvent(sequence, { phase, label: text, detail: { kind: "ask", title, ref, status, text, resolution } as Detail });
const intervention = (sequence: number) => tool(sequence, "Checking the page", "succeeded", { text: "Result: web.intervention.required · Node: web.output.dom-click" });
const cardsOf = (messages: StepMessage[]) => messages.flatMap((message) => message.actions.map((card) => [card.key, card.kind, card.outcome, card.why, card.answer]));

test("a wait on the person ends only on Core's row that settles it, on the same card in the same place", () => {
  for (const [resolution, status, text, outcome, why] of [
    ["answered", "succeeded", "You pressed Continue.", "done", null],
    ["declined", "failed", "You pressed Stop.", "failed", "you pressed Stop"],
    ["timed_out", "failed", "Nobody answered in time.", "failed", "nobody answered in time"]
  ] as const) {
    const events = [thought(1, QUOTE, "It opens the form."), waitFor(2, CHECK, "person-needed.1")];
    const before = stepMessages(events, 100);
    events.push(settle(3, CHECK, "person-needed.1", resolution, status, text));
    const after = stepMessages(events, 100);
    assert.deepEqual(after.map((message) => message.key), before.map((message) => message.key), `${resolution}: no message added or moved`);
    assert.deepEqual(cardsOf(before), [["action:build-1#2", "person_check", "waiting", null, undefined]]);
    assert.deepEqual(cardsOf(after), [["action:build-1#2", "person_check", outcome, why, text]], resolution);
  }
  const permission = [waitFor(1, PERMISSION, "request-7"), settle(2, PERMISSION, "request-7", "allowed", "succeeded", "You allowed it.", "repairing")];
  assert.deepEqual(cardsOf(stepMessages(permission, 100)), [["action:build-1#1", "permission", "done", null, "You allowed it."]], "settled in the phase the work returned to");
});

test("a question is a card under the reasoning before it, as in the Core panel, and its own message only without one", () => {
  const under = stepMessages([thought(1, QUOTE, "It opens the form."), waitFor(2, CHECK, "person-needed.1")], 100);
  assert.deepEqual(under.map((message) => [message.kind, message.title, message.actions.map((card) => card.kind)]), [["decision", QUOTE, ["person_check"]]]);
  const alone = stepMessages([waitFor(1, CHECK, "person-needed.1")], 100);
  assert.deepEqual(alone.map((message) => [message.kind, message.actions.map((card) => card.kind)]), [["ask", ["person_check"]]]);
  // The work stopped first: Core settles the wait with `cancelled`, read through
  // the shared classifier with no value listed here.
  const stopped = stepMessages([waitFor(1, CHECK, "person-needed.1"), settle(2, CHECK, "person-needed.1", "cancelled", "failed", "The work stopped before this was answered.", "failed")], 100);
  assert.deepEqual(cardsOf(stopped).map(([, kind, outcome, why]) => [kind, outcome, why]), [["person_check", "failed", "the work stopped first"]]);
});

test("nothing after a question settles it: later tools, steps, notes and a failed end leave it waiting", () => {
  const events = [
    waitFor(1, CHECK, "person-needed.1"),
    activityEvent(2, { phase: "building", detail: { kind: "note", title: "Still here", text: "The page changed." } }),
    tool(3, QUOTE, "succeeded"),
    activityEvent(4, { phase: "failed", label: "Build failed", detail: { kind: "step", title: "Build failed", status: "failed" } })
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages[0]!.actions.map((card) => [card.key, card.outcome, card.answer]), [["action:build-1#1", "waiting", undefined]]);
});

test("one check is one card: the tool that met it and the robot-check ask share it, whichever comes first", () => {
  const askFirst = stepMessages([waitFor(1, CHECK, "person-needed.1"), intervention(2), settle(3, CHECK, "person-needed.1", "answered", "succeeded", "You pressed Continue.")], 100);
  assert.deepEqual(cardsOf(askFirst), [["action:build-1#1", "person_check", "done", null, "You pressed Continue."]]);
  assert.equal(askFirst.length, 1);

  const toolFirst = [thought(1, QUOTE, "It opens the form."), intervention(2)];
  const first = stepMessages(toolFirst, 100);
  assert.deepEqual(cardsOf(first), [["action:build-1#2", "person_check", "waiting", null, undefined]]);
  toolFirst.push(waitFor(3, CHECK, "person-needed.1"), settle(4, CHECK, "person-needed.1", "declined", "failed", "You pressed Stop."));
  const later = stepMessages(toolFirst, 100);
  assert.deepEqual(cardsOf(later), [["action:build-1#2", "person_check", "failed", "you pressed Stop", "You pressed Stop."]]);
  assert.deepEqual(later.map((message) => message.key), first.map((message) => message.key));
});

test("separate asks keep separate cards, and an ask with no ask id while one waits only restates it", () => {
  const events = [
    waitFor(1, PERMISSION, "request-1"),
    settle(2, PERMISSION, "request-1", "allowed", "succeeded", "You allowed it."),
    waitFor(3, CHECK, "person-needed.2"),
    activityEvent(4, { phase: "waiting_permission", detail: { kind: "ask", title: "Run is waiting for an answer" } })
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(cardsOf(messages), [
    ["action:build-1#1", "permission", "done", null, "You allowed it."],
    ["action:build-1#3", "person_check", "waiting", null, undefined]
  ]);
});

test("a question's card and words never show a dotted id", () => {
  const events = [waitFor(1, CHECK, "person-needed.1"), intervention(2), settle(3, CHECK, "person-needed.1", "answered", "succeeded", "You pressed Continue.")];
  for (const message of stepMessages(events, 100)) {
    for (const value of [message.title, message.text, ...message.actions.flatMap((card) => [card.target, card.said, card.answer, card.why])]) {
      if (typeof value === "string") assert.doesNotMatch(value, /\b[a-z][\w-]*\.[a-z][\w-]*/u, value);
    }
  }
});

// Live runs 34 and 35: Core's look before the first decision is a `note` row
// as it starts and as it ends, with no words, and the chat showed it as two
// bare "Looking at the page" headings. The live line says it while it runs.
test("a note with no words is not a message: Core's own look before the first decision, and the dry run's reset", () => {
  const events = [
    activityEvent(1, { phase: "exploring", label: "Looking at the page", detail: { kind: "note", title: "Looking at the page", status: "started", ref: "core.run_node" } }),
    activityEvent(2, { phase: "exploring", label: "Looking at the page — didn't work", detail: { kind: "note", title: "Looking at the page", status: "failed", ref: "core.run_node", text: "Result: web.action.rejected.not_at_start_location · Node: web.output.dom-capture_snapshot" } }),
    thought(3, "Opening the store", "The build has to start on the store's home page."),
    tool(4, "Opening the store", "succeeded"),
    activityEvent(5, { phase: "verifying", label: "Trying the Flow from the start", detail: { kind: "note", title: "Putting the page back to where the Flow starts", status: "started", ref: "core.run_node" } }),
    activityEvent(6, { phase: "exploring", label: "Exploring again", detail: { kind: "note", title: "Exploring again", text: "Nothing is in the Flow yet. Exploring on from the page as it stands." } })
  ];
  assert.deepEqual(said(stepMessages(events, 100)), [
    ["Opening the store", "The build has to start on the store's home page.", "done"],
    ["Exploring again", "Nothing is in the Flow yet. Exploring on from the page as it stands.", null]
  ]);
});

// Every step says what it does, and a press a popup covered says so (t193 round 11, from
// crossborder run-muqc07fh-eeffbc86): the chat said "Working on the page" and "Typing into the
// page" for every step, and "it was hidden on the page" of a search typed under a coupon popup.
test("a step's message names what it does, its card names the control, and a covered press is said as covered", () => {
  const TYPED = 'Typing "Voltbay USB-C hub" into “Search”';
  const CLOSE = "Clicking “×”";
  const FOUND = 'Looking for "Voltbay" on the page';
  const events = [
    decide(1),
    thought(2, TYPED, "I'll search the store for the hub."),
    tool(3, TYPED, "started"),
    tool(4, TYPED, "failed", { text: "Result: web.action.rejected.target_covered · Node: web.output.dom-type" }),
    decide(5),
    thought(6, CLOSE, "Close the coupon popup, then search again."),
    tool(7, CLOSE, "succeeded", { text: "Result: web.action.succeeded · Node: web.output.dom-click" }),
    decide(8),
    thought(9, FOUND, "Check whether the home page names the store."),
    activityEvent(10, { phase: "exploring", detail: { kind: "tool", title: FOUND, ref: "web.find_on_page", status: "succeeded", text: "Result: web.inspect.succeeded" } })
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => message.title), [TYPED, CLOSE, FOUND]);
  assert.deepEqual(messages.map((message) => message.actions.map((card) => [card.kind, card.target, card.outcome, card.why])), [
    [["type", "Search", "failed", "a popup or banner on the page was covering it"]],
    [["click", "×", "done", null]],
    [["look", '"Voltbay"', "done", null]]
  ]);
});

// t193 (run-muqiojz4-04a7a8fc): the row that ended a press of "No thanks" was said after the popup
// had gone, named nothing, and turned the card into "Click · the page".
test("a card's end keeps the control its start named", () => {
  const CLOSE = "Clicking “No thanks”";
  const events = [
    decide(1),
    thought(2, CLOSE, "Close the sign-up popup."),
    tool(3, CLOSE, "started"),
    tool(4, "Clicking on the page", "succeeded", { text: "Result: web.action.succeeded · Node: web.output.dom-click" })
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => message.actions.map((card) => [card.kind, card.target, card.outcome])), [[["click", "No thanks", "done"]]]);
});

// t193: an action with no decision before it was titled from its result code -- "Looked at the
// page", "Worked on the page" -- whatever Core had said it did.
test("an action's message keeps Core's own words for what it did", () => {
  const LOOK = "Reading the details of “Colour”";
  const messages = stepMessages([
    activityEvent(1, { phase: "exploring", detail: { kind: "tool", title: LOOK, ref: "web.describe_element", status: "started" } }),
    activityEvent(2, { phase: "exploring", detail: { kind: "tool", title: LOOK, ref: "web.describe_element", status: "succeeded", text: "Result: web.inspect.succeeded" } }),
    tool(3, "Opening where the Flow starts", "succeeded", { text: "Result: web.action.succeeded · Node: web.output.browser-navigate" })
  ], 100);
  assert.deepEqual(messages.map((message) => [message.title, message.actions.map((card) => [card.kind, card.target])]), [
    [LOOK, [["look", 'the "Colour" label']]],
    ["Opening where the Flow starts", [["navigate", null]]]
  ]);
  assert.equal(stepMessages([tool(1, "Using core.run_node", "succeeded", { text: "Result: web.inspect.succeeded" })], 100)[0]!.title, "Looked at the page", "an older Core's id still reads as what it did");
});


// t174-w85 D1 (run-murwd8le-79e735a8, 00019): the result check's start ("Result check
// started") stayed an orphan grey "Check result" card above the verdict, and the verdict
// of a result Core could not confirm read "Didn't pass" in red.
test("a run's result check is one card that settles, and an unconfirmed verdict reads as not confirmed", () => {
  const run = { activityId: "run-1", subject: { kind: "run" as const, id: "run-1", projectId: "project-1" } };
  const events = [
    activityEvent(1, { ...run, phase: "verifying", label: "Checking the result answers the request", detail: { kind: "check", title: "Result check started", status: "started" } }),
    activityEvent(2, { ...run, phase: "verifying", label: ACTIVITY_RESULT_CHECK_LABELS.unconfirmed, detail: { kind: "check", title: "Result check", status: "failed", text: "The result could not be confirmed." } })
  ];
  const cards = stepMessages(events, 100).flatMap((message) => message.actions);
  assert.equal(cards.length, 1, "the start and the verdict are one card");
  const words = cardWords(cards[0]!, false);
  assert.deepEqual([words.name, words.state, words.outcome], ["Check result", "unconfirmed", "Not confirmed: the result could not be confirmed."]);
});

// t277 (R2-U-1 of the run-muwansvz-a2b4a987 UI review): "e.g." in Core's sentence read as a
// dotted id ("e.g"), so the whole sentence was dropped and the card said a bare verdict.
test("a check's sentence holding an abbreviation such as e.g. is still shown; a dotted id is not", () => {
  const run = { activityId: "run-1", subject: { kind: "run" as const, id: "run-1", projectId: "project-1" } };
  const verdict = (text: string) => [
    activityEvent(1, { ...run, phase: "verifying", label: "Checking the result answers the request", detail: { kind: "check", title: "Result check started", status: "started" } }),
    activityEvent(2, { ...run, phase: "verifying", label: ACTIVITY_RESULT_CHECK_LABELS.unconfirmed, detail: { kind: "check", title: "Result check", status: "failed", text } })
  ];
  const outcome = (text: string) => cardWords(stepMessages(verdict(text), 100).flatMap((message) => message.actions)[0]!, false).outcome;
  assert.equal(outcome("Some rows may be ads (e.g. the first one), so it is not confirmed."), "Not confirmed: some rows may be ads (e.g. the first one), so it is not confirmed.");
  assert.equal(outcome("It ran web.output.dom-extract once."), "Not confirmed");
});

// t174-w85 D4 (00014): a test step read "Test run · Autumn Mega Sale: up to 70…".
test("a build's test step reads as testing its action, with what it typed", () => {
  const events = [
    activityEvent(1, { phase: "verifying", detail: { kind: "tool", title: 'Typing "Voltbay USB-C hub" into “Autumn Mega Sale: up to 70% off”', ref: "core.run_node", status: "started", text: "Node: web.output.dom-type" } }),
    activityEvent(2, { phase: "verifying", detail: { kind: "tool", title: 'Typing "Voltbay USB-C hub" into “Autumn Mega Sale: up to 70% off”', ref: "core.run_node", status: "succeeded", text: "Result: core.replay.replayed · Node: web.output.dom-type" } })
  ];
  const cards = stepMessages(events, 100).flatMap((message) => message.actions);
  assert.equal(cards.length, 1);
  const words = cardWords(cards[0]!, false);
  // What it typed; the field, too long to fit beside it, is in the card's label (t193 1003 D8).
  assert.deepEqual([words.name, words.target, words.outcome], ["Testing: Type", '"Voltbay USB-C hub"', "Done"]);
  assert.match(words.label, /into Autumn Mega Sale: up to 70% off: Done$/u);
});

// t174-w90 D8 (run-murwd8le-79e735a8, 00018): the playback card "Click · Get coupons" read
// "Didn't work" with no reason, though the press was refused as the page being busy. Core's row
// that opens the recovery settles the step it recovers, with the failure's code
// (`activity/step-recovering.ts`); the rows below are the sequence Core emits for that run
// (`executor/tests/failed-step-reason.test.ts` in Core).
const playback = (sequence: number, fields: Partial<ClientGatewayActivity>) => activityEvent(sequence, { activityId: "run:r1", subject: { kind: "run", id: "r1", projectId: "p" }, ...fields });
const playStep = (sequence: number, index: number, node: string, label: string, definition = "builtin.policy.action") => playback(sequence, {
  phase: "running",
  label: `Running step ${index} of 3: ${label}`,
  step: { index, count: 3, nodeId: node, label },
  detail: { kind: "step", title: label, status: "started", ref: node, text: `Node: ${definition}` }
});
const recovering = (sequence: number, node: string, label: string, code: string | undefined) => playback(sequence, {
  phase: "repairing",
  label: `Recovering from a failed step: ${label}`,
  detail: { kind: "step", title: label, status: "failed", ref: node, text: [code ? `Result: ${code}` : "", "Node: builtin.policy.action"].filter(Boolean).join(" · ") }
});
const recoveryThought = (sequence: number, node: string) => playback(sequence, {
  phase: "repairing",
  label: "Trying the step again",
  detail: { kind: "thought", title: "Trying the step again", text: "The page said it was busy, so I'm trying the press again.", status: "succeeded", ref: node }
});

// The site's slow-down is "the site asked FluxIQ to slow down" in Core's shared reading (lane D
// finding 1); a Core built before t378 said "the page was busy".
const SLOWED = /the site asked FluxIQ to slow down|the page was busy/u;

test("a playback step that failed says why, from the code on the row that settles it, and that row is no message of its own", () => {
  const events = [
    playStep(1, 1, "n1.open", "Open the item"),
    playStep(2, 2, "n3.coupon", "Get coupons"),
    recovering(3, "n3.coupon", "Get coupons", "web.action.rate_limited"),
    recoveryThought(4, "n3.coupon")
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => message.title), ["Step 1: Open the item", "Step 2: Get coupons", "Trying the step again"]);
  const failed = messages[1]!.actions[0]!;
  assert.equal(failed.outcome, "failed");
  assert.match(failed.why ?? "", SLOWED);
  assert.match(cardWords(failed, false).outcome ?? "", SLOWED);
});

// Lane D (run-mv0fuual-f9e6f089, finding 2): a refused press and its retry read as a red card and a
// green one, with nothing saying they were the same press.
test("a playback step that worked when tried again is one card that says on which try, and why the first didn't work", () => {
  const events = [
    playStep(1, 1, "n1.open", "Open the item"),
    playStep(2, 2, "n3.coupon", "Get coupons"),
    recovering(3, "n3.coupon", "Get coupons", "web.action.rate_limited"),
    recoveryThought(4, "n3.coupon"),
    playStep(5, 2, "n3.coupon", "Get coupons"),
    playStep(6, 3, "n4.cart", "Add to cart")
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => message.title), ["Step 1: Open the item", "Trying the step again", "Step 2: Get coupons", "Step 3: Add to cart"]);
  const retried = messages[2]!.actions;
  assert.equal(retried.length, 1);
  assert.equal(retried[0]!.outcome, "done");
  assert.equal(retried[0]!.retried?.tries, 2);
  assert.match(retried[0]!.retried?.why ?? "", SLOWED);
  const outcome = cardWords(retried[0]!, false).outcome ?? "";
  assert.match(outcome, /^Done on the 2nd try\. The first try didn't work: /u);
  assert.equal(messages.flatMap((message) => message.actions).filter((card) => card.outcome === "failed").length, 0, "no red card is left for the press that worked");
});

test("a retry that failed again stays failed, and a different step after a failure takes nothing in", () => {
  const again = stepMessages([
    playStep(1, 2, "n3.coupon", "Get coupons"),
    recovering(2, "n3.coupon", "Get coupons", "web.action.rate_limited"),
    recoveryThought(3, "n3.coupon"),
    playStep(4, 2, "n3.coupon", "Get coupons"),
    recovering(5, "n3.coupon", "Get coupons", "web.action.rate_limited")
  ], 100);
  assert.deepEqual(again.flatMap((message) => message.actions).map((card) => [card.outcome, card.retried]), [["failed", undefined], ["failed", undefined]], "neither try worked");
  const other = stepMessages([
    playStep(1, 2, "n3.coupon", "Get coupons"),
    recovering(2, "n3.coupon", "Get coupons", "web.action.rate_limited"),
    recoveryThought(3, "n3.coupon"),
    playStep(4, 3, "n4.cart", "Add to cart"),
    playStep(5, 4, "n5.pay", "Pay")
  ], 100);
  assert.deepEqual(other.flatMap((message) => message.actions).map((card) => [card.target, card.outcome]), [["Get coupons", "failed"], ["Add to cart", "done"], ["Pay", "working"]]);
});

test("a failed playback step whose settling row names no code still reads as failed, with no reason", () => {
  const messages = stepMessages([playStep(1, 1, "n3.coupon", "Get coupons"), recovering(2, "n3.coupon", "Get coupons", undefined)], 100);
  assert.deepEqual(messages.map((message) => message.title), ["Step 1: Get coupons"]);
  assert.deepEqual(messages[0]!.actions.map((card) => [card.outcome, card.why]), [["failed", null]]);
});

test("a playback through a Merge shows no Join paths card, even from a Core that still announced the merge", () => {
  const announced = [
    playStep(1, 1, "n1.open", "Open the item"),
    playback(2, { phase: "running", label: "Running step 2 of 4", step: { index: 2, count: 4, nodeId: "n2.join" }, detail: { kind: "step", title: "Step 2 of 4", status: "started", ref: "n2.join", text: "Node: builtin.control.merge" } }),
    playStep(3, 3, "n3.coupon", "Get coupons")
  ];
  const messages = stepMessages(announced, 100);
  assert.deepEqual(messages.map((message) => message.title), ["Step 1: Open the item", "Step 3: Get coupons"]);
  assert.equal(messages.flatMap((message) => message.actions).some((card) => card.kind === "join"), false);
  assert.deepEqual(messages[0]!.actions.map((card) => card.outcome), ["done"], "the step before the merge still ends as done");
});

// U3 of t194 (`run-musp39u8-9ac026ab`, 35-failure-panel.png): the run ended
// on a bare "Run failed" after its result was refuted and a repair could not
// finish. Core's last row now says what came back and why
// (`runtime/activity/run.ts`), and the chat shows it under "Run failed".
test("a failed run's last message says what came back and why it failed", () => {
  const sentence = "It returned 13 rows, but the check found they don't answer what you asked, and the fix ran out of room before it finished.";
  const run = { activityId: "run:r1", subject: { kind: "run" as const, id: "r1", projectId: "project-1" } };
  const messages = stepMessages([
    activityEvent(1, { ...run, phase: "running", label: "Running step 5 of 5: Reading the list", step: { index: 5, count: 5, nodeId: "n5" }, detail: { kind: "step", title: "Reading the list", status: "started", ref: "n5" } }),
    activityEvent(2, { ...run, phase: "failed", label: `Run failed: ${sentence}`, final: true, detail: { kind: "step", title: "Run failed", status: "failed", text: sentence } })
  ], 10);
  assert.deepEqual(said(messages).at(-1), ["Run failed", sentence, null]);
});

// U-8 of the run-muw60j7c-bb7c9a62 UI review: three "Edit the Flow · run the step again / Not done: that
// step was already tried exactly this way ..." cards in a row, each reading as one more piece of work.
test("identical refusals in a row are one card that counts them; words between them, or another reason, keep them apart", () => {
  const refusal = (sequence: number, reason = "changed_nothing", status: Detail["status"] = "failed") => activityEvent(sequence, {
    phase: "building",
    label: "Running the step again — not done",
    detail: { kind: "tool", title: "Running the step again", status, ref: "core.flow_draft", ...(status === "started" ? {} : { text: `Result: llm_evidence_loop.repeat_refused · Reason: ${reason}` }) }
  });
  const cards = (messages: StepMessage[]) => messages.flatMap((message) => message.actions.map((card) => [card.key, cardWords(card, false).outcome]));
  const because = "Not done (3 times): it was already tried exactly this way and changed nothing";

  // Three on their own, the second started before it ended: one card, the first's, counting three.
  const alone = stepMessages([refusal(1), refusal(2, "changed_nothing", "started"), refusal(3), refusal(4)], 100);
  assert.deepEqual(cards(alone), [["action:build-1#1", because]]);
  assert.equal(alone.length, 1, "the messages that were only a folded card are gone");
  assert.equal(alone[0]!.latest, true);

  // Three under one decision: one card under it.
  const under = stepMessages([thought(1, "Running the step again", "The read stopped early, so I run it again."), refusal(2), refusal(3), refusal(4)], 100);
  assert.deepEqual(said(under).map(([title, text]) => [title, text]), [["Running the step again", "The read stopped early, so I run it again."]]);
  assert.deepEqual(cards(under), [["action:build-1#2", because]]);

  // A reason in words between two refusals, or a different reason, keeps them apart; so does another unit of work.
  const between = stepMessages([refusal(1), thought(2, "Running the step again", "Trying once more."), refusal(3)], 100);
  assert.deepEqual(cards(between).map(([, outcome]) => outcome), ["Not done: it was already tried exactly this way and changed nothing", "Not done: it was already tried exactly this way and changed nothing"]);
  const other = stepMessages([refusal(1), refusal(2, "failed")], 100);
  assert.equal(cards(other).length, 2);
  const units = stepMessages([refusal(1), { ...refusal(2), activityId: "build-2", subject: { kind: "build", id: "build-2", projectId: "project-1" } }], 100);
  assert.equal(cards(units).length, 2);
  // A card that did work is never folded into a refusal.
  const worked = stepMessages([refusal(1), activityEvent(2, { phase: "building", detail: { kind: "tool", title: "Running the step again", status: "succeeded", ref: "core.flow_draft" } })], 100);
  assert.equal(cards(worked).length, 2);
});

// t276 (U-1 of the run-muw60j7c-bb7c9a62 UI review): every read card read a bare
// "Done", and the chat's "Reading all search result pages" could not be checked
// against a count. Core's `result` reaches the card through `actionCard`.
test("a list read's card says how many rows it kept, and an edit's card what it changed", () => {
  const READ = "Reading the list of “name, price”";
  const messages = stepMessages([
    tool(1, READ, "started"),
    tool(2, READ, "succeeded", { text: "Result: web.read.succeeded · Rows: 4 · Node: web.output.dom-extract-list" }),
    activityEvent(3, { phase: "building", detail: { kind: "tool", title: "Editing the Flow", ref: "core.flow_draft", status: "succeeded", text: "Changed: removed \"Add to cart\"" } })
  ], 100);
  const cards = messages.flatMap((message) => message.actions);
  assert.deepEqual(cards.map((card) => cardWords(card, false).outcome), ["Done: 4 rows", "Done: removed \"Add to cart\""]);
});

// R2-U-7 (run-muwansvz-a2b4a987, moment 07; steps 0033-0046): each refused
// rerun of the list read added an "Edit the Flow · run the step again / Not
// done" card and the rerun itself a "Read list / Didn't work" card, so the
// chat alternated the two, one pair per attempt. A cycle of identical cards
// with nothing new between them is one card each, counting its repeats.
test("a repeating cycle of identical cards with nothing new between them is one card each, counting them", () => {
  const LIST = "Trying again: reading the list of “name, price, rating and 3 more”";
  const read = (sequence: number, status: "started" | "succeeded") => activityEvent(sequence, {
    phase: "repairing",
    label: status === "started" ? LIST : `${LIST} — didn't work`,
    detail: { kind: "tool", title: LIST, status, ref: "core.run_node", ...(status === "started" ? {} : { text: "Result: web.action.rejected.target_unobserved · Reason: malformed_handle · Node: web.output.dom-extract_list" }) }
  });
  const rerun = (sequence: number) => activityEvent(sequence, {
    phase: "building",
    label: "Running the step again — not done",
    detail: { kind: "tool", title: "Running the step again", status: "failed", ref: "core.flow_draft", text: "Result: llm_evidence_loop.repeat_refused · Reason: changed_nothing" }
  });
  const outcomes = (messages: StepMessage[]) => messages.flatMap((message) => message.actions.map((card) => cardWords(card, false).outcome));
  // read, refused, read, refused, refused, read, refused -- a decision being made (no words) before each.
  let sequence = 0;
  const next = () => (sequence += 1);
  const attempt = () => [decide(next()), read(next(), "started"), read(next(), "succeeded")];
  const refused = () => [decide(next()), rerun(next())];
  const events = [...attempt(), ...refused(), ...attempt(), ...refused(), ...refused(), ...attempt(), ...refused()];
  const messages = stepMessages(events, 100);
  const shown = outcomes(messages);
  assert.equal(shown.length, 2, `one card each: ${JSON.stringify(shown)}`);
  assert.match(shown[0]!, /^Didn't work \(3 times\): /u);
  assert.equal(shown[1], "Not done (4 times): it was already tried exactly this way and changed nothing");
  assert.equal(messages.at(-1)!.latest, true);

  // Something new after a cycle -- a card that did work, or words of FluxIQ's -- starts counting afresh after it.
  const worked = activityEvent(next(), { phase: "building", detail: { kind: "tool", title: "Editing the Flow", status: "succeeded", ref: "core.flow_draft", text: "Changed: removed \"Add to cart\"" } });
  const after = outcomes(stepMessages([...events, worked, ...attempt(), ...refused()], 100));
  assert.deepEqual(after.slice(2).map((outcome) => outcome?.replace(/:.*$/su, "")), ["Done", "Didn't work", "Not done"]);
  const spoken = outcomes(stepMessages([...events, thought(next(), "Reading the list", "The handle was wrong, so I name the list again."), ...attempt()], 100));
  assert.equal(spoken.length, 3);
  // A new card after a cycle repeated starts a new one, so the order stays true: A B A C A is A(2) B C A.
  const other = (at: number) => activityEvent(at, { phase: "repairing", detail: { kind: "tool", title: "Clicking “Next”", status: "succeeded", ref: "core.run_node", text: "Result: web.action.rejected.target_covered · Node: web.output.dom-click" } });
  const mixed = outcomes(stepMessages([...attempt(), ...refused(), ...attempt(), other(next()), ...attempt()], 100));
  assert.equal(mixed.length, 4, JSON.stringify(mixed));
  assert.match(mixed[0]!, /^Didn't work \(2 times\): /u);
  assert.match(mixed[3]!, /^Didn't work: /u);
});

// R3-U-5 of live-C-r3-ui-review (run-mux6naez-6c20f26e, moments 11-12 and 18-19): five or more
// identical "Read list · name, price and 4 more / Done" cards stacked, one per rerun, and the
// person could not tell whether anything changed. Identical successful cards in a row are one
// card that counts them; a different result, or a failure between them, keeps them apart, and a
// success never folds into a card before the one just shown, so the order still reads true.
test("identical successful cards in a row are one card that counts them; another result or a failure between keeps them apart", () => {
  const LIST = "Reading the list of “name, price and 4 more”";
  const read = (sequence: number, status: "started" | "succeeded" | "failed", rows?: number) => tool(sequence, LIST, status,
    status === "started" ? {} : status === "failed" ? { text: "Result: web.action.rejected.target_unobserved · Reason: malformed_handle · Node: web.output.dom-extract-list" } : { text: `Result: web.read.succeeded${rows === undefined ? "" : ` · Rows: ${rows}`} · Node: web.output.dom-extract-list` });
  let sequence = 0;
  const next = () => (sequence += 1);
  const attempt = (status: "succeeded" | "failed" = "succeeded", rows?: number) => [decide(next()), read(next(), "started"), read(next(), status, rows)];
  const outcomes = (messages: StepMessage[]) => messages.flatMap((message) => message.actions.map((card) => cardWords(card, false).outcome));

  const five = stepMessages([...attempt(), ...attempt(), ...attempt(), ...attempt(), ...attempt()], 100);
  assert.deepEqual(outcomes(five), ["Done (5 times)"]);
  assert.equal(five.at(-1)!.latest, true);
  assert.deepEqual(outcomes(stepMessages([...attempt("succeeded", 10), ...attempt("succeeded", 10)], 100)), ["Done (2 times): each time, 10 rows"], "a folded card says its result is each read's, not their total");
  // Another count is another result: both are shown.
  assert.deepEqual(outcomes(stepMessages([...attempt("succeeded", 10), ...attempt("succeeded", 13)], 100)), ["Done: 10 rows", "Done: 13 rows"]);
  // Done, failed, done reads in that order; it is not "Done (2 times)" then a failure.
  const between = outcomes(stepMessages([...attempt(), ...attempt("failed"), ...attempt()], 100));
  assert.deepEqual(between.map((outcome) => outcome?.replace(/:.*$/su, "")), ["Done", "Didn't work", "Done"]);
  // A card still under way is never folded.
  const working = stepMessages([...attempt(), decide(next()), read(next(), "started")], 100);
  assert.deepEqual(working.flatMap((message) => message.actions.map((card) => card.outcome)), ["done", "working"]);
});
