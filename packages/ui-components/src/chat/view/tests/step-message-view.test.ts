// A build with several agents, as the chat draws it (automation-project-agents-plan,
// unit W2): the supervisor's plan is a card with its parts and subflows under
// it, a brief is the header its builder's indented steps follow, a lane is
// named where it changes, each project card has the icon Core pins, and a
// brief's card is updated in place when its builder returns.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { buildChatStream } from "../../stream/index.ts";
import { activityEvent } from "../../tests/activity-fixture.ts";
import { fake, withFakeDocument, type FakeElement } from "../../../testing/index.ts";
import type { StepMessage } from "../../stream/index.ts";
import { createStepMessageView } from "../step-message-view.ts";
import { createThreadView, type TurnControls } from "../thread-view.ts";

type Detail = NonNullable<ClientGatewayActivity["detail"]>;
type Agent = NonNullable<ClientGatewayActivity["agent"]>;

const controls = (): TurnControls => ({ ask: { answering: false, error: undefined, answer: () => undefined, openFluxIQ: () => document.createElement("span") }, state: "" });
const SUPERVISOR: Agent = { role: "supervisor" };
const SEARCH: Agent = { role: "builder", briefId: "brief-1", subflowName: "Search" };
const by = (agent: Agent, sequence: number, detail: Detail) => activityEvent(sequence, { conversationId: "thread-1", agent, detail });
const note = (agent: Agent, sequence: number, project: NonNullable<Detail["project"]>) => by(agent, sequence, { kind: "note", title: "Supervisor", project });

const EVENTS: ClientGatewayActivity[] = [
  note(SUPERVISOR, 1, {
    kind: "plan",
    parts: [{ id: "p1", words: "Find the kettle" }],
    subflows: [{ key: "search", name: "Search", purpose: "Find the kettle", parts: ["p1"] }],
    budget: [{ subflowKey: "search", usd: 0.06 }]
  }),
  note(SUPERVISOR, 2, { kind: "brief", briefId: "brief-1", brief: "build", subflowKey: "search", subflowName: "Search", purpose: "Find the kettle", allowanceUsd: 0.06 }),
  by(SEARCH, 3, { kind: "thought", title: "Typing “kettle”", text: "The search box is the way in.", status: "succeeded" }),
  by(SEARCH, 4, { kind: "tool", title: "Typing “kettle”", ref: "core.run_node", status: "succeeded" }),
  by(SUPERVISOR, 5, { kind: "thought", title: "Checking the search", text: "The builder is still working.", status: "succeeded" })
];
const RETURN = note(SUPERVISOR, 6, { kind: "return", briefId: "brief-1", subflowKey: "search", outcome: "done", reason: "It finds the kettle.", spentUsd: 0.03, calls: 5, trials: 1 });

const icon = (card: FakeElement) => card.byClass("chat-card-mark")[0]!.children[0]!.getAttribute("data-icon");

test("the plan, the brief and its builder's steps: a card each with its pinned icon, the steps indented under the brief, a lane named where it changes", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    view.render(buildChatStream([], EVENTS), controls, "build-1");
    const [plan, brief, step, supervisor] = fake(view.element).children;

    assert.equal(plan!.getAttribute("data-kind"), "project");
    assert.equal(plan!.byClass("chat-step-title")[0]!.textContent, "Planned 1 piece");
    const planCard = plan!.byClass("chat-project-card")[0]!;
    assert.equal(icon(planCard), "git-branch");
    assert.equal(planCard.getAttribute("aria-label"), "Plan, 1 part, 1 piece: Budget $0.06");
    assert.deepEqual(plan!.byClass("chat-project-heading").map((node) => node.textContent), ["Parts", "Pieces"]);
    assert.deepEqual(plan!.byClass("chat-project-item").map((node) => node.textContent), ["Find the kettle", "Search: Find the kettle · $0.06"]);

    assert.equal(brief!.byClass("chat-step-title")[0]!.textContent, "Building Search: Find the kettle");
    const briefCard = brief!.byClass("chat-project-card")[0]!;
    assert.equal(icon(briefCard), "pencil");
    assert.equal(briefCard.getAttribute("data-state"), "working", "its builder is still working");
    assert.equal(brief!.getAttribute("data-brief"), null, "the brief is the header, not indented");
    assert.equal(brief!.byClass("chat-project-rows")[0]!.hidden, true);

    assert.equal(step!.getAttribute("data-role"), "builder");
    assert.equal(step!.getAttribute("data-brief"), "true", "the builder's step sits under its brief");
    assert.equal(step!.byClass("chat-step-lane")[0]!.hidden, true, "right after its brief it names no lane");
    assert.equal(step!.byClass("chat-project").length, 0, "a step has no project card");
    assert.equal(step!.byClass("chat-card").length, 1, "its action is its own card");

    assert.equal(supervisor!.getAttribute("data-role"), "supervisor");
    assert.equal(supervisor!.getAttribute("data-brief"), null);
    const lane = supervisor!.byClass("chat-step-lane")[0]!;
    assert.equal(lane.hidden, false);
    assert.equal(lane.textContent, "Supervisor");
  });
});

