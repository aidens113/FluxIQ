// The step messages update in place: fifty steps
// later they are the same elements, only their words changed, so
// nothing remounts or flickers.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { AskControlsContext } from "../conversation/index.ts";
import { buildChatStream } from "../stream/index.ts";
import { createThreadView } from "../view/index.ts";
import { activityEvent } from "./activity-fixture.ts";
import { fake, withFakeDocument } from "../../testing/index.ts";

function tree(root: ReturnType<typeof fake>): unknown[] {
  return [root, ...root.descendants()];
}

/** Ask controls for turns that never carry an ask: step messages are all this test draws. */
const noAsk = (): AskControlsContext => ({ answering: false, error: undefined, answer: () => undefined, openFluxIQ: () => document.createElement("span") });

test("fifty step messages later the first is the same element, and only a message that changed is touched", async () => {
  await withFakeDocument(() => {
    const view = createThreadView();
    const events = [
      activityEvent(1, { phase: "exploring", detail: { kind: "thought", title: "Looking at the page", text: "I need to see what is on it.", status: "succeeded" } }),
      activityEvent(2, { phase: "exploring", detail: { kind: "tool", title: "Looking at the page", ref: "web.inspect_current_page", status: "started" } })
    ];
    const render = () => view.render(buildChatStream([], events), () => ({ ask: noAsk(), state: "" }), "build-1");
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
