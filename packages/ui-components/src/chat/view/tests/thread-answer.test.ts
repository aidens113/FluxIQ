// The answer turn in the message list: in time order with the turns and steps, and
// reconciled in place like them, so nothing flickers and "Show all" stays open.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { AskControlsContext, CoreTurn } from "../../conversation/index.ts";
import { buildChatStream } from "../../stream/index.ts";
import { activityEvent, eventTime } from "../../tests/activity-fixture.ts";
import { createFakeChatResultsPort, fake, fakeTaskOutcomes, withFakeDocument } from "../../../testing/index.ts";
import type { ChatTaskOutcome } from "../../ports/index.ts";
import { createThreadView, type TurnControls } from "../thread-view.ts";

const ASK: AskControlsContext = { answering: false, error: undefined, answer: () => undefined, openFluxIQ: () => document.createElement("span") };
const controls = (): TurnControls => ({ ask: ASK, state: "" });
const turn = (turnId: string, author: string): CoreTurn => ({ turnId, author, text: turnId, ask: null });
const note = (sequence: number) => activityEvent(sequence, { detail: { kind: "note", title: `Step ${sequence}`, text: `Noted ${sequence}.` } });

function streamOf(outcomes: ChatTaskOutcome[]) {
  return buildChatStream([{ turn: turn("ask", "person"), at: eventTime(0) }], [note(1), note(9)], undefined, outcomes);
}

test("an answer sits among the turns and steps where it ended", async () => {
  await withFakeDocument(() => {
    const outcome = fakeTaskOutcomes().rowsChecked;
    outcome.attempt = { ...outcome.attempt, endedAtMs: eventTime(5) };
    const view = createThreadView({ answers: { results: createFakeChatResultsPort() } });
    assert.equal(view.render(streamOf([outcome]), controls), true);
    const list = fake(view.element).children;
    const answerAt = list.findIndex((child) => child.className.includes("answer-turn"));
    assert.equal(answerAt, 2, "after the ask and the first step, before the later step");
    assert.equal(list.length, 4, "the ask, two steps and the answer, nothing else");
    assert.equal(list[answerAt]!.byClass("answer-headline")[0]!.textContent, "Found 10 of 10");
  });
});

test("renders keep the answer's element, redraw its words in place, and keep Show all open", async () => {
  await withFakeDocument(() => {
    const outcome = fakeTaskOutcomes().rowsChecked;
    outcome.result!.rows!.previewRows = Array.from({ length: 10 }, (_, index) => ({ title: `Item ${index}`, price: index }));
    const view = createThreadView({ answers: { results: createFakeChatResultsPort() } });
    view.render(streamOf([outcome]), controls);
    const answer = () => fake(view.element).children.find((child) => child.className.includes("answer-turn"))!;
    const first = answer();
    first.querySelectorAll("button").find((button) => button.getAttribute("data-action") === "toggle-rows")!.dispatch("click");
    assert.equal(first.byClass("answer-row").length, 10);
    view.render(streamOf([structuredClone(outcome)]), controls);
    assert.equal(answer(), first, "the same element");
    assert.equal(first.byClass("answer-row").length, 10, "Show all survived the render");
    const changed = structuredClone(outcome);
    changed.result!.label = "refuted";
    view.render(streamOf([changed]), controls);
    assert.equal(answer(), first);
    assert.equal(first.byClass("answer-check-words")[0]!.textContent, "Did not pass the check");
  });
});

test("an answer that is no longer in the stream leaves, and a working one never appears", async () => {
  await withFakeDocument(() => {
    const outcomes = fakeTaskOutcomes();
    const view = createThreadView({ answers: { results: createFakeChatResultsPort() } });
    view.render(streamOf([outcomes.rowsChecked, outcomes.working]), controls);
    const count = () => fake(view.element).children.filter((child) => child.className.includes("answer-turn")).length;
    assert.equal(count(), 1);
    view.render(streamOf([]), controls);
    assert.equal(count(), 0);
    view.render(streamOf([outcomes.rowsChecked]), controls);
    view.clear();
    assert.equal(count(), 0);
  });
});
