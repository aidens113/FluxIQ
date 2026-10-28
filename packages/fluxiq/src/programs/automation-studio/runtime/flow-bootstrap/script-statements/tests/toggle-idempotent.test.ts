import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { automationStudioFlowPlanToggleSteps, type AutomationStudioExploredToggle } from "../toggle-idempotent.ts";

// t775: a resolved plan's steps on controls explored as a toggle.

function plan(nodes: Array<{ key: string; definitionId?: string; consequences?: string[]; parameters?: JsonObject }>): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Run", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: nodes.map((node) => ({ definitionId: "domain.demo.press", definitionVersion: "1.0.0", ...node })), edges: [] }]
  } as AutomationStudioFlowBootstrapPlan;
}

const press = (extra: Partial<AutomationStudioExploredToggle> = {}): AutomationStudioExploredToggle => ({ node: "domain.demo.press", handles: ["t1"], target: { selector: "#a", frame: 0 }, signature: { state: "s.on" }, ...extra });
const nodesOf = (result: { plan: AutomationStudioFlowBootstrapPlan }) => result.plan.subflows[0]!.nodes.map((node) => node.parameters);

describe("a toggle step in a resolved plan", () => {
  it("takes the newest matching press, by handle or by the whole resolved target in any key order, and gives every other step nothing", () => {
    const input = plan([
      { key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "#x" } } },
      { key: "b", consequences: ["modify_existing"], parameters: { target: { frame: 0, selector: "#a" } } },
      { key: "c", definitionId: "domain.demo.other", consequences: ["modify_existing"], parameters: { target: { selector: "#a", frame: 0 } } }
    ]);
    const result = automationStudioFlowPlanToggleSteps({
      plan: input,
      handleViews: [{ node: "primary.a", handle: "t1" }],
      explored: [press({ signature: { state: "old" } }), press()]
    });
    expect(result.issues).toEqual([]);
    expect(nodesOf(result)).toEqual([
      { target: { selector: "#x" }, ensureState: { state: "s.on" } },
      { target: { frame: 0, selector: "#a" }, ensureState: { state: "s.on" } },
      // Another node than the press ran: not tied to it.
      { target: { selector: "#a", frame: 0 } }
    ]);
    // A new plan; the one passed in is unchanged.
    expect(input.subflows[0]!.nodes[0]!.parameters).toEqual({ target: { selector: "#x" } });
  });

  it("refuses the step at its node's path when the press named a node that sets the state, saying nothing of any site", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "#a", frame: 0 } } }]), explored: [press({ idempotentWith: "domain.demo.set_state" })] });
    expect(result.issues).toEqual([{ severity: "error", code: "candidate.toggle_not_idempotent", path: "plan.subflows.0.nodes.0", message: expect.stringContaining("node domain.demo.set_state") }]);
    expect(result.issues[0]!.message).not.toMatch(/cart|basket|like|save|job|checkout|address|follow/iu);
  });

  it("takes off an ensureState the model wrote, and ties nothing without an explored press", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "#a" }, ensureState: { state: "made.up" } } }]), explored: [] });
    expect(nodesOf(result)).toEqual([{ target: { selector: "#a" } }]);
  });
});
