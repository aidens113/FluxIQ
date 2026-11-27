// A read the model named the result in an earlier attempt, carried into this one, holds the result against no read of
// the same list made here (`../compose.ts`, rule 2, t1085). Live run `run-mwz2jc4w-0c207128` (kestrel auctions),
// attempt 2: 0052's draft carried attempt 1's Flow (steps 1-7, the read 6 named the result in attempt 1 at 0021 and
// 0023, repeating through Next page 7), and its replay stopped at step 3, so 6 never ran. The model pressed Auction (9)
// and read the same list (11): the draft left 11 out `not_the_result` and 9 out `dead_end`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftCompose } from "../compose.ts";

type Step = AutomationStudioFlowDraftStep;

const LIST = "list:auctions";
const node = (actionId: string, parameters: Record<string, unknown>) => ({ node: actionId, parameters, consequences: [] });
const press = (position: number, handle: string, before: string, after: string, rest: Partial<Step> = {}): Step => ({
  position, id: `d${position}`, iteration: position, actionId: "web.output.dom-click", toolId: "core.run_node", input: node("web.output.dom-click", { target: { handle } }),
  effect: "mutate", effectApplied: true, proposes: true, stateBefore: before, stateAfter: after, disposition: "kept", ...rest
});
const look = (position: number, actionId: string): Step => ({ position, id: `d${position}`, iteration: position, actionId, toolId: "core.run_node", input: {}, effect: "observe", proposes: false, disposition: "taken" });
const read = (position: number, handle: string, rest: Partial<Step> = {}): Step => ({
  position, id: `d${position}`, iteration: position, actionId: "web.output.dom-extract_list", toolId: "core.run_node", input: node("web.output.dom-extract_list", { extractList: { handle } }),
  effect: "observe", effectApplied: true, proposes: true, reads: LIST, stateBefore: "s-auctions", stateAfter: "s-auctions", disposition: "kept", ...rest
});

/** 0052's draft: steps 1-7 carried from attempt 1, then this attempt's look, Auction press, look and read, just appended. */
function draft052(fresh: Partial<Step> = {}): Step[] {
  return [
    { ...press(1, "-", "s-blank", "s-home"), actionId: "web.output.browser-navigate", input: node("web.output.browser-navigate", { url: "http://127.0.0.1/scenarios/auction-marketplace/" }) },
    press(2, "t114", "s-home-banner", "s-home"),
    { ...press(3, "t21", "s-home", "s-results"), actionId: "web.output.dom-type", input: node("web.output.dom-type", { text: "kestrel 35", submit: true, target: { handle: "t21" } }) },
    press(4, "t198", "s-results", "s-auctions"),
    look(5, "web.detect_repeating_structure"),
    read(6, "extraction.1", { result: true, routing: { kind: "repeat", through: "d7", while: "d7" } }),
    { ...press(7, "-", "s-auctions", "s-auctions-2"), actionId: "web.output.dom-next_page", input: node("web.output.dom-next_page", { nextPage: { list: "extraction.1" } }) },
    look(8, "web.output.dom-capture_snapshot"),
    press(9, "t198", "s-results-now", "s-auctions-now", { disposition: "taken" }),
    look(10, "web.detect_repeating_structure"),
    read(11, "extraction.2", { disposition: "taken", stateBefore: "s-auctions-now", stateAfter: "s-auctions-now", ...fresh })
  ];
}
const carried = (step: Step): boolean => step.position <= 7;
const compose = (steps: Step[], isRuled: (step: Step) => boolean = carried) => automationStudioFlowDraftCompose({ steps, isRuled, isResult: () => true });
const at = (steps: Step[], position: number) => steps.find((each) => each.position === position)!;

describe("a result read carried from an earlier attempt", () => {
  it("run mwz2jc4w 0052: does not hold the result against this attempt's read of the same list", () => {
    const out = compose(draft052());
    expect([at(out, 11).drafted, at(out, 11).disposition]).toEqual(["in", "kept"]);
    expect([at(out, 9).drafted, at(out, 9).disposition]).toEqual(["in", "kept"]);
    // The carried step is the model's word and is copied as it is.
    expect(at(out, 6)).toEqual(draft052()[5]);
  });

  it("is the same when composed again on its own output", () => {
    const once = compose(draft052());
    expect(compose(once)).toEqual(once);
  });

  it("still holds against a read of another list", () => {
    const out = compose(draft052({ reads: "list:other" }));
    expect([at(out, 11).drafted, at(out, 9).drafted]).toEqual(["not_the_result", "dead_end"]);
  });

  it("still holds where the model named it in this attempt: the pick is not carried", () => {
    const out = compose(draft052(), () => false);
    expect(at(out, 11).drafted).toBe("not_the_result");
  });
});
