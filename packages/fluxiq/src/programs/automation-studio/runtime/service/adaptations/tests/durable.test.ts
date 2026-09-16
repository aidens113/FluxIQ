import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../../../../model/index.ts";
import { AutomationStudioDurableAdaptations } from "../durable.ts";
import type { AutomationStudioAdaptationPatches } from "../patches.ts";

describe("AutomationStudioDurableAdaptations patch dispatch", () => {
  // `edit_recovery` used to be routed to the Flow node applier, which wrote a
  // `recovery` key into the target node's parameters. No node definition
  // declares that parameter and nothing reads it, so the adaptation was recorded
  // as applied while the Flow behaved exactly as before.
  it("refuses an edit_recovery patch instead of handing it to the Flow node applier", async () => {
    const calls: string[] = [];
    const durable = durableAdaptations(calls);

    await expect(durable.applyFlowAdaptationPatchDurably(adaptationFixture(), recoveryPatch(), 30))
      .rejects.toThrow(/edit_recovery/);
    expect(calls).toEqual([]);
  });

  it("still routes the two node patches that map onto parameters the executor reads", async () => {
    const calls: string[] = [];
    const durable = durableAdaptations(calls);

    await durable.applyFlowAdaptationPatchDurably(adaptationFixture(), { kind: "edit_expectation", targetId: "node.action", summary: "Wait longer.", after: { timeoutMs: 9000 } }, 30);
    await durable.applyFlowAdaptationPatchDurably(adaptationFixture(), { kind: "edit_action_target", targetId: "node.action", summary: "Use the new control.", after: { handles: { control: "submit" } } }, 30);

    expect(calls).toEqual(["flow_node:edit_expectation", "flow_node:edit_action_target"]);
  });

  it("refuses every patch kind that has no durable application at all", async () => {
    const calls: string[] = [];
    const durable = durableAdaptations(calls);

    await expect(durable.applyFlowAdaptationPatchDurably(adaptationFixture(), { kind: "edit_instruction", targetId: "instruction.one", summary: "Reword." }, 30))
      .rejects.toThrow(/instruction review surface/);
    await expect(durable.applyFlowAdaptationPatchDurably(adaptationFixture(), { kind: "promote_adaptation", targetId: "adaptation.other", summary: "Promote." }, 30))
      .rejects.toThrow(/Unsupported adaptation patch kind/);
    expect(calls).toEqual([]);
  });
});

function durableAdaptations(calls: string[]): AutomationStudioDurableAdaptations {
  const patches = {
    applyFlowNodeAdaptationPatch: async (_adaptation: AutomationStudioFlowAdaptation, patch: AutomationStudioFlowAdaptation["patch"][number]) => {
      calls.push(`flow_node:${patch.kind}`);
      return {};
    },
    applyRouterAdaptationPatch: async () => { calls.push("router"); return {}; },
    applySubflowAdaptationPatch: async () => { calls.push("subflow"); return {}; },
    applyCreateSubflowAdaptationPatch: async () => { calls.push("create_subflow"); return {}; }
  } as unknown as AutomationStudioAdaptationPatches;
  return new AutomationStudioDurableAdaptations(absent(), absent(), absent(), patches, absent());
}

function recoveryPatch(): AutomationStudioFlowAdaptation["patch"][number] {
  return { kind: "edit_recovery", targetId: "node.action", summary: "Recover by clicking the confirmation control.", after: { actionDefinitionIds: ["builtin.action.click"] } };
}

function adaptationFixture(): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.recovery",
    flowId: "flow.main",
    projectId: "project.recovery",
    trigger: "Action failed; run a confirmation sequence before retrying.",
    patch: [recoveryPatch()],
    status: "validated",
    author: "llm",
    riskLevel: "medium",
    createdAt: 10,
    updatedAt: 20
  };
}

/** A collaborator this dispatch test must never reach. */
function absent<T>(): T {
  return undefined as unknown as T;
}
