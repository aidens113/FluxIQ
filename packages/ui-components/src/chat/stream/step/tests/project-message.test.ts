// A build with several agents in the chat (automation-project-agents-plan,
// unit W2): the supervisor's plan is one card, each brief is the header its
// builder's steps follow, two builders' steps interleaved in one unit of work
// stay with their own decisions, the return and each receipt are cards, the
// validator's rows say whose they are, and the build's finish marker is still
// no message.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { activityEvent } from "../../../tests/activity-fixture.ts";
import { stepMessages } from "../messages.ts";

type Detail = NonNullable<ClientGatewayActivity["detail"]>;
type Agent = NonNullable<ClientGatewayActivity["agent"]>;

const SUPERVISOR: Agent = { role: "supervisor" };
const SEARCH: Agent = { role: "builder", briefId: "brief-1", subflowName: "Search" };
const CART: Agent = { role: "builder", briefId: "brief-2", subflowName: "Cart" };
const CHECKS: Agent = { role: "validator", briefId: "brief-1", subflowName: "Search" };

const by = (agent: Agent, sequence: number, detail: Detail, fields: Partial<ClientGatewayActivity> = {}) =>
  activityEvent(sequence, { phase: "building", conversationId: "thread-1", agent, detail, ...fields });
const note = (agent: Agent, sequence: number, project: NonNullable<Detail["project"]>) => by(agent, sequence, { kind: "note", title: "Supervisor", project });
const thought = (agent: Agent, sequence: number, title: string, text: string) => by(agent, sequence, { kind: "thought", title, text, status: "succeeded" });
const tool = (agent: Agent, sequence: number, title: string, status: Detail["status"]) => by(agent, sequence, { kind: "tool", title, ref: "core.run_node", ...(status === undefined ? {} : { status }) });

const PLAN: NonNullable<Detail["project"]> = {
  kind: "plan",
  parts: [{ id: "p1", words: "Find the cheapest kettle" }, { id: "p2", words: "Put it in the cart" }],
  subflows: [
    { key: "search", name: "Search", purpose: "Find the kettle", parts: ["p1"] },
    { key: "cart", name: "Cart", purpose: "Add it to the cart", parts: ["p2"] }
  ],
  cases: [{ subflowKey: "search", caseId: "case-1" }],
  budget: [{ subflowKey: "search", usd: 0.06 }, { subflowKey: "cart", usd: 0.05 }],
  reserveUsd: 0.07
};

const ADD = "Clicking “Add to cart”";
const TYPE = "Typing “kettle” into Search";

function multiAgentBuild(): ClientGatewayActivity[] {
  return [
    thought(SUPERVISOR, 1, "Planning the work", "The task has two parts: finding the kettle, then the cart."),
    note(SUPERVISOR, 2, PLAN),
    note(SUPERVISOR, 3, { kind: "brief", briefId: "brief-1", brief: "build", subflowKey: "search", subflowName: "Search", purpose: "Find the kettle", caseId: "case-1", allowanceUsd: 0.06 }),
    thought(SEARCH, 4, TYPE, "The search box is the way to the kettles."),
    note(SUPERVISOR, 5, { kind: "brief", briefId: "brief-2", brief: "build", subflowKey: "cart", subflowName: "Cart", purpose: "Add it to the cart", allowanceUsd: 0.05 }),
    thought(CART, 6, ADD, "The kettle is open, so it goes in the cart."),
    // The search builder acts after the cart builder decided: it is still the search builder's card.
    tool(SEARCH, 7, TYPE, "started"),
    tool(SEARCH, 8, TYPE, "succeeded"),
    tool(CART, 9, ADD, "started"),
    tool(CART, 10, ADD, "succeeded"),
    note(SUPERVISOR, 11, { kind: "return", briefId: "brief-1", subflowKey: "search", outcome: "done", reason: "The search finds the kettle.", spentUsd: 0.04, calls: 12, trials: 3 }),
    by(CHECKS, 12, { kind: "step", title: "Step 1 of 1: Search", ref: "node-search", status: "started" }, { phase: "verifying", step: { index: 1, count: 1, nodeId: "node-search", label: "Search" } }),
    by(CHECKS, 13, { kind: "check", title: "Result check", text: "The kettle was found.", status: "succeeded" }, { phase: "verifying" }),
    note(CHECKS, 14, { kind: "receipt", briefId: "brief-1", receipt: "subflow_trial", receiptId: "receipt-1", verdict: "passed" }),
    note(SUPERVISOR, 15, { kind: "return", briefId: "brief-2", subflowKey: "cart", outcome: "partial", reason: "The cart asks for a sign-in.", spentUsd: 0.05, calls: 9, trials: 2 }),
    note({ role: "validator" }, 16, { kind: "receipt", receipt: "candidate_trial", receiptId: "receipt-2", verdict: "unconfirmed" }),
    by(SUPERVISOR, 17, { kind: "step", title: "Build finished", status: "succeeded" }, { phase: "done", final: true })
  ];
}

