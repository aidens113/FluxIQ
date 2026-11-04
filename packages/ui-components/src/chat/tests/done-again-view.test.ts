// D7 of the t342 round 2 UI review (run-muylu4pp-f9cb2121, screenshots 09-13),
// as the answer-first plan reads it ("each step told once", "not 5 steps with
// a dropdown"): steps done again before a retry are one quiet line of plain
// text. It is no dropdown and holds no cards, since each step was already told
// as its own message where it happened; the line keeps its element as more
// steps join it.

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

test("steps done again are one plain line naming them, with no dropdown and no cards, which keeps its element as more steps join it", async () => {
  await withFakeDocument(() => {
    const view = createStepMessageView();
    const two = stepMessages([...explored, ...press(9, "Accept all"), ...press(11, "7-in-1")], 100).at(-1)!;
    view.update(two, true);
    const root = fake(view.element);
    const line = root.byClass("chat-again")[0]!;
    assert.equal(line.tagName.toLowerCase(), "p", "plain text, not a details disclosure");
    assert.equal(line.textContent, "Did 2 earlier steps again: Accept all and 7-in-1");
    assert.equal(root.byClass("chat-again-summary").length, 0, "nothing to open");
    assert.equal(root.byClass("chat-card").length, 0, "the steps are not told a second time as cards");

    const three = stepMessages([...explored, ...press(9, "Accept all"), ...press(11, "7-in-1"), ...press(13, "Spain")], 100).at(-1)!;
    view.update(three, true);
    assert.equal(root.byClass("chat-again")[0], line, "the same element");
    assert.equal(line.textContent, "Did 3 earlier steps again: Accept all, 7-in-1 and Spain");
    assert.equal(root.byClass("chat-card").length, 0);
  });
});
