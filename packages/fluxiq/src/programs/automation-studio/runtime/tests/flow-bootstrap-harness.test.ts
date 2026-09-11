import { describe, expect, it, vi } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../nodes/index.ts";
import type { AutomationStudioFlowInstruction } from "../../model/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../llm-harness.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../flow-bootstrap.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [] as string[], permissions: [] as string[] };

function nodeDefinition(): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: "domain.demo.start",
    version: "1.0.0",
    label: "Start",
    description: "Starts deterministic work.",
    category: "flow",
    source: { kind: "importer", domainId: "demo", implementationKey: "demo.start" },
    availability: { kind: "domain", domainId: "demo" },
    capabilities: { executable: true },
    inputs: [],
    outputs: [{ id: "done", label: "Done", valueType: "boolean" }],
    parameters: []
  };
}

function instruction(overrides: Partial<AutomationStudioFlowInstruction> = {}): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1",
    instructionId: "instruction.flow",
    title: "Build the flow",
    body: "Start the deterministic task and report completion.",
    scope: { kind: "flow", projectId: "project.one", flowId: "flow.one" },
    priority: 100,
    status: "active",
    requirement: "required",
    tags: ["generation"],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

function plan(): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [{ key: "start", definitionId: "domain.demo.start", definitionVersion: "1.0.0" }],
      edges: []
    }]
  };
}

describe("Automation Studio flow_bootstrap LLM harness", () => {
  it("packs only effective active instructions and the filtered compact catalog", async () => {
    const runTask = vi.fn(async (request: AutomationStudioLlmTaskRequest) => {
      expect(request.expectedOutput).toBe("flow_bootstrap");
      expect(request.promptVersion).toBe("automation-studio.flow-bootstrap.v1");
      expect(request.context.instructions.instructionIds).toEqual(["instruction.flow"]);
      expect(request.context.instructions.instructions[0]).toMatchObject({ truncated: true });
      expect(request.context.flowBootstrap?.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.start"]);
      expect(JSON.stringify(request.context.flowBootstrap?.outputSchema)).not.toMatch(/recording|timeline/i);
      return {
        response: { kind: "flow_bootstrap", summary: "Create one primary Subflow.", plan: plan() },
        usage: { inputTokens: 400, outputTokens: 200, totalTokens: 600 }
      };
    });
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "test", model: "test" }, runTask };
    const result = await runAutomationStudioLlmHarness({
      taskKind: "flow_bootstrap",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [instruction({ body: "Build deterministic work. ".repeat(1_000) }), instruction({ instructionId: "inactive", status: "disabled" })],
      tokenBudget: 128,
      flowBootstrap: { registry: new AutomationStudioNodeRegistry([nodeDefinition()]), resolution },
      provider,
      tokenLimits: { maxInputTokens: 4_000, maxOutputTokens: 1_000, maxTotalTokens: 5_000 },
      maxEstimatedCostUsd: 0.25,
      timeoutMs: 20_000
    });
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.response).toMatchObject({ kind: "flow_bootstrap", plan: { schemaVersion: "0.1" } });
    expect(result.intervention.structuredResult).toMatchObject({ kind: "flow_bootstrap", subflowCount: 1, nodeCount: 1, edgeCount: 0 });
  });

  it("fails before provider invocation without effective instructions or registry context", async () => {
    const runTask = vi.fn();
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "test", model: "test" }, runTask };
    const result = await runAutomationStudioLlmHarness({
      taskKind: "flow_bootstrap",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [instruction({ status: "disabled" })],
      provider,
      tokenLimits: { maxInputTokens: 2_000, maxOutputTokens: 512, maxTotalTokens: 3_000 }
    });
    expect(result.ok).toBe(false);
    expect(runTask).not.toHaveBeenCalled();
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "bootstrap.registry_context_missing",
      "bootstrap.instructions_missing"
    ]));
  });

  it("rejects a structurally valid provider plan when a definition is unavailable", async () => {
    const invalid = plan();
    invalid.subflows[0]!.nodes[0]!.definitionId = "domain.demo.missing";
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "test", model: "test" },
      runTask: async () => ({
        response: { kind: "flow_bootstrap", summary: "Invalid node.", plan: invalid },
        usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 }
      })
    };
    const result = await runAutomationStudioLlmHarness({
      taskKind: "flow_bootstrap",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [instruction()],
      flowBootstrap: { registry: new AutomationStudioNodeRegistry([nodeDefinition()]), resolution },
      provider,
      tokenLimits: { maxInputTokens: 2_000, maxOutputTokens: 512, maxTotalTokens: 3_000 }
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain("bootstrap.definition_unavailable");
  });
});
