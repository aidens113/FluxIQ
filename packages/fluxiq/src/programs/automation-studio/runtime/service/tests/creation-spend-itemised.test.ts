// A Lab-scoped Flow purse itemises what it records (t728): every settled call
// by the phase it was made in, the chat's reading as `chat`, with totals
// beside them -- the accounting the Lab used to rebuild from the step log.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmBuildPurseHoldCall } from "../../llm/build-purse/index.ts";
import { automationStudioLlmStepLogScope } from "../../llm/step-log/index.ts";
import { automationStudioLabFlowPurse } from "../runtime-adaptation/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore, AutomationStudioFlowPaths, AutomationStudioProjectPaths, type AutomationStudioProjectStore } from "../index.ts";

const PROJECT_ID = "project.itemised";
const FLOW_ID = "flow.itemised";
const projects = { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore;

function storeAt(root: string | undefined): AutomationStudioFlowBootstrapCreationSpendStore {
  const projectPaths = new AutomationStudioProjectPaths(root);
  return new AutomationStudioFlowBootstrapCreationSpendStore(projectPaths, new AutomationStudioFlowPaths(projectPaths), projects);
}

/** One call made through the harness's hold, charged `costUsd`, reporting `inputTokens` when given. */
function call(costUsd: number, judge = false, inputTokens?: number): void {
  const held = automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: () => costUsd }, estimatedInputTokens: 1000, maxOutputTokens: 100, ...(judge ? { judge: true } : {}) });
  if (!held?.ok) throw new Error("The call was refused.");
  held.hold.settle({ estimatedCostUsd: costUsd, ...(inputTokens !== undefined ? { inputTokens } : {}) });
}

describe("a Lab-scoped Flow's itemised spend", () => {
  let tempRoot: string;
  let env: Record<string, string>;
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-spend-"));
    // The step-log scope is kept only while the step log is on, as in every Lab run.
    env = { FLUXIQ_LLM_STEP_LOG_DIR: tempRoot };
  });
  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("puts each settled call under the phase it was made in, with totals, and keeps it in storage", async () => {
    const store = storeAt(tempRoot);
    await store.add(PROJECT_ID, FLOW_ID, 0.002, { phase: "chat", calls: 2 });
    await store.withFlowPurse(PROJECT_ID, FLOW_ID, 1, async () => {
      await automationStudioLlmStepLogScope.within({ part: "creation" }, async () => {
        await automationStudioLlmStepLogScope.within({ phase: "read" }, async () => call(0.001), env);
        call(0.01);
        call(0.02);
        call(0.004, true);
      }, env);
      await automationStudioLlmStepLogScope.within({ part: "reauthor" }, async () => {
        call(0.03);
        call(0.005, true);
      }, env);
      // Outside every build: a run, its recovery, its result check.
      call(0.006);
    });

    const expected = {
      calls: 9,
      byPhase: {
        build: { calls: 2, usd: 0.03 },
        read: { calls: 1, usd: 0.001 },
        judge: { calls: 2, usd: 0.009 },
        runtime: { calls: 1, usd: 0.006 },
        reauthor: { calls: 1, usd: 0.03 },
        chat: { calls: 2, usd: 0.002 }
      }
    };
    const recorded = await store.get(PROJECT_ID, FLOW_ID);
    expect(recorded).toMatchObject({ spentUsd: 0.078, ...expected });
    const phases = Object.values(recorded!.byPhase!);
    expect(phases.reduce((sum, item) => sum + item.usd, 0)).toBeCloseTo(recorded!.spentUsd, 9);
    expect(phases.reduce((sum, item) => sum + item.calls, 0)).toBe(recorded!.calls);
    expect(await storeAt(tempRoot).get(PROJECT_ID, FLOW_ID)).toMatchObject({ spentUsd: 0.078, ...expected });
  });

  it("records a run's chat reading as chat calls, and a counted build as no call", async () => {
    const store = storeAt(undefined);
    await automationStudioLabFlowPurse({ store, projectId: PROJECT_ID, flowId: FLOW_ID, interpretationCostUsd: 0.0015, interpretationCalls: 1, labScoped: true }, async () => call(0.01));
    await store.add(PROJECT_ID, FLOW_ID, 0, { build: true });
    expect(await store.get(PROJECT_ID, FLOW_ID)).toMatchObject({
      spentUsd: 0.0115,
      builds: 2,
      calls: 2,
      byPhase: { chat: { calls: 1, usd: 0.0015 }, runtime: { calls: 1, usd: 0.01 }, build: { calls: 0, usd: 0 } }
    });
  });

  it("tallies a project build's calls by the agent role that made them, and keeps the largest input", async () => {
    const store = storeAt(tempRoot);
    await store.add(PROJECT_ID, FLOW_ID, 0.002, { phase: "chat", calls: 1 });
    await store.withFlowPurse(PROJECT_ID, FLOW_ID, 1, async () => {
      await automationStudioLlmStepLogScope.within({ part: "creation" }, async () => {
        await automationStudioLlmStepLogScope.agent({ role: "supervisor" }, async () => call(0.002, false, 14_700), env);
        await automationStudioLlmStepLogScope.agent({ role: "builder", briefId: "brief-1" }, async () => {
          call(0.001, false, 9_000);
          call(0.002, false, 21_000);
        }, env);
        await automationStudioLlmStepLogScope.agent({ role: "builder", briefId: "brief-2" }, async () => call(0.003), env);
        // A call no agent named -- the build's own judge -- is in no role.
        call(0.004, true, 30_000);
      }, env);
    });
    const tallies = { largestInputTokens: 30_000, byRole: { supervisor: { calls: 1, usd: 0.002 }, builder: { calls: 3, usd: 0.006 } } };
    expect(await store.get(PROJECT_ID, FLOW_ID)).toMatchObject({ spentUsd: 0.014, calls: 6, ...tallies });
    expect(await storeAt(tempRoot).get(PROJECT_ID, FLOW_ID)).toMatchObject(tallies);
  });

  it("keeps the largest input null and the roles empty when no call reported either", async () => {
    const store = storeAt(undefined);
    await store.withFlowPurse(PROJECT_ID, FLOW_ID, 1, async () => call(0.01));
    expect(await store.get(PROJECT_ID, FLOW_ID)).toMatchObject({ calls: 1, largestInputTokens: null, byRole: {} });
  });

  it("refuses a call count that is not a whole number", async () => {
    await expect(storeAt(undefined).add(PROJECT_ID, FLOW_ID, 0.01, { phase: "chat", calls: 1.5 })).rejects.toThrow("whole");
  });
});
