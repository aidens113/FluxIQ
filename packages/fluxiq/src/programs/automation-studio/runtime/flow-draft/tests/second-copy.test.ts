// A step joining the Flow that copies a kept step (`../second-copy.ts`).
//
// Live run `run-murwdp4f-35f976d2` (C9, rows 0038-0046): the call
// `click t1212, add` repeated step 18's press of the 3-Pack link from the same
// results page and became step 21, a second copy in the Flow. Live run
// `run-muq4oaof-464f5bce` (cause 3) kept two list reads of one list.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftSecondCopy, type AutomationStudioFlowDraftStep } from "../index.ts";

type Step = AutomationStudioFlowDraftStep;

const RESULTS = "s-results";
const PRODUCT = "s-product";

function press(n: number, target: string, before: string, after: string, disposition: Step["disposition"] = "kept"): Step {
  return {
    position: n, id: `d${n}`, iteration: n, actionId: "web.dom.click", toolId: "core.run_node",
    input: { node: "web.dom.click", parameters: { target: { handle: target } } },
    ranWith: { node: "web.dom.click", parameters: { selector: `#${target}` } },
    effect: "mutate", effectApplied: true, stateBefore: before, stateAfter: after, disposition
  };
}

function read(n: number, reads: string | undefined, disposition: Step["disposition"] = "kept", where = "all"): Step {
  return {
    position: n, id: `d${n}`, iteration: n, actionId: "web.extract.list", toolId: "core.run_node",
    input: { node: "web.extract.list", parameters: { where } },
    effect: "observe", proposes: true, effectApplied: true, disposition, ...(reads === undefined ? {} : { reads })
  };
}

describe("a second copy of a kept press", () => {
  it("run murwdp4f C9: the 3-Pack press again from the same results page copies step 18", () => {
    const steps = [
      press(1, "t1212", RESULTS, PRODUCT),
      { ...press(2, "t1378", PRODUCT, RESULTS), actionId: "web.dom.type" },
      press(3, "t1212", RESULTS, PRODUCT, "taken")
    ];
    // Keys written in another order are the same argument.
    steps[2]!.input = { parameters: { target: { handle: "t1212" } }, node: "web.dom.click" };
    expect(automationStudioFlowDraftSecondCopy(steps, steps[2]!)).toBe(steps[0]);
  });

  it("is no copy when the same press starts from another page: + pressed twice", () => {
    const steps = [press(1, "t-plus", "s-qty-1", "s-qty-2"), press(2, "t-plus", "s-qty-2", "s-qty-3", "taken")];
    expect(automationStudioFlowDraftSecondCopy(steps, steps[1]!)).toBeUndefined();
  });

  it("needs both pages known, the same argument, the same resolved form and a kept proposable original", () => {
    const unknown = [press(1, "t1", RESULTS, PRODUCT), press(2, "t1", RESULTS, PRODUCT, "taken")];
    delete unknown[0]!.stateBefore;
    delete unknown[1]!.stateBefore;
    expect(automationStudioFlowDraftSecondCopy(unknown, unknown[1]!)).toBeUndefined();
    const other = [press(1, "t1", RESULTS, PRODUCT), press(2, "t2", RESULTS, PRODUCT, "taken")];
    expect(automationStudioFlowDraftSecondCopy(other, other[1]!)).toBeUndefined();
    const resolved = [press(1, "t1", RESULTS, PRODUCT), press(2, "t1", RESULTS, PRODUCT, "taken")];
    resolved[1]!.ranWith = { node: "web.dom.click", parameters: { selector: "#elsewhere" } };
    expect(automationStudioFlowDraftSecondCopy(resolved, resolved[1]!)).toBeUndefined();
    const neither = [press(1, "t1", RESULTS, PRODUCT), press(2, "t1", RESULTS, PRODUCT, "taken")];
    delete neither[0]!.ranWith;
    delete neither[1]!.ranWith;
    expect(automationStudioFlowDraftSecondCopy(neither, neither[1]!)).toBe(neither[0]);
    const dropped = [press(1, "t1", RESULTS, PRODUCT, "dropped"), press(2, "t1", RESULTS, PRODUCT, "taken")];
    expect(automationStudioFlowDraftSecondCopy(dropped, dropped[1]!)).toBeUndefined();
    const failedOriginal = [{ ...press(1, "t1", RESULTS, PRODUCT), effectApplied: false }, press(2, "t1", RESULTS, PRODUCT, "taken")];
    expect(automationStudioFlowDraftSecondCopy(failedOriginal, failedOriginal[1]!)).toBeUndefined();
    const otherTool = [press(1, "t1", RESULTS, PRODUCT), { ...press(2, "t1", RESULTS, PRODUCT, "taken"), toolId: "core.other" }];
    expect(automationStudioFlowDraftSecondCopy(otherTool, otherTool[1]!)).toBeUndefined();
  });
});

describe("a second copy of a kept read", () => {
  it("run muq4oaof cause 3: a second read of the same list with nothing kept changing it between copies the first", () => {
    const steps = [read(1, "list-requests"), press(2, "t9", RESULTS, RESULTS, "taken"), read(3, "list-requests", "taken", "other")];
    expect(automationStudioFlowDraftSecondCopy(steps, steps[2]!)).toBe(steps[0]);
  });

  it("is no copy after a kept press between them: a filter, a sort or the next page", () => {
    const steps = [read(1, "list-requests"), press(2, "t-next", RESULTS, PRODUCT), read(3, "list-requests", "taken")];
    expect(automationStudioFlowDraftSecondCopy(steps, steps[2]!)).toBeUndefined();
    // Nor when the read joining comes before the original with a kept press between.
    const earlier = [read(1, "list-requests", "taken"), press(2, "t-next", RESULTS, PRODUCT), read(3, "list-requests")];
    expect(automationStudioFlowDraftSecondCopy(earlier, earlier[0]!)).toBeUndefined();
  });

  it("needs the same defined reads code on both", () => {
    const otherList = [read(1, "list-a"), read(2, "list-b", "taken")];
    expect(automationStudioFlowDraftSecondCopy(otherList, otherList[1]!)).toBeUndefined();
    const unsaid = [read(1, undefined), read(2, undefined, "taken")];
    expect(automationStudioFlowDraftSecondCopy(unsaid, unsaid[1]!)).toBeUndefined();
    const lookOnly = [read(1, "list-a"), { ...read(2, "list-a", "taken"), proposes: false }];
    expect(automationStudioFlowDraftSecondCopy(lookOnly, lookOnly[1]!)).toBeUndefined();
  });
});