test("a multi-agent build: the plan, each brief as its builder's header, interleaved lanes kept apart, returns, receipts, validator rows, and the ending", () => {
  const messages = stepMessages(multiAgentBuild(), 100);
  assert.deepEqual(messages.map((message) => [message.kind, message.title, message.lane ?? null]), [
    ["decision", "Planning the work", "Supervisor"],
    ["project", "Planned 2 pieces", null],
    ["project", "Building Search: Find the kettle", null],
    ["decision", TYPE, null],
    ["project", "Building Cart: Add it to the cart", null],
    ["decision", ADD, null],
    ["project", "Built Search", null],
    ["step", "Step 1: Search", "Validator · Search"],
    ["check", "Result check", null],
    ["project", "Tested Search", null],
    ["project", "Partly built Cart", null],
    ["project", "Tested the whole Flow", null]
  ], "the finish marker is no message: the chat's answer says how the build ended");

  // Interleaved lanes keyed apart: each builder's action is a card of its own decision.
  const [, , , search, , cart] = messages;
  assert.deepEqual(search!.actions.map((card) => [card.key, card.kind, card.outcome]), [["action:build-1#7", "type", "done"]]);
  assert.deepEqual(cart!.actions.map((card) => [card.key, card.kind, card.outcome]), [["action:build-1#9", "click", "done"]]);
  assert.deepEqual(search!.agent, SEARCH);
  assert.deepEqual(cart!.agent, CART);

  // The plan card: its parts, each subflow with its purpose, allowance and starting cases, and the budget.
  const plan = messages[1]!.project!;
  assert.deepEqual([plan.card.icon, plan.card.name, plan.card.target, plan.card.outcome], ["branch", "Plan", "2 parts, 2 pieces", "Budget $0.18, $0.07 kept back"]);
  assert.deepEqual(plan.card.rows, [
    { heading: "Parts", items: ["Find the cheapest kettle", "Put it in the cart"] },
    { heading: "Pieces", items: ["Search: Find the kettle · $0.06 · 1 starting case", "Cart: Add it to the cart · $0.05"] }
  ]);

  // Each brief's card shows how its builder came back; the return and the receipts are cards of their own.
  const card = (index: number) => messages[index]!.project!.card;
  assert.deepEqual([card(2).icon, card(2).name, card(2).target, card(2).outcome, card(2).state], ["draft", "Build", "Search", "Allowance $0.06", "done"]);
  assert.equal(card(4).state, "unconfirmed", "the cart builder came back with part of it");
  assert.deepEqual([card(6).icon, card(6).name, card(6).target, card(6).outcome, card(6).state], ["join", "Return", "Search", "Spent $0.04 · 12 calls · 3 tests", "done"]);
  assert.equal(messages[6]!.text, "The search finds the kettle.");
  assert.deepEqual([card(9).icon, card(9).name, card(9).target, card(9).outcome, card(9).state], ["test", "Part test", "Search", "Passed", "done"]);
  assert.deepEqual([card(11).name, card(11).target, card(11).outcome, card(11).state], ["Whole-Flow run", null, "Not confirmed", "unconfirmed"]);

  // The validator's run step is a card, ended by its next row; the check is its own message.
  assert.deepEqual(messages[7]!.actions.map((action) => action.outcome), ["done"]);
  assert.deepEqual(messages[7]!.agent, CHECKS);
  assert.equal(messages.at(-1)!.latest, true);
  assert.equal(messages.filter((message) => message.latest).length, 1, "one unit of work: one newest message");
  for (const message of messages) assert.doesNotMatch(`${message.title} ${message.text ?? ""} ${JSON.stringify(message.project ?? {})}`, /brief-\d|receipt-\d|case-1/u, "never an id");
});

