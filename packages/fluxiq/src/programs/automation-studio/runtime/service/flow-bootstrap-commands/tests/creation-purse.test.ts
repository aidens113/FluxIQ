// What a Flow's creation leaves behind when it ends (t438). Outside the Lab
// its spend record goes with it. In a Lab-scoped run the record is the Flow's
// whole purse -- the user's words (2026-10-01): "bring the ceiling down to $0.1
// per flow max" -- so the build runs under it, the chat's reading is counted
// in it, and it outlives the creation for the Flow's runs to draw on.
import { describe, expect, it } from "vitest";
import { automationStudioLlmBuildPurseHoldCall, automationStudioLlmCurrentFlowPurse } from "../../../llm/build-purse/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore, AutomationStudioFlowPaths, AutomationStudioProjectPaths, type AutomationStudioProjectStore } from "../../index.ts";
import { automationStudioFlowBootstrapCreationPurse } from "../creation-purse.ts";

const PROJECT = "project.one";
const FLOW = "flow.one";

async function store(spentUsd: number): Promise<AutomationStudioFlowBootstrapCreationSpendStore> {
  const projectPaths = new AutomationStudioProjectPaths(undefined);
  const held = new AutomationStudioFlowBootstrapCreationSpendStore(projectPaths, new AutomationStudioFlowPaths(projectPaths), {} as unknown as AutomationStudioProjectStore);
  await held.save({ kind: "flow_creation_spend", projectId: PROJECT, flowId: FLOW, spentUsd, builds: 1, createdAt: 1, updatedAt: 1 });
  return held;
}

/** One call through the harness's hold, charged `costUsd`. */
function call(costUsd: number): void {
  const held = automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: () => costUsd }, estimatedInputTokens: 1000, maxOutputTokens: 100 });
  if (held?.ok) held.hold.settle({ estimatedCostUsd: costUsd });
}

describe("a Flow creation that ended", () => {
  it("takes its spend record with it outside the Lab", async () => {
    const held = await store(0.03);
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: held, projectId: PROJECT, flowId: FLOW, repair: false, flowPurse: false, interpretationCostUsd: 0.001, ceilingUsd: 1 });
    await creation.run(async () => {
      expect(automationStudioLlmCurrentFlowPurse()).toBeUndefined();
      creation.ended();
    });
    expect(await held.get(PROJECT, FLOW)).toBeUndefined();
  });

  it("in a Lab-scoped run counts the chat's reading, runs under the Flow's purse, and keeps the record with every call in it", async () => {
    const held = await store(0.03);
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: held, projectId: PROJECT, flowId: FLOW, repair: false, flowPurse: true, interpretationCostUsd: 0.001, ceilingUsd: 0.1 });
    expect(creation.purse.carriedUsd).toBe(0.031);
    await creation.run(async () => {
      expect(automationStudioLlmCurrentFlowPurse()).toBeDefined();
      call(0.02);
      creation.ended();
    });
    expect(await held.get(PROJECT, FLOW)).toMatchObject({ spentUsd: 0.051, builds: 2, createdAt: 1 });
    expect(creation.purse.spentUsd()).toBeCloseTo(0.051, 9);
  });

  it("never reads or writes the record for a repair's build outside the Lab", async () => {
    const held = await store(0.03);
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: held, projectId: PROJECT, flowId: FLOW, repair: true, flowPurse: false, ceilingUsd: 1 });
    await creation.run(async () => {
      call(0.02);
    });
    expect(creation.purse.spentUsd()).toBe(0.02);
    expect(await held.get(PROJECT, FLOW)).toMatchObject({ spentUsd: 0.03, builds: 1 });
  });
});
