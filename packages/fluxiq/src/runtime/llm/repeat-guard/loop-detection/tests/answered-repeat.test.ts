// Repeats answered from memory go through loop detection (t1096), from the recorded shape of a manual
// panel build of 2026-11-27, steps 0029-0062. A press came back uncertain, the model asked for the whole
// page, the capture failed and was filed as an answer, and the identical ask was then answered from memory
// seven times; after a second press, five more. None of those asks reached loop detection's near-repeat
// rule: the only firing was the no-progress window, once another call ran, at 16 (step 0062). Tool ids,
// codes and the order of events are the recording's; digests, handles and answers are made up.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmLoopReplay, type AutomationStudioLlmLoopCall, type AutomationStudioLlmLoopReplayEvent } from "../index.ts";

const RUN_NODE = "core.run_node";
const FULL_PAGE = "core.full_page";

function ran(step: number, toolId: string, input: JsonObject, fields: Partial<AutomationStudioLlmLoopCall> & { resultCode: string }): AutomationStudioLlmLoopReplayEvent {
  const call: AutomationStudioLlmLoopCall = { callId: `c${step}`, toolId, input, effect: toolId === FULL_PAGE ? "observe" : "mutate", effectApplied: false, refused: toolId !== FULL_PAGE, answer: `a${step}`, ...fields };
  return { kind: "call", step, call, proposes: toolId !== FULL_PAGE, resultCode: fields.resultCode, answerText: JSON.stringify({ step }) };
}
const answered = (step: number): AutomationStudioLlmLoopReplayEvent => ({ kind: "answered", step, toolId: FULL_PAGE, input: {}, state: "s2" });
const asks = (from: number, to: number): AutomationStudioLlmLoopReplayEvent[] => Array.from({ length: (to - from) / 2 + 1 }, (_, index) => answered(from + index * 2));

/** Steps 0029-0061. The page the failed press returned had moved in its live parts (`s2`), which is what started the window afresh there. */
const recorded: AutomationStudioLlmLoopReplayEvent[] = [
  ran(29, RUN_NODE, { node: "web.output.dom-next_page", parameters: { list: "list.a" }, consequences: [] }, { stateBefore: "s1", stateAfter: "s2", resultCode: "web.action.rejected.action_failed" }),
  ran(31, FULL_PAGE, {}, { stateBefore: "s2", resultCode: "core.full_page.unavailable", answer: "unavailable" }),
  ...asks(33, 45),
  ran(47, RUN_NODE, { node: "web.output.dom-click", parameters: { target: { handle: "h1" } }, consequences: [] }, { stateBefore: "s2", resultCode: "web.action.rejected.action_timed_out" }),
  ran(49, FULL_PAGE, {}, { stateBefore: "s2", resultCode: "core.full_page.captured", answer: "captured" }),
  ...asks(51, 59),
  ran(61, RUN_NODE, { node: "web.output.dom-next_page", parameters: { nextPage: { list: "list.b", control: "h1" } }, consequences: [] }, { resultCode: "web.action.rejected.not_at_start_location" })
];

describe("a look answered from memory, asked again (t1096)", () => {
  // Before t1096 this replay's first firing was `{ step: 61, rung: "steer", pattern: "no_progress", repeats: 16,
  // toolIds: [core.full_page, core.run_node] }`: the recording's own step 0062.
  it("is a near repeat at the second ask, the first answered from memory, not the no-progress window at 16", () => {
    const { firings, tally } = automationStudioLlmLoopReplay(recorded);
    expect(firings[0]).toEqual({ step: 33, rung: "steer", pattern: "near_repeat", repeats: 2, toolIds: [FULL_PAGE] });
    expect(firings.some((firing) => firing.pattern === "no_progress" && firing.repeats >= 16)).toBe(false);
    expect(tally.caught.near_repeat).toBe(1);
  });

  it("climbs the ladder it always had: steered again, then refusing counts, then a change of approach, with no new count", () => {
    const { firings } = automationStudioLlmLoopReplay(recorded);
    // 0033 steers, 0035 steers again on the rung above, 0037-0041 are three more ways round it, and the third is the change of approach.
    expect(firings.slice(0, 3)).toEqual([
      { step: 33, rung: "steer", pattern: "near_repeat", repeats: 2, toolIds: [FULL_PAGE] },
      { step: 35, rung: "steer", pattern: "near_repeat", repeats: 3, toolIds: [FULL_PAGE] },
      { step: 41, rung: "change_approach", pattern: "near_repeat", repeats: 6, toolIds: [FULL_PAGE] }
    ]);
  });

  it("says nothing of a look asked once, and steers on the first ask answered from memory", () => {
    expect(automationStudioLlmLoopReplay(recorded.slice(0, 2)).firings).toEqual([]);
    expect(automationStudioLlmLoopReplay(recorded.slice(0, 3)).firings).toEqual([{ step: 33, rung: "steer", pattern: "near_repeat", repeats: 2, toolIds: [FULL_PAGE] }]);
  });

  it("starts again after progress: a look answered from memory on a page never seen is a first ask there", () => {
    const events: AutomationStudioLlmLoopReplayEvent[] = [
      ran(1, FULL_PAGE, {}, { stateBefore: "p1", stateAfter: "p1", resultCode: "core.full_page.captured" }),
      ran(2, RUN_NODE, { node: "web.output.dom-click", parameters: { target: { handle: "h2" } }, consequences: [] }, { stateBefore: "p1", stateAfter: "p2", effectApplied: true, refused: false, resultCode: "web.action.succeeded" }),
      { kind: "answered", step: 3, toolId: FULL_PAGE, input: {}, state: "p2" }
    ];
    expect(automationStudioLlmLoopReplay(events).firings).toEqual([]);
  });
});
