// A wrong answer's whole repair, through the real service, spends from one
// purse, lowered by the Flow's own setting.
//
// A Flow's setting may lower the repair total and never raise it. Each part of a repair
// used to be held to the total on its own -- the re-author build, the build
// again after a failure that may pass, and the patch ladder the repair falls
// back to -- so a Flow set to $0.10 could have its repair spend $0.30.
//
// The provider here never lets a build finish: every decision looks at the page
// again, and every call reports what it cost. Nothing but money ends the repair.
// The result check's own judgement is not part of the repair
// (`recovery/refuted-result/purse.ts` says why), so its calls are counted apart.
//
// Shaped like `repair-replay-chain.test.ts`, which is the chain that succeeds.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioService } from "../../../service.ts";
import { ACTOR, createHarness } from "./repair-purse-harness.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => { tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-t193-purse-")); });
afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("a refuted result's whole repair, through the service", () => {
  it("charges the failed re-author and patch ladder once within a Flow's $0.10", { timeout: 120_000 }, async () => {
    const harness = await createHarness(0.1, tempRoot, services);

    const run = await harness.service.runRuntimeSession({ projectId: harness.projectId, flowId: harness.flowId, llmExecution: { ...ACTOR, intent: "build_and_adapt" } });
    const detail = await harness.service.getFlowRunDetail(harness.projectId, run.runId);
    const reauthor = detail?.metadata?.resultReauthor as { purse?: JsonObject; attempts?: JsonObject[] } | undefined;

    // What the repair's calls reported costing, the result check's apart.
    const repairCalls = harness.calls.filter((call) => call.taskKind !== "loop_verification");
    const repairSpend = repairCalls.reduce((sum, call) => sum + call.costUsd, 0);
    expect(repairCalls).toHaveLength(3);
    expect(repairSpend).toBeCloseTo(0.09, 9);
    expect(repairSpend).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(reauthor?.purse).toMatchObject({ limitUsd: 0.1, spentUsd: 0.09, leftUsd: 0.01 });
    expect(reauthor?.purse?.bound).toBeUndefined();
    expect(reauthor?.attempts).toHaveLength(1);
    expect(reauthor?.attempts?.[0]).toMatchObject({ routed: true, retryable: true, accounting: { estimatedCostUsd: 0.09 } });
    expect(detail?.summary.status).toBe("failed");
    expect(reauthor?.purse?.spentUsd as number).toBeLessThanOrEqual(0.1);
  });
});
