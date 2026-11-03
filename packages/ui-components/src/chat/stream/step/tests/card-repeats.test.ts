// Cards that only repeat what the chat already shows fold into one card that
// counts them (`card-repeats.ts`). Round 5 showed two identical "Choose ... /
// Not done: it was already tried exactly this way" cards around one Look card:
// each refused try came under its own decision, with the same reason, so the
// fold that works inside one stretch of cards never saw them as one.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ActionCard } from "../action-card.ts";
import { foldRepeatedCards } from "../card-repeats.ts";
import type { StepMessage } from "../messages.ts";

const ALREADY = "it was already tried exactly this way";

function refusedChoice(sequence: number): ActionCard {
  return {
    kind: "click", name: "Choose", target: "Size: Large", outcome: "failed", why: ALREADY,
    refused: { all: true, because: ALREADY },
    key: `action:build-1#${sequence}`, said: undefined, answer: undefined, check: false
  };
}

function look(sequence: number): ActionCard {
  return { kind: "look", target: null, outcome: "done", why: null, key: `action:build-1#${sequence}`, said: undefined, answer: undefined, check: false };
}

function decision(sequence: number, text: string | undefined, card: ActionCard, activityId = "build-1"): StepMessage {
  return { key: `step:${activityId}#${sequence}`, activityId, kind: "decision", title: "Choosing the size", text, actions: [card], at: sequence * 1_000, sequence, latest: false };
}

const shown = (messages: StepMessage[]) => messages.map((message) => message.actions.map((card) => `${card.name ?? card.kind}${card.times === undefined ? "" : ` x${card.times}`}`));

test("a refused try repeated under a decision with the same reason folds into the first, across a card between them", () => {
  const reason = "The size list is open, so I pick the large size.";
  const folded = foldRepeatedCards([
    decision(1, reason, refusedChoice(2)),
    { ...decision(3, "I look at the page again.", look(4)), title: "Looking at the page" },
    decision(5, reason, refusedChoice(6))
  ]);
  assert.deepEqual(shown(folded), [["Choose x2"], ["look"]], "one Choose card that counts both tries; the repeat's message adds nothing");
  assert.equal(folded[0]!.sequence, 5, "the folded card stands for the newest try");
});

test("refused tries under decisions with different reasons stay apart", () => {
  const folded = foldRepeatedCards([
    decision(1, "The size list is open, so I pick the large size.", refusedChoice(2)),
    decision(3, "The page changed, so I try the large size once more.", refusedChoice(4))
  ]);
  assert.deepEqual(shown(folded), [["Choose"], ["Choose"]]);
});

test("a refused try in another unit of work is not folded", () => {
  const reason = "The size list is open, so I pick the large size.";
  const folded = foldRepeatedCards([decision(1, reason, refusedChoice(2)), decision(3, reason, refusedChoice(4), "build-2")]);
  assert.deepEqual(shown(folded), [["Choose"], ["Choose"]]);
});

test("an action that failed, not refused, under the same reason is not folded across decisions: it was really tried again", () => {
  const reason = "The size list is open, so I pick the large size.";
  const failed = (sequence: number): ActionCard => {
    const { refused: _refused, ...card } = refusedChoice(sequence);
    return { ...card, why: "the option did not respond" };
  };
  const folded = foldRepeatedCards([decision(1, reason, failed(2)), decision(3, reason, failed(4))]);
  assert.deepEqual(shown(folded), [["Choose"], ["Choose"]]);
});
