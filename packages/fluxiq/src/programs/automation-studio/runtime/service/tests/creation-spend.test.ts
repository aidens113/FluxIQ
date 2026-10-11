// A Flow's spend record as the Flow's one purse, in a Lab-scoped run (t438).
// The user's words (2026-10-01): "bring the ceiling down to $0.1 per flow max".
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmBuildPurseHoldCall, automationStudioLlmCurrentFlowPurse } from "../../llm/build-purse/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore, AutomationStudioFlowPaths, AutomationStudioProjectPaths, type AutomationStudioProjectStore } from "../index.ts";

const PROJECT_ID = "project.spend";
const FLOW_ID = "flow.spend";
const projects = { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore;

function storeAt(root: string | undefined, projectStore: AutomationStudioProjectStore = projects): AutomationStudioFlowBootstrapCreationSpendStore {
  const projectPaths = new AutomationStudioProjectPaths(root);
  return new AutomationStudioFlowBootstrapCreationSpendStore(projectPaths, new AutomationStudioFlowPaths(projectPaths), projectStore);
}

/** One call made through the harness's hold, charged `costUsd`. */
function call(costUsd: number) {
  const held = automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: () => costUsd }, estimatedInputTokens: 1000, maxOutputTokens: 100 });
  if (held?.ok) held.hold.settle({ estimatedCostUsd: costUsd });
  return held;
}

describe("a Flow's spend record", () => {
  let tempRoot: string;
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-creation-spend-"));
  });
  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  // Only one adaptive run per project is admitted at a time (`../runtime-session/admission.ts`), so two
  // repairs of one Flow do not run at once; a creation and a run, or two writes of one run, can still overlap.
  it("loses no addition when many are made at once, and storage holds the total", async () => {
    const store = storeAt(tempRoot);
    await Promise.all(Array.from({ length: 25 }, () => store.add(PROJECT_ID, FLOW_ID, 0.001)));
    expect(store.spentNowUsd(PROJECT_ID, FLOW_ID)).toBe(0.025);
    expect((await storeAt(tempRoot).get(PROJECT_ID, FLOW_ID))?.spentUsd).toBe(0.025);
  });

  it("adds every call made under the Flow's purse as it settles, read live, and refuses a call past the ceiling", async () => {
    const store = storeAt(tempRoot);
    await store.add(PROJECT_ID, FLOW_ID, 0.06);
    const refused = await store.withFlowPurse(PROJECT_ID, FLOW_ID, 0.1, async () => {
      expect(call(0.03)?.ok).toBe(true);
      expect(store.spentNowUsd(PROJECT_ID, FLOW_ID)).toBe(0.09);
      return call(0.03);
    });
    expect(refused).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit", metadata: { purse: "flow", ceilingUsd: 0.1 } } });
    expect(refused?.ok === false && refused.diagnostic.message).toContain("The Flow's spending limit of $0.1000");
    expect((await storeAt(tempRoot).get(PROJECT_ID, FLOW_ID))?.spentUsd).toBe(0.09);
  });

  it("runs a nested part under the purse already current, never a second one", async () => {
    const store = storeAt(undefined);
    await store.withFlowPurse(PROJECT_ID, FLOW_ID, 0.1, async () => {
      const outer = automationStudioLlmCurrentFlowPurse();
      await store.withFlowPurse(PROJECT_ID, FLOW_ID, 0.5, async () => {
        expect(automationStudioLlmCurrentFlowPurse()).toBe(outer);
      });
    });
    expect(automationStudioLlmCurrentFlowPurse()).toBeUndefined();
  });

  it("throws a write that failed once the run is over, never drops it", async () => {
    const failing = { ensureProjectStructure: async () => { throw new Error("disk full"); } } as unknown as AutomationStudioProjectStore;
    const store = storeAt(tempRoot, failing);
    await expect(store.withFlowPurse(PROJECT_ID, FLOW_ID, 0.1, async () => call(0.01))).rejects.toThrow("disk full");
  });
});
