// Withdrawing looks never takes away the tools that finish a candidate. Lane C
// `run-mv0pa79q-ef91811b` (steps 0019, 0021): with looks withdrawn the build was
// offered only `core.run_node` and `core.test_candidate`, because
// `core.submit_candidate` is declared `observe`, and could not submit its Flow.
//
// Nor what a loop asks the model to call, and what is gone is said (t1025). run-mwuuo3zk-75b482b3: the steer at step
// 121 said "your next decision is a call to core.loop_decision" and withdrew looks in the same breath, which took
// core.loop_decision out of the decision schema too, since it is declared `observe`; and from step 308 a node call naming
// the snapshot node was refused with no more than "must be one of" the first few nodes left, never why it was gone.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop/index.ts";
import { automationStudioLlmLoopDecisionTool } from "../../loop-decision/index.ts";
import { automationStudioLlmEvidenceLookWithdrawal } from "../look-withdrawal.ts";

const tool = (toolId: string, effect: "observe" | "mutate"): AutomationStudioLlmEvidenceTool => ({
  toolId,
  description: toolId,
  inputSchema: { type: "object", properties: {} },
  effect
});

const submit = tool("core.submit_candidate", "observe");
const trial = tool("core.test_candidate", "observe");
const look = tool("core.read_page", "observe");
const act = tool("core.click", "mutate");

function withdrawn() {
  const looks = automationStudioLlmEvidenceLookWithdrawal({ enabled: true });
  looks.redirectShown(1);
  expect(looks.askedAgain(2, 0)).toBe(true);
  expect(looks.active(0)).toBe(true);
  return looks;
}

describe("look withdrawal and the candidate finishing tools", () => {
  it("keeps submit and trial on offer and drops other observe tools", () => {
    const offered = withdrawn().offer([submit, trial, look, act], 0).map((entry) => entry.toolId);
    expect(offered).toEqual(["core.submit_candidate", "core.test_candidate", "core.click"]);
  });

  it("does not refuse a submit or trial call, and still refuses another look", () => {
    const looks = withdrawn();
    expect(looks.refuses(submit, {}, 0)).toBe(false);
    expect(looks.refuses(trial, {}, 0)).toBe(false);
    expect(looks.refuses(look, {}, 0)).toBe(true);
  });

  it("offers everything again once an action runs", () => {
    const offered = withdrawn().offer([submit, look], 1).map((entry) => entry.toolId);
    expect(offered).toEqual(["core.submit_candidate", "core.read_page"]);
  });
});

describe("look withdrawal, the loop's own decision, and what the schema says is gone (t1025)", () => {
  const find = tool("core.find_text", "observe");
  const runNode: AutomationStudioLlmEvidenceTool = {
    toolId: "core.run_node", description: "Run a node.", effect: "mutate", actionInputKey: "node",
    inputSchema: { type: "object", properties: { node: { enum: ["lib.output.snapshot", "lib.output.press"], description: "The node's id." }, parameters: { type: "object" } } }
  };
  const seenLooking = () => {
    const looks = automationStudioLlmEvidenceLookWithdrawal({ enabled: true });
    looks.sawLook("core.run_node", "lib.output.snapshot");
    looks.redirectShown(1);
    expect(looks.askedAgain(2, 0)).toBe(true);
    return looks;
  };

  it("keeps core.loop_decision offered, and never refuses a call of it", () => {
    const decide = automationStudioLlmLoopDecisionTool();
    const looks = seenLooking();
    expect(looks.offer([find, runNode, decide], 0).map((entry) => entry.toolId)).toEqual(["core.run_node", "core.loop_decision"]);
    expect(looks.refuses(decide, { decision: "continue" }, 0)).toBe(false);
    expect(looks.refuses(find, { query: "x" }, 0)).toBe(true);
  });

  it("says beside the narrowed node list which nodes are gone and why", () => {
    const offered = seenLooking().offer([runNode], 0)[0]!;
    const node = (offered.inputSchema.properties as JsonObject).node as JsonObject;
    expect(node.enum).toEqual(["lib.output.press"]);
    expect(node.description).toBe("The node's id. Not offered now, because each only looked and looks are withdrawn until an action runs: lib.output.snapshot.");
  });
});
