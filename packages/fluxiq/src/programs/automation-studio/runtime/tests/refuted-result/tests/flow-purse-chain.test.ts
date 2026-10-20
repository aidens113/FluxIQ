// @fluxiq-test-group real-sql
// A Lab-scoped run of a Flow, through the real service, draws on the Flow's
// one purse (t438). The user's words (2026-10-01): "bring the ceiling down to
// $0.1 per flow max": the build, its re-authors, its repairs and the judge all
// count against one ceiling. Here the chat's reading and the Flow's creation
// left $0.05 of the Flow's $0.10, so the run's repair is handed only that, and
// every call the run makes is added to the Flow's record as it settles.
//
// The world is `repair-purse-chain.test.ts`'s: a Flow whose answer is always
// refuted and a model that never finishes a repair build, $0.03 a call.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioFlowBootstrapCreationSpendStore } from "../../../service/index.ts";
import { ACTOR, createHarness } from "./repair-purse-harness.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-t438-flow-purse-"));
  vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_SCOPE", "test");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/** The service's own record of what the Flow has spent: read from the store, which no public endpoint serves. */
function flowRecord(service: AutomationStudioService): AutomationStudioFlowBootstrapCreationSpendStore {
  return (service as unknown as { creationSpends: AutomationStudioFlowBootstrapCreationSpendStore }).creationSpends;
}

describe("a Lab-scoped run of a Flow, through the service", () => {
  it("hands the repair only what the Flow left, and adds every call of the run to the Flow's record", { timeout: 120_000 }, async () => {
    const harness = await createHarness(0.1, tempRoot, services);

    // The chat's reading of "run it", standing in for everything the Flow spent before: $0.05.
    const run = await harness.service.runRuntimeSession({ projectId: harness.projectId, flowId: harness.flowId, llmExecution: { ...ACTOR, intent: "build_and_adapt" }, interpretationCostUsd: 0.05 });
    const detail = await harness.service.getFlowRunDetail(harness.projectId, run.runId);
    const purse = (detail?.metadata?.resultReauthor as { purse?: JsonObject } | undefined)?.purse;

    const runSpend = harness.calls.reduce((sum, call) => sum + call.costUsd, 0);
    expect(runSpend).toBeGreaterThan(0);
    // Without the Flow's purse the repair spent $0.09 (`repair-purse-chain.test.ts`): here it had only $0.05.
    expect(runSpend).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(purse).toMatchObject({ limitUsd: 0.1, carriedUsd: 0.05 });
    expect(purse?.spentUsd as number).toBeCloseTo(0.05 + runSpend, 9);
    // Every call the run made is in the Flow's record, beside the reading: the Flow's one figure.
    const recorded = await flowRecord(harness.service).get(harness.projectId, harness.flowId);
    expect(recorded?.spentUsd).toBeCloseTo(0.05 + runSpend, 9);
    expect(recorded?.spentUsd as number).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it("asks no model in the run once the Flow has spent its ceiling", { timeout: 120_000 }, async () => {
    const harness = await createHarness(0.1, tempRoot, services);
    await harness.service.runRuntimeSession({ projectId: harness.projectId, flowId: harness.flowId, llmExecution: { ...ACTOR, intent: "build_and_adapt" }, interpretationCostUsd: 0.1 });
    expect(harness.calls.filter((call) => call.taskKind !== "loop_verification")).toHaveLength(0);
    expect((await flowRecord(harness.service).get(harness.projectId, harness.flowId))?.spentUsd).toBe(0.1);
  });
});
