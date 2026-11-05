// Every action FluxIQ takes shows in the chat as a card: the icon Core pins
// for its kind in a mark tinted by how it went, the kind's name and what it
// acted on, and the outcome in words, under a label that says all three.
// A card keeps its element from start to end, and no card, label or word in
// the chat ever shows a dotted id.

import assert from "node:assert/strict";
import { test } from "vitest";
import { ACTIVITY_ACTION_ICONS, ACTIVITY_ACTION_NAMES, type ActivityActionKind } from "fluxiq/ui";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { buildChatStream } from "../../stream/index.ts";
import { activityEvent } from "../../tests/activity-fixture.ts";
import { fake, withFakeDocument, type FakeElement } from "../../../testing/index.ts";
import { createThreadView, type TurnControls } from "../thread-view.ts";

type Detail = NonNullable<ClientGatewayActivity["detail"]>;

const controls = (): TurnControls => ({
  ask: { answering: false, error: undefined, answer: () => undefined, openFluxIQ: () => document.createElement("span") },
  state: ""
});
const event = (sequence: number, phase: ClientGatewayActivity["phase"], detail: Detail, fields: Partial<ClientGatewayActivity> = {}) =>
  activityEvent(sequence, { phase, detail, ...fields });
const record = (code: string, node: string) => `Result: ${code} · Node: ${node}`;

/** One event of each kind, shaped the way Core's emitters send it. */
const ONE_OF_EACH: ReadonlyArray<[ActivityActionKind, (sequence: number) => ClientGatewayActivity]> = [
  ["click", (n) => event(n, "exploring", { kind: "tool", title: "Clicking “Get a free quote”", ref: "core.run_node", status: "succeeded", text: record("web.click.succeeded", "web.output.dom-click") })],
  ["type", (n) => event(n, "building", { kind: "tool", title: "Typing the postcode", ref: "core.run_node", status: "failed", text: "The field was covered by a banner." })],
  ["navigate", (n) => event(n, "exploring", { kind: "tool", title: "Opening the results", ref: "web.navigate", status: "succeeded" })],
  ["read", (n) => event(n, "exploring", { kind: "tool", title: "Reading “Listings”", ref: "core.run_node", status: "succeeded", text: record("web.extract_list.succeeded", "web.output.extract-list") })],
  ["look", (n) => event(n, "exploring", { kind: "tool", title: "Using web.inspect_current_page", ref: "web.inspect_current_page", status: "succeeded" })],
  ["wait", (n) => event(n, "exploring", { kind: "tool", title: "Waiting for the results", ref: "core.run_node", status: "succeeded", text: record("web.wait.succeeded", "web.output.wait-for") })],
  ["person_check", (n) => event(n, "waiting_permission", { kind: "ask", title: "Asked the person to complete a check", text: "Complete the check on this page, then press Continue." })],
  ["permission", (n) => event(n, "waiting_permission", { kind: "ask", title: "Asked for permission to send the message" })],
  ["draft", (n) => event(n, "building", { kind: "tool", title: "Amending the draft flow", ref: "core.flow_draft", status: "succeeded" })],
  ["test", (n) => event(n, "verifying", { kind: "tool", title: "Using core.dry_run", ref: "core.dry_run", status: "failed", text: "Result: core.replay.diverged" })],
  ["result_check", (n) => event(n, "verifying", { kind: "check", title: "Result check", status: "succeeded", text: "The result was judged to answer the request." })],
  ["repair", (n) => event(n, "repairing", { kind: "tool", title: "Clicking “Accept cookies”", ref: "core.run_node", status: "succeeded" })],
  ["other", (n) => event(n, "exploring", { kind: "tool", title: "Using core.something_else", ref: "core.something_else", status: "succeeded" })]
];

/** An id such as `web.output.dom-click` or `core.run_node`. */
const DOTTED_ID = /\b[a-z][\w-]*\.[a-z][\w-]*/u;

function cards(root: FakeElement): FakeElement[] {
  return root.byClass("chat-card");
}

function text(card: FakeElement, name: string): string | undefined {
  const part = card.byClass(name)[0];
  return part === undefined || part.hidden ? undefined : part.textContent;
}