test("a builder's steps that come back after another lane name their lane again", () => {
  const events = [
    note(SUPERVISOR, 1, { kind: "brief", briefId: "brief-1", brief: "repair", subflowKey: "search", subflowName: "Search", purpose: "", allowanceUsd: 0.02 }),
    thought({ role: "repair", briefId: "brief-1", subflowName: "Search" }, 2, "Fixing the search", "The box moved."),
    thought(SUPERVISOR, 3, "Waiting for the repair", "It is the last part left."),
    thought({ role: "repair", briefId: "brief-1", subflowName: "Search" }, 4, "Trying the search again", "The box is back.")
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(messages.map((message) => [message.title, message.lane ?? null]), [
    ["Repairing Search", null],
    ["Fixing the search", null],
    ["Waiting for the repair", "Supervisor"],
    ["Trying the search again", "Repair · Search"]
  ]);
  assert.equal(messages[0]!.project!.card.state, "working", "no return yet");
  assert.equal(messages[0]!.project!.card.icon, "repair");
});

test("two receipts that say the same are two messages, never folded into one card", () => {
  const receipt = (sequence: number) => note(CHECKS, sequence, { kind: "receipt", briefId: "brief-1", receipt: "subflow_trial", receiptId: `receipt-${sequence}`, verdict: "passed" });
  const messages = stepMessages([receipt(1), receipt(2)], 100);
  assert.deepEqual(messages.map((message) => [message.key, message.title, message.project!.card.outcome]), [
    ["step:build-1#1", "Tested Search", "Passed"],
    ["step:build-1#2", "Tested Search", "Passed"]
  ]);
});

test("a build with one agent reads as before: no author, no lane", () => {
  const events = [activityEvent(1, { detail: { kind: "thought", title: TYPE, text: "The box is there.", status: "succeeded" } }), activityEvent(2, { detail: { kind: "tool", title: TYPE, ref: "core.run_node", status: "succeeded" } })];
  const [message] = stepMessages(events, 100);
  assert.equal(message!.agent, undefined);
  assert.equal(message!.lane, undefined);
  assert.equal(message!.actions.length, 1);
});

// t649 (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, 00004): a brief dispatched beside one still being
// built read "Building Cart ... / Allowance $0.05" though its builder never ran; it waited for the part
// before it. It says it waits until its own builder speaks, and one that comes back still waiting
// says it was never started.
test("a brief dispatched while another is out waits for it by name, until its own builder starts", () => {
  const first = note(SUPERVISOR, 1, { kind: "brief", briefId: "brief-1", brief: "build", subflowKey: "search", subflowName: "Search", purpose: "Find the kettle", allowanceUsd: 0.06 });
  const second = note(SUPERVISOR, 2, { kind: "brief", briefId: "brief-2", brief: "build", subflowKey: "cart", subflowName: "Cart", purpose: "Add it to the cart", allowanceUsd: 0.05 });
  const waits = stepMessages([first, second, thought(SEARCH, 3, TYPE, "The search box is the way to the kettles.")], 100);
  assert.deepEqual([waits[1]!.title, waits[1]!.project!.card.outcome, waits[1]!.project!.card.state], ["Cart waits for Search: Add it to the cart", "Waits for Search", "settled"]);
  assert.deepEqual([waits[0]!.title, waits[0]!.project!.card.outcome], ["Building Search: Find the kettle", "Allowance $0.06"], "the first brief started at once");

  const started = stepMessages([first, second, thought(CART, 3, ADD, "The kettle is open, so it goes in the cart.")], 100);
  assert.deepEqual([started[1]!.title, started[1]!.project!.card.outcome, started[1]!.project!.card.state], ["Building Cart: Add it to the cart", "Allowance $0.05", "working"]);

  const blocked = "Brief brief-1 for subflow search, which this subflow starts after, ended blocked (The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress).), so this subflow's entry cannot be prepared and its trials could not run.";
  const never = stepMessages([
    first,
    second,
    note(SUPERVISOR, 3, { kind: "return", briefId: "brief-1", subflowKey: "search", outcome: "blocked", reason: "The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress).", spentUsd: 0.01, calls: 21, trials: 0 }),
    note(SUPERVISOR, 4, { kind: "return", briefId: "brief-2", subflowKey: "cart", outcome: "blocked", reason: blocked, spentUsd: 0, calls: 0, trials: 0 })
  ], 100);
  assert.deepEqual([never[1]!.project!.card.outcome, never[1]!.project!.card.state], ["Not started", "failed"]);
  assert.deepEqual([never[3]!.title, never[3]!.text, never[3]!.project!.card.outcome], ["Couldn't build Cart", "It starts after Search, which couldn't be built, so it was never started.", "Not started"]);
  assert.equal(never[2]!.text, "The builder kept trying without getting any further, so it was stopped.");
});

// Round 2 of t649: Core's brief card names the parts it starts after (`after`), so the chat states the
// wait from Core rather than guessing it: a brief beside one it does not start after runs at once.
test("a brief waits only for a part Core names it starting after that is still out", () => {
  const first = note(SUPERVISOR, 1, { kind: "brief", briefId: "brief-1", brief: "build", subflowKey: "search", subflowName: "Search", purpose: "Find the kettle", allowanceUsd: 0.06, after: [] });
  const cart = (after: string[]) => note(SUPERVISOR, 2, { kind: "brief", briefId: "brief-2", brief: "build", subflowKey: "cart", subflowName: "Cart", purpose: "Add it to the cart", allowanceUsd: 0.05, after });
  const read = (after: string[]) => {
    const message = stepMessages([first, cart(after)], 100)[1]!;
    return [message.title, message.project!.card.outcome, message.project!.card.state];
  };
  assert.deepEqual(read(["Search"]), ["Cart waits for Search: Add it to the cart", "Waits for Search", "settled"]);
  assert.deepEqual(read([]), ["Building Cart: Add it to the cart", "Allowance $0.05", "working"], "it starts after none: both build at once");
  assert.deepEqual(read(["Sign in"]), ["Building Cart: Add it to the cart", "Allowance $0.05", "working"], "the part it starts after was built earlier and is not out");
});
