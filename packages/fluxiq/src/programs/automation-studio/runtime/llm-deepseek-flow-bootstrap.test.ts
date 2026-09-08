import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
  type AutomationStudioFlowBootstrapPlan
} from "./flow-bootstrap.ts";
import type { AutomationStudioLlmTaskRequest } from "./llm-harness.ts";
import { createAutomationStudioDeepSeekProvider, estimateAutomationStudioDeepSeekInputTokens } from "./llm-deepseek-provider.ts";
import { AutomationStudioLlmProviderError } from "./llm-provider-contract.ts";

describe("Automation Studio DeepSeek flow_bootstrap transport", () => {
  it("maps the task to flow_bootstrap and sends the exact compact schema without recording context", async () => {
    let outboundBody = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => {
        outboundBody = input.outboundBody;
        return "test-secret";
      },
      fetchImpl: (async () => envelope({ kind: "flow_bootstrap", summary: "Build one primary Subflow.", plan: bootstrapPlan() })) as typeof fetch
    });

    const request = bootstrapRequest();
    request.tokenLimits = { maxInputTokens: 2_000, maxOutputTokens: 512, maxTotalTokens: 3_000 };
    expect(estimateAutomationStudioDeepSeekInputTokens(request)).toBeLessThanOrEqual(2_000);
    const result = await provider.runTask(request) as { response: unknown };
    const body = JSON.parse(outboundBody) as { messages: Array<{ role: string; content: string }> };
    const user = JSON.parse(body.messages.find((message) => message.role === "user")!.content) as Record<string, unknown>;

    expect(user).toMatchObject({
      taskKind: "flow_bootstrap",
      expectedOutput: "flow_bootstrap",
      outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA
    });
    expect(JSON.stringify(user)).not.toMatch(/recording|timeline/i);
    expect(result.response).toMatchObject({ kind: "flow_bootstrap", plan: { schemaVersion: "0.1" } });
  });

  it("rejects an outbound bootstrap payload exceeding the estimated token budget before resolving the secret", async () => {
    let secretCalls = 0;
    const request = bootstrapRequest();
    request.context.instructions.instructions[0]!.body = "x".repeat(12_000);
    request.tokenLimits = { maxInputTokens: 2_000, maxOutputTokens: 512, maxTotalTokens: 3_000 };
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secretCalls += 1; return "test-secret"; },
      fetchImpl: (async () => { throw new Error("transport must not run"); }) as typeof fetch
    });

    await expect(provider.runTask(request)).rejects.toMatchObject({ code: "llm.provider_configuration_invalid" });
    expect(secretCalls).toBe(0);
  });

  it("rejects a catalog with missing required instruction vocabulary before resolving the secret", async () => {
    let secretCalls = 0;
    const request = bootstrapRequest();
    request.context.flowBootstrap!.catalogSelection.missingRequiredTerms = ["select"];
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secretCalls += 1; return "test-secret"; },
      fetchImpl: (async () => { throw new Error("transport must not run"); }) as typeof fetch
    });

    await expect(provider.runTask(request)).rejects.toMatchObject({ code: "llm.provider_configuration_invalid" });
    expect(secretCalls).toBe(0);
  });
  it.each([
    ["extra response field", { kind: "flow_bootstrap", summary: "Invalid.", plan: bootstrapPlan(), riskLevel: "low" }],
    ["extra plan field", { kind: "flow_bootstrap", summary: "Invalid.", plan: { ...bootstrapPlan(), recordingId: "forbidden" } }],
    ["wrong response kind", { kind: "change_proposal", summary: "Invalid.", plan: bootstrapPlan() }]
  ])("rejects %s at the provider parse boundary", async (_name, response) => {
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "test-secret",
      fetchImpl: (async () => envelope(response)) as typeof fetch
    });

    await expect(provider.runTask(bootstrapRequest())).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
  });

  it("rejects a catalog with missing required instruction vocabulary before resolving the secret", async () => {
    let secretCalls = 0;
    const request = bootstrapRequest();
    request.context.flowBootstrap!.catalogSelection.missingRequiredTerms = ["select"];
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secretCalls += 1; return "test-secret"; },
      fetchImpl: (async () => { throw new Error("transport must not run"); }) as typeof fetch
    });

    await expect(provider.runTask(request)).rejects.toMatchObject({ code: "llm.provider_configuration_invalid" });
    expect(secretCalls).toBe(0);
  });
  it.each(["recordingId", "timelineEvents"])("rejects forbidden bootstrap context field %s before secret resolution", async (field) => {
    let secretCalls = 0;
    const request = bootstrapRequest();
    (request.context as unknown as Record<string, unknown>)[field] = [];
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secretCalls += 1; return "test-secret"; },
      fetchImpl: (async () => { throw new Error("transport must not run"); }) as typeof fetch
    });

    await expect(provider.runTask(request)).rejects.toMatchObject({ code: "llm.provider_configuration_invalid" });
    expect(secretCalls).toBe(0);
  });

  it("rejects mapping flow_bootstrap to change_proposal before secret resolution", async () => {
    let secretCalls = 0;
    const request = bootstrapRequest();
    request.expectedOutput = "change_proposal";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secretCalls += 1; return "test-secret"; },
      fetchImpl: (async () => { throw new Error("transport must not run"); }) as typeof fetch
    });

    await expect(provider.runTask(request)).rejects.toBeInstanceOf(AutomationStudioLlmProviderError);
    expect(secretCalls).toBe(0);
  });
});

function bootstrapRequest(): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.bootstrap",
    idempotencyKey: "idempotency.bootstrap",
    timeoutMs: 20_000,
    estimatedInputTokens: 1_000,
    taskKind: "flow_bootstrap",
    promptVersion: "automation-studio.flow-bootstrap.v1",
    expectedOutput: "flow_bootstrap",
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 512, maxTotalTokens: 9_000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind: "flow_bootstrap",
      promptVersion: "automation-studio.flow-bootstrap.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: {
        instructions: [{
          instructionId: "instruction.one",
          scopeKind: "flow",
          title: "Build",
          body: "Build the deterministic task.",
          priority: 100,
          requirement: "required",
          tags: ["generation"]
        }],
        instructionIds: ["instruction.one"],
        diagnostics: [],
        tokenBudget: 2_000,
        estimatedTokens: 20
      },
      flowBootstrap: {
        outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
        nodeCatalog: [{
          id: "builtin.data.constant",
          version: "1.0.0",
          label: "Constant",
          description: "Provides a constant value.",
          category: "data",
          capabilities: ["executable"],
          inputs: [],
          outputs: [{ id: "value", type: "any" }],
          parameters: [{ id: "value", type: "json" }]
        }],
        catalogTruncated: false,
        catalogSelection: { byteBudget: 4_096, usedBytes: 256, requiredTerms: [], missingRequiredTerms: [] }
      }
    }
  };
}

function bootstrapPlan(): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [{ key: "constant", definitionId: "builtin.data.constant", definitionVersion: "1.0.0", parameters: { value: true } }],
      edges: []
    }]
  };
}

function envelope(content: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }
  }), { status: 200, headers: { "content-type": "application/json" } });
}
