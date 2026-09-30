// A build is held to the run's $0.25 cost ceiling from what each decision
// reports having cost.
//
// The user's rule: a build's total defaults to $0.25, and a Flow's own setting
// may lower it but never raise it. Before, a new Flow's settings carried $1 and
// the resolver's default total was $2, and the Flow's figure won, so a build
// whose model never finished went on paying well past a quarter.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, mockProvider, plan, rejectedGenerationDiagnostic } from "./fixtures.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

describe("a build's cost ceiling", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-cost-ceiling-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((instance) => instance.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("stops a build that never finishes at the ceiling, names cost as its bound, and spends no more than $0.25", async () => {
    const costPerCall = 0.03;
    const requests: AutomationStudioLlmTaskRequest[] = [];
    // A model that keeps looking while it may, and whose completions are
    // refused once only completing is offered: nothing but the budget ends it.
    const provider = mockProvider(async (request) => {
      requests.push(request);
      const loop = request.context.evidenceLoop;
      const iteration = loop?.iteration ?? 0;
      const decision = loop?.tools.length
        ? { kind: "tool_call", callId: `call.${requests.length}`, toolId: "inspect", input: { area: `area.${requests.length}` } }
        : { kind: "complete", result: { summary: "Unfinished.", plan: { ...plan(), subflows: [] } } };
      return { response: { kind: "evidence_tool_decision", summary: `Decision ${iteration}.`, decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: costPerCall } };
    });
    // The host's own resolver defaults (`llm/session-key-provider.ts`).
    const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
    const instance = new AutomationStudioService({
      dataDir: tempRoot,
      llmProviderResolver: (() => ({ provider, tokenLimits: { ...defaults.tokenLimits }, timeoutMs: defaults.timeoutMs, maxEstimatedCostUsd: defaults.maxEstimatedCostUsd, maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd })) as never,
      llmEvidenceRuntime: {
        domainId: "test.domain",
        deniedEvidenceKeys: [],
        tools: [{ toolId: "inspect", description: "Inspect one area.", inputSchema: { type: "object" }, effect: "observe" }],
        executeTool: async (input) => ({ area: String(input.value.area) })
      }
    });
    services.add(instance);
    const { project, flow } = await blankFixture(instance);

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true }));

    expect(diagnostic.evidenceLoop?.exhausted).toMatchObject({ bound: "budget", budgetBound: "cost" });
    // What the provider was actually paid for, every call of the build counted.
    const spent = requests.length * costPerCall;
    expect(spent).toBeLessThanOrEqual(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD);
    expect(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD).toBe(0.25);
    // And it stopped on money, not long before it: a decision's worth held back
    // for the calls the loop cannot see, and one more it would not fit.
    expect(spent).toBeGreaterThan(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD - 3 * costPerCall);
    expect(diagnostic.accounting?.estimatedCostUsd).toBeLessThanOrEqual(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD);
  });
});