test("a card for each kind: Core's icon in an aria-hidden mark, Core's name, the target, the outcome, and a label saying all three", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const events = ONE_OF_EACH.map(([, make], index) => make(index + 1));
    view.render(buildChatStream([], events), controls, "build-1");
    const shown = cards(fake(view.element));
    assert.deepEqual(shown.map((card) => card.getAttribute("data-kind")), ONE_OF_EACH.map(([kind]) => kind).filter((kind) => kind !== "person_check" && kind !== "permission"), "a robot check or a permission draws no card: the question in the thread is the one telling");
    for (const card of shown) {
      const kind = card.getAttribute("data-kind") as ActivityActionKind;
      const mark = card.byClass("chat-card-mark")[0]!;
      assert.equal(mark.getAttribute("aria-hidden"), "true", kind);
      assert.equal(mark.children[0]!.getAttribute("data-icon"), ACTIVITY_ACTION_ICONS[kind], kind);
      assert.equal(text(card, "chat-card-name"), ACTIVITY_ACTION_NAMES[kind], kind);
      assert.equal(card.getAttribute("role"), "group", kind);
    }
    const byKind = new Map(shown.map((card) => [card.getAttribute("data-kind"), card]));
    const read = (kind: ActivityActionKind) => {
      const card = byKind.get(kind)!;
      return [text(card, "chat-card-target"), text(card, "chat-card-outcome"), card.getAttribute("data-state"), card.getAttribute("aria-label")];
    };
    assert.deepEqual(read("click"), ["Get a free quote", "Done", "done", "Click, Get a free quote: Done"]);
    assert.deepEqual(read("type"), [undefined, "Didn't work: the field was covered by a banner.", "failed", "Type: Didn't work: the field was covered by a banner."]);
    assert.deepEqual(read("read"), ["Listings", "Done", "done", "Read list, Listings: Done"]);
    assert.deepEqual(read("navigate"), [undefined, "Done", "done", "Open page: Done"]);
    // A replay code Core has no particular reason for (`ui/activity-action/failure-reason.ts`, t174-w116, D21).
    assert.deepEqual(read("test"), [undefined, "Didn't work: it didn't do the same when the test tried it again", "failed", "Test run: Didn't work: it didn't do the same when the test tried it again"]);
    // t193 (run-muqiojz4-04a7a8fc, 00019): a real run's result check read "Test run · Working on it".
    assert.deepEqual(read("result_check"), [undefined, "Passed: the result was judged to answer the request.", "done", "Check result: Passed: the result was judged to answer the request."]);
    assert.deepEqual(read("repair"), ["Accept cookies", "Done", "done", "Repair, Accept cookies: Done"]);
    assert.deepEqual(read("other"), [undefined, "Done", "done", "Action: Done"]);
    for (const message of fake(view.element).byClass("chat-step-msg")) {
      assert.equal(message.byClass("chat-step-line")[0]!.hidden, true, "a message that is an action is only its card");
    }
  });
});

test("a robot check that is the action of the moment draws no card of its own", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const [, robot] = ONE_OF_EACH.find(([kind]) => kind === "person_check")!;
    view.render(buildChatStream([], [robot(1)]), controls, "build-1");
    assert.equal(cards(fake(view.element)).length, 0);
  });
});

test("a card is the same element, icon included, from started to done or failed; later cards come after it", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const quote = "Clicking “Get a free quote”";
    const events: ClientGatewayActivity[] = [
      event(1, "exploring", { kind: "thought", title: quote, text: "The quote form is behind this button.", status: "succeeded" }),
      event(2, "exploring", { kind: "tool", title: quote, ref: "core.run_node", status: "started" })
    ];
    view.render(buildChatStream([], events), controls, "build-1");
    const root = fake(view.element);
    const message = root.byClass("chat-step-msg")[0]!;
    const card = cards(root)[0]!;
    const nodes = [card, ...card.descendants()];
    assert.equal(message.byClass("chat-step-line")[0]!.hidden, false, "the reasoning shows beside its card");
    assert.deepEqual([card.getAttribute("data-state"), text(card, "chat-card-outcome")], ["working", "Working on it"]);

    events.push(event(3, "exploring", { kind: "tool", title: quote, ref: "core.run_node", status: "failed", text: record("web.target.not_found", "web.output.dom-click") }));
    view.render(buildChatStream([], events), controls, "build-1");
    assert.equal(cards(root)[0], card);
    assert.deepEqual([card, ...card.descendants()], nodes, "updated in place, nothing remounted");
    assert.deepEqual([card.getAttribute("data-state"), text(card, "chat-card-outcome")], ["failed", "Didn't work: FluxIQ couldn't find it where it was saved"]);

    events.push(event(4, "exploring", { kind: "tool", title: "Clicking “Accept cookies”", ref: "core.run_node", status: "started" }));
    view.render(buildChatStream([], events), controls, "build-1");
    const [first, second] = cards(root);
    assert.equal(first, card, "the first card stays first");
    assert.deepEqual([second!.getAttribute("data-state"), text(second!, "chat-card-outcome")], ["working", "Working on it"]);
    assert.equal(root.byClass("chat-step-msg").length, 1, "both are the decision's cards");

    events.push(event(5, "exploring", { kind: "tool", title: "Clicking “Accept cookies”", ref: "core.run_node", status: "succeeded" }));
    view.render(buildChatStream([], events), controls, null);
    assert.deepEqual(cards(root), [first, second]);
    assert.equal(text(second!, "chat-card-outcome"), "Done");
  });
});

