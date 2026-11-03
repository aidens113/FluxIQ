import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { automationStudioLlmCurrentFlowPurse } from "../../llm/build-purse/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore } from "../creation-spend.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import { AutomationStudioProjectStore } from "../projects/index.ts";

function charge(): void {
  const purse = automationStudioLlmCurrentFlowPurse();
  if (!purse) throw new Error("The actual Flow purse must be current.");
  const held = purse.hold({ projectedCostUsd: 0.01, estimatedInputTokens: 100, maxOutputTokens: 20 });
  if (!held.ok) throw new Error("The original call must fit.");
  held.hold.settle({ estimatedCostUsd: 0.003 });
}

it("drains every queued write and exposes the original run failure plus distinct commit errors", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-spend-drain-"));
  const paths = new AutomationStudioProjectPaths(root);
  const projects = new AutomationStudioProjectStore(paths);
  const runError = new Error("original run failed");
  const firstError = new Error("first actual commit failed");
  const secondError = new Error("second actual commit failed");
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const called = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  projects.ensureProjectStructure = async () => {
    calls++;
    if (calls === 1) {
      entered();
      await held;
      throw firstError;
    }
    throw secondError;
  };
  const store = new AutomationStudioFlowBootstrapCreationSpendStore(paths, new AutomationStudioFlowPaths(paths), projects);
  try {
    const running = store.withFlowPurse("project.drain", "flow.drain", 0.1, async () => {
      charge();
      charge();
      throw runError;
    });
    const outcome = running.then(() => undefined, error => error);
    await called;
    expect(calls).toBe(1);
    release();
    const error: unknown = await outcome;
    expect(calls).toBe(2);
    if (!(error instanceof AggregateError)) throw new Error("All three actual failures must be exposed.");
    expect(error.errors).toEqual([runError, firstError, secondError]);
    expect(error.cause).toBe(runError);
  } finally {
    release();
    await rm(root, { recursive: true, force: true });
  }
});

it("retains one identical primary error when the awaited settlement and exit drain observe the same write", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-spend-drain-"));
  const paths = new AutomationStudioProjectPaths(root);
  const projects = new AutomationStudioProjectStore(paths);
  const error = new Error("one original commit failed");
  let calls = 0;
  projects.ensureProjectStructure = async () => {
    calls++;
    throw error;
  };
  const store = new AutomationStudioFlowBootstrapCreationSpendStore(paths, new AutomationStudioFlowPaths(paths), projects);
  try {
    await expect(store.withFlowPurse("project.drain", "flow.drain", 0.1, async () => {
      const purse = automationStudioLlmCurrentFlowPurse();
      if (!purse) throw new Error("The original Flow purse is required.");
      const held = purse.hold({ projectedCostUsd: 0.01, estimatedInputTokens: 100, maxOutputTokens: 20 });
      if (!held.ok || !held.hold.settleObserved) throw new Error("The original call must support settlement.");
      await held.hold.settleObserved({ estimatedCostUsd: 0.003 });
    })).rejects.toBe(error);
    expect(calls).toBe(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