test("a brief's card is marked in place when its builder returns, and settles when the work stops without one", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    view.render(buildChatStream([], EVENTS), controls, "build-1");
    const briefCard = fake(view.element).children[1]!.byClass("chat-project-card")[0]!;
    view.render(buildChatStream([], EVENTS), controls, null);
    assert.equal(briefCard.getAttribute("data-state"), "settled", "no build working: the brief no longer works");
    view.render(buildChatStream([], [...EVENTS, RETURN]), controls, "build-1");
    const [, brief, , , returned] = fake(view.element).children;
    assert.equal(brief!.byClass("chat-project-card")[0], briefCard, "the same element");
    assert.equal(briefCard.getAttribute("data-state"), "done");
    const returnCard = returned!.byClass("chat-project-card")[0]!;
    assert.equal(icon(returnCard), "git-merge");
    assert.equal(returned!.byClass("chat-step-title")[0]!.textContent, "Built Search");
    assert.equal(returned!.byClass("chat-step-text")[0]!.textContent, " — It finds the kettle.");
    assert.equal(returnCard.byClass("chat-card-outcome")[0]!.textContent, "Spent $0.03 · 5 calls · 1 test");
  });
});

// Round 5: the build's ending note read as a bold title, " — ", and one dense
// paragraph. A note is a message of its own: its title on one line, its words
// under it as paragraphs, nothing joined by a dash.
test("a note reads as one message: its title on its own line, its words as paragraphs under it", async () => {
  await withFakeDocument(() => {
    const view = createStepMessageView();
    const ending: StepMessage = {
      key: "step:build-1#9", activityId: "build-1", kind: "note", title: "The build stopped",
      text: "It reached its spending limit before the automation was finished.\n\nWhat is left is saved, so it can be built again.",
      actions: [], at: 9_000, sequence: 9, latest: true
    };
    view.update(ending, false);
    const root = fake(view.element);
    assert.equal(root.byClass("chat-step-title")[0]!.textContent, "The build stopped");
    assert.equal(root.textContent.includes(" — "), false, "no dash joins the title and the words");
    const body = root.byClass("chat-step-body")[0]!;
    assert.equal(body.hidden, false);
    assert.deepEqual(body.children.map((child) => [child.tagName, child.textContent]), [
      ["P", "It reached its spending limit before the automation was finished."],
      ["P", "What is left is saved, so it can be built again."]
    ]);
    view.update({ ...ending, text: undefined }, false);
    assert.equal(body.hidden, true, "a note with no words is its title alone");
    const marker = createStepMessageView();
    marker.update({ ...ending, key: "step:build-1#10", kind: "step", title: "Build stopped: a budget ran out" }, false);
    assert.equal(fake(marker.element).byClass("chat-step-body")[0]!.children.length, 2, "a build's ending marker reads the same way");
    assert.equal(fake(marker.element).textContent.includes(" — "), false);
  });
});

test("a decision still reads as its title with its reason after a dash", async () => {
  await withFakeDocument(() => {
    const view = createStepMessageView();
    view.update({ key: "step:build-1#3", activityId: "build-1", kind: "decision", title: "Opening the form", text: "The form is behind this button.", actions: [], at: 3_000, sequence: 3, latest: true }, false);
    const root = fake(view.element);
    assert.equal(root.byClass("chat-step-line")[0]!.textContent, "Opening the form — The form is behind this button.");
    assert.equal(root.byClass("chat-step-body")[0]!.hidden, true);
  });
});
