// D7 of the t342 round 2 UI review (run-muylu4pp-f9cb2121, screenshots 09-13):
// before each retry of a step, the repair did the steps before it again first,
// and every pass printed 4-6 full success cards that were already in the chat
// (Accept all, 7-in-1, Spain, Get coupons, +, Space Grey). Steps done again are
// one line that says so and opens to show them.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { activityEvent } from "../../../tests/activity-fixture.ts";
import { doneAgainWords } from "../done-again.ts";
import { stepMessages, type StepMessage } from "../messages.ts";

type Detail = NonNullable<ClientGatewayActivity["detail"]>;

const thought = (sequence: number, title: string, text: string, phase: ClientGatewayActivity["phase"] = "exploring") =>
  activityEvent(sequence, { phase, label: title, detail: { kind: "thought", title, text, status: "succeeded" } });
const tool = (sequence: number, title: string, status: Detail["status"], text = "Result: web.action.succeeded") =>
  activityEvent(sequence, { phase: "exploring", detail: { kind: "tool", title, ref: "core.run_node", ...(status === undefined ? {} : { status }), text } });

/** A press of `name`, started at `sequence` and ended at `sequence + 1`. */
const press = (sequence: number, name: string, text?: string) => [tool(sequence, `Clicking “${name}”`, "started"), tool(sequence + 1, `Clicking “${name}”`, "succeeded", text)];

function cards(messages: StepMessage[]): Array<Array<[string | null, number | undefined]>> {
  return messages.map((message) => message.actions.map((card) => [card.target, card.again?.length]));
}

test("steps done again before a retry are one line that holds their cards; the retry stays its own card (D7)", () => {
  const events = [
    thought(1, "Clicking “Accept all”", "The consent banner covers the page."), ...press(2, "Accept all"),
    thought(4, "Clicking “7-in-1”", "The hub comes in three sizes."), ...press(5, "7-in-1"),
    thought(7, "Clicking “Spain”", "It has to ship from Spain."), ...press(8, "Spain"),
    thought(10, "Repairing the Flow", "The quantity was not set.", "repairing"),
    ...press(11, "Accept all", "Result: core.replay.remembered"), ...press(13, "7-in-1"), ...press(15, "Spain"),
    tool(17, "Clicking “Quantity”", "started")
  ];
  const messages = stepMessages(events, 100);
  assert.deepEqual(cards(messages), [
    [["Accept all", undefined]],
    [["7-in-1", undefined]],
    [["Spain", undefined]],
    [["Accept all", 3], ["Quantity", undefined]]
  ]);
  const group = messages[3]!.actions[0]!;
  assert.equal(group.key, "action:build-1#11", "keyed by the first step it holds, so it keeps its place");
  assert.deepEqual(group.again!.map((card) => card.target), ["Accept all", "7-in-1", "Spain"]);
  assert.equal(doneAgainWords(group.again!), "Did 3 earlier steps again: Accept all, 7-in-1 and Spain");
});

test("a single step done again, a new step, a failure or a step with no name stays a card of its own", () => {
  const events = [
    thought(1, "Clicking “Accept all”", "The banner."), ...press(2, "Accept all"),
    thought(4, "Clicking “Spain”", "Ship from Spain."), ...press(5, "Spain"),
    thought(7, "Repairing the Flow", "Retry.", "repairing"),
    ...press(8, "Accept all"),
    ...press(10, "Get coupons"),
    ...press(12, "Spain"), tool(14, "Clicking “Accept all”", "started"), tool(15, "Clicking “Accept all”", "failed", "Result: web.target.not_found")
  ];
  assert.deepEqual(cards(stepMessages(events, 100)).at(-1), [["Accept all", undefined], ["Get coupons", undefined], ["Spain", undefined], ["Accept all", undefined]]);
});

test("the line names at most three of the steps it holds", () => {
  const events = [
    thought(1, "Setting up", "Each option."), ...press(2, "A"), ...press(4, "B"), ...press(6, "C"), ...press(8, "D"),
    thought(10, "Repairing the Flow", "Retry.", "repairing"), ...press(11, "A"), ...press(13, "B"), ...press(15, "C"), ...press(17, "D")
  ];
  const group = stepMessages(events, 100).at(-1)!.actions[0]!;
  assert.equal(doneAgainWords(group.again!), "Did 4 earlier steps again: A, B, C and 1 more");
});
