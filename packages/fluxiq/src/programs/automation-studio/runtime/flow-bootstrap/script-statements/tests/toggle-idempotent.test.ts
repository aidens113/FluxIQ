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
  it("grounds a chosen state by handle or the whole resolved target, and gives every other step nothing", () => {
    const input = plan([
      { key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "#x" }, ensureState: { state: "first" } } },
      { key: "b", consequences: ["modify_existing"], parameters: { target: { frame: 0, selector: "#a" }, ensureState: { state: "first" } } },
      { key: "c", definitionId: "domain.demo.other", consequences: ["modify_existing"], parameters: { target: { selector: "#a", frame: 0 } } }
    ]);
    const result = automationStudioFlowPlanToggleSteps({
      plan: input,
      handleViews: [{ node: "primary.a", handle: "t1" }],
      explored: [press({ signature: { state: "first" } }), press()]
    });
    expect(result.issues).toEqual([]);
    expect(nodesOf(result)).toEqual([
      { target: { selector: "#x" }, ensureState: { state: "first" } },
      { target: { frame: 0, selector: "#a" }, ensureState: { state: "first" } },
      // Another node than the press ran: not tied to it.
      { target: { selector: "#a", frame: 0 } }
    ]);
    // A new plan; the one passed in is unchanged.
    expect(input.subflows[0]!.nodes[0]!.parameters).toEqual({ target: { selector: "#x" }, ensureState: { state: "first" } });
  });

  // t792: a notes board's "Pin"/"Unpin" control, pressed once to pin, then once more by mistake while exploring.
  it("preserves an explicitly chosen state through same-control reversals", () => {
    const pinned = { via: "name", gains: ["unpin"], loses: ["pin"] };
    const unpinned = { via: "name", gains: ["pin"], loses: ["unpin"] };
    const step = plan([{ key: "pin", consequences: ["modify_existing"], parameters: { target: { selector: "#note-3 .pin" }, ensureState: pinned } }]);
    const handleViews = [{ node: "primary.pin", handle: "t7" }];
    const pin = press({ handles: ["t7"], target: { selector: "#note-3 .pin" }, signature: pinned });
    // Neither a reversal nor a later reversed trial replaces the explicit choice.
    const reversal = press({ handles: ["t7"], target: { selector: "#note-3 .pin" }, signature: unpinned });
    const trialPass: AutomationStudioExploredToggle = { node: "domain.demo.press", handles: [], trialNodes: ["node.bootstrap.b1.primary.pin"], trialParameters: { target: { selector: "#note-3 .pin" } }, signature: unpinned };
    for (const explored of [[pin, reversal], [pin, reversal, trialPass], [pin, trialPass]]) {
      expect(nodesOf(automationStudioFlowPlanToggleSteps({ plan: step, handleViews, explored })), JSON.stringify(explored)).toEqual([{ target: { selector: "#note-3 .pin" }, ensureState: pinned }]);
    }
  });

  // t799: a node that takes `ensureState` is given it instead (`./toggle-idempotent-trial-pass.test.ts`).
  it("refuses the step at its node's path when the press named a node that sets the state and its own node cannot take one, saying nothing of any site", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "#a", frame: 0 } } }]), explored: [press({ idempotentWith: "domain.demo.set_state" })], takesEnsureState: () => false });
    expect(result.issues).toEqual([{ severity: "error", code: "candidate.toggle_not_idempotent", path: "plan.subflows.0.nodes.0", message: expect.stringContaining("node domain.demo.set_state") }]);
    expect(result.issues[0]!.message).not.toMatch(/cart|basket|like|save|job|checkout|address|follow/iu);
  });

  it("refuses a written ensureState with no tied observation instead of keeping or replacing it", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "#a" }, ensureState: { state: "made.up" } } }]), explored: [] });
    expect(nodesOf(result)).toEqual([{ target: { selector: "#a" } }]);
    expect(result.issues).toMatchObject([{ code: "candidate.toggle_state_unobserved" }]);
  });

  it("never injects an unsupported written state outside the grounding path", () => {
    for (const consequences of [[], ["create_new"], ["modify_existing", "delete"]]) {
      const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "a", consequences, parameters: { target: { selector: "#ordinary" }, ensureState: { state: "made.up" } } }]), explored: [] });
      expect(result.issues).toEqual([]);
      expect(nodesOf(result)).toEqual([{ target: { selector: "#ordinary" } }]);
    }
    const unsupported = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "#ordinary" }, ensureState: { state: "made.up" } } }]), explored: [], takesEnsureState: () => false });
    expect(unsupported.issues).toEqual([]);
    expect(nodesOf(unsupported)).toEqual([{ target: { selector: "#ordinary" } }]);
  });
});

describe("a toggle step tied to its own node's trial (t787)", () => {
  const trialPress = (extra: Partial<AutomationStudioExploredToggle> = {}): AutomationStudioExploredToggle => ({ node: "domain.demo.press", handles: [], trialNodes: ["node.bootstrap.b1.primary.a"], trialParameters: { target: { selector: "$row.link" } }, signature: { state: "s.on" }, ...extra });

  // Three steps written the same: only there does the key decide which one the trial's node was (t792, `../toggle-tie.ts`).
  it("gives ensureState to a step whose only matching press came from a trial pass of the same node, and to no other step", () => {
    const result = automationStudioFlowPlanToggleSteps({
      plan: plan([
        { key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "$row.link" }, ensureState: { state: "s.on" } } },
        { key: "b", consequences: ["modify_existing"], parameters: { target: { selector: "$row.link" } } },
        { key: "aa", consequences: ["modify_existing"], parameters: { target: { selector: "$row.link" } } }
      ]),
      explored: [trialPress()]
    });
    expect(result.issues).toEqual([]);
    expect(nodesOf(result)).toEqual([
      { target: { selector: "$row.link" }, ensureState: { state: "s.on" } },
      { target: { selector: "$row.link" } },
      { target: { selector: "$row.link" } }
    ]);
  });

  it("refuses such a step when the trial's answer named a node that sets the state and its own node cannot take one", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "a", consequences: ["modify_existing"], parameters: { target: { selector: "$row.link" } } }]), explored: [trialPress({ idempotentWith: "domain.demo.set_state" })], takesEnsureState: () => false });
    expect(result.issues).toMatchObject([{ code: "candidate.toggle_not_idempotent", path: "plan.subflows.0.nodes.0" }]);
  });
});