test("no card, label or word in the chat shows a dotted id", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const events = [
      ...ONE_OF_EACH.map(([, make], index) => make(index + 1)),
      event(20, "exploring", { kind: "tool", title: "Using core.run_node", ref: "core.run_node", status: "failed", text: record("web.target.not_found", "web.output.dom-click") }),
      event(21, "verifying", { kind: "check", title: "Completion check", status: "failed", text: "Result: core.completion_check.failed" })
    ];
    view.render(buildChatStream([], events), controls, "build-1");
    const root = fake(view.element);
    for (const element of root.descendants()) {
      const label = element.getAttribute("aria-label");
      if (label !== null) assert.doesNotMatch(label, DOTTED_ID, label);
    }
    // Each piece of text on its own: neighbouring pieces run together in `textContent`.
    const leaves = root.descendants().filter((element) => element.children.length === 0 && element.textContent !== "");
    assert.ok(leaves.length > 40, `${leaves.length} pieces of text`);
    for (const leaf of leaves) assert.doesNotMatch(leaf.textContent, DOTTED_ID, leaf.textContent);
  });
});

test("a robot check never draws a card, waiting or settled: the row that settles it adds none either", async () => {
  const CHECK = "Asked the person to complete a check";
  const settle = (sequence: number, resolution: string, status: Detail["status"], said: string) =>
    event(sequence, "building", { kind: "ask", title: CHECK, ref: "person-needed.1", status, text: said, resolution } as Detail);
  for (const [resolution, status, said, state, outcome] of [
    ["answered", "succeeded", "You pressed Continue.", "done", "Done. You pressed Continue."],
    ["declined", "failed", "You pressed Stop.", "failed", "Didn't work: you pressed Stop"]
  ] as const) {
    await withFakeDocument(() => {
      const view = createThreadView();
      const events: ClientGatewayActivity[] = [
        event(1, "waiting_permission", { kind: "ask", title: CHECK, ref: "person-needed.1", status: "started", text: "FluxIQ needs you: complete the check on this page, then press Continue." }),
        event(2, "waiting_permission", { kind: "note", title: "Still waiting", text: "The page is still showing the check." })
      ];
      view.render(buildChatStream([], events), controls, "build-1");
      const root = fake(view.element);
      assert.equal(cards(root).length, 0, "no card while it waits");

      events.push(settle(3, resolution, status, said), event(4, "building", { kind: "tool", title: "Clicking “Get a free quote”", ref: "core.run_node", status: "started" }));
      view.render(buildChatStream([], events), controls, "build-1");
      assert.deepEqual(cards(root).map((card) => card.getAttribute("data-kind")), ["click"], `${resolution}: only the work that followed is a card; the settled check (${state}, ${outcome}) is the question's to tell`);
    });
  }
});

test("a wait Core has not settled draws no card even once its work is over", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const [, robot] = ONE_OF_EACH.find(([kind]) => kind === "person_check")!;
    view.render(buildChatStream([], [robot(1)]), controls, null);
    assert.equal(cards(fake(view.element)).length, 0);
  });
});

// t193 (run-muqiojz4-04a7a8fc): the navigate card read "Open page" with no page
// named (00019, 00020), and a press refused for naming no control from the page
// read "Didn't work: it wasn't on the page" (00020, S/0090).
test("a navigate card names its page, and a refusal says its own reason", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const events = [
      event(1, "running", { kind: "step", title: "Opening “/ip/valueridge-napkins”", ref: "n11", status: "succeeded", text: "Node: web.output.browser-navigate" }, { step: { index: 11, count: 14, nodeId: "n11" } }),
      event(2, "repairing", { kind: "tool", title: "Clicking “Add to cart”", ref: "core.run_node", status: "succeeded", text: "Result: web.action.rejected.target_unobserved · Reason: target_not_a_handle · Node: web.output.dom-click" })
    ];
    view.render(buildChatStream([], events), controls, "run-1");
    const labels = cards(fake(view.element)).map((card) => card.getAttribute("aria-label"));
    assert.deepEqual(labels, ["Open page, /ip/valueridge-napkins: Done", "Repair, Add to cart: Didn't work: FluxIQ didn't send it, as the step didn't name its control the way FluxIQ needs"]);
  });
});

// R2-U-8 (run-muwansvz-a2b4a987): the card renamed a list to fit its head ("name, price and 4
// more") while the overlay said Core's "name, price, rating and 3 more". The card shows Core's
// name unchanged and, when it is longer than the head holds, marks it whole: the stylesheet
// wraps such a target at its spaces instead of cutting it with an ellipsis.
test("a list's name is shown as Core gave it, marked whole when it is longer than the card's head", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const LIST = "name, price, rating and 3 more";
    const events = [
      event(1, "verifying", { kind: "tool", title: `Reading the list of “${LIST}”`, ref: "core.run_node", status: "succeeded", text: "Result: core.replay.replayed · Rows: 82 · Node: web.output.dom-extract_list" }),
      event(2, "exploring", { kind: "tool", title: "Clicking “Get a free quote”", ref: "core.run_node", status: "succeeded", text: record("web.click.succeeded", "web.output.dom-click") })
    ];
    view.render(buildChatStream([], events), controls, null);
    const [read, click] = cards(fake(view.element));
    assert.equal(text(read!, "chat-card-target"), LIST);
    assert.equal(read!.byClass("chat-card-target")[0]!.getAttribute("data-whole"), "true");
    assert.equal(click!.byClass("chat-card-target")[0]!.getAttribute("data-whole"), "false");
  });
});
