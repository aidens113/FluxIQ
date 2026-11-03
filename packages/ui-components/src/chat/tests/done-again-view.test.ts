// D7 of the t342 round 2 UI review (run-muylu4pp-f9cb2121, screenshots 09-13):
// steps done again before a retry are one closed line in the chat that opens to
// show their cards, kept in place as more steps join it.

import assert from "node:assert/strict";
import { test } from "vitest";
import { stepMessages } from "../stream/index.ts";
import { createStepMessageView } from "../view/index.ts";
import { activityEvent } from "./activity-fixture.ts";
import { fake, withFakeDocument } from "../../testing/index.ts";

const thought = (sequence: number, title: string, text: string, phase: "exploring" | "repairing" = "exploring") =>
  activityEvent(sequence, { phase, label: title, detail: { kind: "thought", title, text, status: "succeeded" } });
const press = (sequence: number, name: string) => [
  activityEvent(sequence, { phase: "exploring", detail: { kind: "tool", title: `Clicking “${name}”`, ref: "core.run_node", status: "started" } }),
  activityEvent(sequence + 1, { phase: "exploring", detail: { kind: "tool", title: `Clicking “${name}”`, ref: "core.run_node", status: "succeeded", text: "Result: web.action.succeeded" } })
];

const explored = [
  thought(1, "Setting the options", "Each option the person named."), ...press(2, "Accept all"), ...press(4, "7-in-1"), ...press(6, "Spain"),
  thought(8, "Repairing the Flow", "The quantity was not set.", "repairing")
];

test("steps done again are one closed line naming them, which keeps its element as more steps join it", async () => {
  await withFakeDocument(() => {
    const view = createStepMessageView();
    const two = stepMessages([...explored, ...press(9, "Accept all"), ...press(11, "7-in-1")], 100).at(-1)!;
    view.update(two, true);
    const root = fake(view.element);
    const line = root.byClass("chat-again")[0]!;
    assert.equal(line.tagName.toLowerCase(), "details");
    assert.equal(line.open, false, "closed until the person opens it");
    assert.equal(root.byClass("chat-again-summary")[0]!.textContent, "Did 2 earlier steps again: Accept all and 7-in-1");
    assert.equal(root.byClass("chat-again-cards")[0]!.byClass("chat-card").length, 2, "it holds each step's card");

    const three = stepMessages([...explored, ...press(9, "Accept all"), ...press(11, "7-in-1"), ...press(13, "Spain")], 100).at(-1)!;
    line.open = true;
    view.update(three, true);
    assert.equal(root.byClass("chat-again")[0], line, "the same element, still open");
    assert.equal(line.open, true);
    assert.equal(root.byClass("chat-again-summary")[0]!.textContent, "Did 3 earlier steps again: Accept all, 7-in-1 and Spain");
    assert.equal(root.byClass("chat-again-cards")[0]!.byClass("chat-card").length, 3);
  });
});
