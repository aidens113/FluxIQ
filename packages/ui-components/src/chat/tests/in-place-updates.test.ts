// The live line and the step messages update in place: fifty paced displays
// or steps later they are the same elements, only their words changed, so
// nothing remounts or flickers.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ActivityDisplay } from "fluxiq/ui";
import type { AskControlsContext } from "../conversation/index.ts";
import { buildChatStream } from "../stream/index.ts";
import { createLiveLine, createThreadView, liveLineModel } from "../view/index.ts";
import { activityEvent } from "./activity-fixture.ts";
import { fake, withFakeDocument } from "../../testing/index.ts";

function display(sequence: number, fields: Partial<ActivityDisplay> = {}): ActivityDisplay {
  return {
    activityId: "build:build-1",
    subjectKind: "build",
    phase: sequence % 2 === 0 ? "thinking" : "exploring",
    headline: "Building your Flow",
    detail: `Reading the page, pass ${sequence}`,
    step: { index: 1 + (sequence % 5), count: 5 },
    working: true,
    outcome: null,
    sequence,
    ...fields
  };
}

function tree(root: ReturnType<typeof fake>): unknown[] {
  return [root, ...root.descendants()];
}

test("the live line keeps every node across 50 updates and hides between units of work", async () => {
  await withFakeDocument(() => {
    const line = createLiveLine();
    line.update(liveLineModel(display(0), false));
    const root = fake(line.element);
    const before = tree(root);
    for (let sequence = 1; sequence <= 50; sequence += 1) line.update(liveLineModel(display(sequence), false));
    assert.deepEqual(tree(root), before);
    assert.equal(root.hidden, false);
    assert.equal(root.byClass("chat-live-headline")[0]!.textContent, "Building your Flow");
    assert.equal(root.byClass("chat-live-detail")[0]!.textContent, "Reading the page, pass 50");
    assert.equal(root.byClass("chat-live-step")[0]!.textContent, "Step 1 of 5");
    line.update(liveLineModel(display(51, { working: false, outcome: "done" }), false));
    assert.equal(root.hidden, true);
    assert.deepEqual(tree(root), before);
  });
});

test("the live line says a message is on its way before the first activity, and nothing when idle", () => {
  assert.deepEqual(liveLineModel(null, true), { headline: "Sending your message", detail: "", step: "", waiting: false, action: "" });
  assert.equal(liveLineModel(null, false), null);
  assert.equal(liveLineModel(display(1, { working: false, outcome: "failed" }), false), null);
});

test("while the work waits for the person, the live line stays up and says what Core asked of them", async () => {
  // Core's person-needed ask at a robot check (t197): phase `waiting_permission`,
  // the ask's text as the paced display's detail. The line is no longer
  // working, so it neither pulses nor shimmers, and it is marked waiting.
  const ask = "FluxIQ needs you: complete the check on this page, then press Continue.";
  const waiting = display(9, { phase: "waiting_permission", headline: "Waiting for you", detail: ask, step: null, working: false, outcome: "waiting" });
  assert.deepEqual(liveLineModel(waiting, false), { headline: "Waiting for you", detail: ask, step: "", waiting: true, action: "" });
  assert.deepEqual(liveLineModel({ ...waiting, headline: " ", detail: null }, false), { headline: "Waiting for you", detail: "", step: "", waiting: true, action: "" });
  await withFakeDocument(() => {
    const line = createLiveLine();
    line.update(liveLineModel(display(1), false));
    assert.equal(line.element.getAttribute("data-state"), "working");
    line.update(liveLineModel(waiting, false));
    const root = fake(line.element);
    assert.equal(root.hidden, false);
    assert.equal(line.element.getAttribute("data-state"), "waiting");
    assert.equal(root.byClass("chat-live-detail")[0]!.textContent, ask);
    assert.equal(root.byClass("chat-live-action")[0]!.hidden, true, "the question is on screen: nothing to open");
  });
});

test("while the question is in a thread not on screen, the live line offers the one action that opens it", async () => {
  const waiting = display(9, { phase: "waiting_permission", headline: "Waiting for you", detail: "FluxIQ needs you: complete the check on this page, then press Continue.", step: null, working: false, outcome: "waiting" });
  assert.equal(liveLineModel(waiting, false, true)?.action, "Show the question");
  assert.equal(liveLineModel(display(1), false, true)?.action, "", "working, nothing waits on the person");
  assert.equal(liveLineModel(null, true, true)?.action, "");
  await withFakeDocument(() => {
    let opened = 0;
    const line = createLiveLine(() => (opened += 1));
    line.update(liveLineModel(waiting, false, true));
    const button = fake(line.element).byClass("chat-live-action")[0]!;
    assert.equal(button.hidden, false);
    assert.equal(button.textContent, "Show the question");
    button.dispatch("click");
    assert.equal(opened, 1);
    line.update(liveLineModel(display(2), false, true));
    assert.equal(button.hidden, true, "the work went on: the button goes");
  });
});

/** Ask controls for turns that never carry an ask: step messages are all this test draws. */
const noAsk = (): AskControlsContext => ({ answering: false, error: undefined, answer: () => undefined, openFluxIQ: () => document.createElement("span") });

test("fifty step messages later the first is the same element, and only a message that changed is touched", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const events = [
      activityEvent(1, { phase: "exploring", detail: { kind: "thought", title: "Looking at the page", text: "I need to see what is on it.", status: "succeeded" } }),
      activityEvent(2, { phase: "exploring", detail: { kind: "tool", title: "Looking at the page", ref: "web.inspect_current_page", status: "started" } })
    ];
    const render = () => view.render(buildChatStream([], events), null, () => ({ ask: noAsk(), state: "" }), "build-1");
    render();
    const root = fake(view.element);
    const first = root.byClass("chat-step-msg")[0]!;
    const firstNodes = [first, ...first.descendants()];
    for (let sequence = 3; sequence <= 100; sequence += 2) {
      events.push(activityEvent(sequence, { phase: "exploring", detail: { kind: "thought", title: `Clicking button ${sequence}`, text: `Reason ${sequence}.`, status: "succeeded" } }));
      events.push(activityEvent(sequence + 1, { phase: "exploring", detail: { kind: "tool", title: `Clicking button ${sequence}`, ref: "core.run_node", status: "succeeded" } }));
      render();
    }
    const messages = root.byClass("chat-step-msg");
    assert.equal(messages.length, 50);
    assert.equal(messages[0], first, "the first message is the same element 49 messages later");
    assert.deepEqual([first, ...first.descendants()], firstNodes);
    assert.equal(first.byClass("chat-card-outcome")[0]!.hidden, true, "its action never said it ended, and the work moved on");
    assert.equal(first.byClass("chat-card")[0]!.getAttribute("data-state"), "settled");
    assert.equal(messages[49]!.byClass("chat-step-title")[0]!.textContent, "Clicking button 99");
    assert.equal(messages[49]!.byClass("chat-card-outcome")[0]!.textContent, "Done");
  });
});
