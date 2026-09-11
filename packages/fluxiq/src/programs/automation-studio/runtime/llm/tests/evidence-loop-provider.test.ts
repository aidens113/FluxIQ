import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmTaskRequest } from "../harness.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../evidence-loop.ts";
import { createAutomationStudioDeepSeekProvider, estimateAutomationStudioDeepSeekInputTokens } from "../deepseek-provider.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA, type AutomationStudioFlowBootstrapCatalogEntry } from "../../flow-bootstrap/index.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const completionSchema = { type: "object" };
const evidenceLoop = {
  iteration: 1,
  tools,
  evidence: [] as Array<{ callId: string; toolId: string; value: never }>,
  decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema),
  completionSchema,
  canComplete: true
};

describe("Automation Studio evidence-loop provider task", () => {
  it("packs and validates an allowlisted evidence tool decision", async () => {
    const result = await runAutomationStudioLlmHarness({
      taskKind: "evidence_tool_decision",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [],
      evidenceLoop,
      provider: {
        metadata: { provider: "mock", model: "schema" },
        runTask: async () => ({ response: { kind: "evidence_tool_decision", summary: "Inspect once.", decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} } } })
      }
    });
    expect(result).toMatchObject({ ok: true, response: { kind: "evidence_tool_decision", decision: { kind: "tool_call", toolId: "inspect" } } });
    expect(result.request.context.evidenceLoop).toEqual(evidenceLoop);
    expect(result.intervention.structuredResult).toEqual({ kind: "evidence_tool_decision", decisionKind: "tool_call", toolId: "inspect" });
  });

  it("sends the strict dynamic decision schema through DeepSeek and parses completion", async () => {
    let outbound = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => { outbound = input.outboundBody; return "test-secret"; },
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "evidence_tool_decision", summary: "Enough evidence.", decision: { kind: "complete", result: { candidateId: "candidate.1" } } }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    });
    const response = await provider.runTask(request()) as { response: unknown };
    const body = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
    const systemPrompt = body.messages.find((message) => message.role === "system")!.content;
    const userPayload = body.messages.find((message) => message.role === "user")!.content;
    const payload = JSON.parse(userPayload) as {
      outputSchema: { properties: { decision: { oneOf: Array<{ properties: { kind: { const: string } } }> } } };
      context: { evidenceLoop: { tools: Array<Record<string, unknown>> } };
    };
    expect(systemPrompt).toContain("current authoritative results of prior tool calls");
    expect(systemPrompt).toContain("produce the final structured result, not to execute the workflow");
    expect(systemPrompt).toContain("Complete immediately once current evidence is sufficient");
    expect(systemPrompt).toContain("When the decision schema offers a complete variant, evaluate it first");
    expect(systemPrompt).toContain("Do not select a tool merely because one remains available");
    expect(systemPrompt).toContain("prefer observation over mutation");
    expect(systemPrompt).toContain("only when its state change is necessary to reveal otherwise unavailable evidence");
    expect(systemPrompt).toContain("Never mutate merely to perform an eventual workflow step");
    expect(systemPrompt).toContain("never repeat a successful mutation merely to try another eventual-workflow value");
    expect(systemPrompt).toContain("Never repeat the same toolId with the same input");
    expect(systemPrompt).toContain("Repeating an observation with different parameters is not progress");
    expect(systemPrompt).toContain("Do not call a mutating tool merely to unlock another observation");
    expect(systemPrompt).toContain("recoverable tool result shaped like {ok:false,code:string}");
    expect(payload.outputSchema).toMatchObject({ properties: { kind: { const: "evidence_tool_decision" }, decision: evidenceLoop.decisionSchema } });
    expect(payload.outputSchema.properties.decision.oneOf.map((variant) => variant.properties.kind.const)).toEqual(["complete", "tool_call"]);
    expect(userPayload.indexOf('\"kind\":{\"const\":\"complete\"}')).toBeLessThan(userPayload.indexOf('\"tools\"'));
    expect(payload.context.evidenceLoop.tools).toEqual([{ toolId: "inspect", description: "Collect bounded evidence." }]);
    expect(response.response).toEqual({ kind: "evidence_tool_decision", summary: "Enough evidence.", decision: { kind: "complete", result: { candidateId: "candidate.1" } } });
  });

  it("rejects altered decision schemas before secret resolution", async () => {
    let secrets = 0;
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secrets += 1; return "test-secret"; },
      fetchImpl: (async () => { throw new Error("must not run"); }) as typeof fetch
    });
    const altered = request({ context: { ...request().context, evidenceLoop: { ...evidenceLoop, decisionSchema: { type: "object" } } } });
    await expect(provider.runTask(altered)).rejects.toMatchObject({ code: "llm.provider_configuration_invalid" });
    expect(secrets).toBe(0);
  });

  it("accepts historic evidence from a tool omitted from the current eligible schema", async () => {
    const eligibleTools = [{ toolId: "act", description: "Perform a bounded mutation.", inputSchema: { type: "object" }, effect: "mutate" as const }];
    const currentLoop = {
      iteration: 2,
      tools: eligibleTools,
      evidence: [{ callId: "call.inspect.1", toolId: "inspect", value: { observed: true } }],
      decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(eligibleTools, completionSchema, true),
      completionSchema,
      canComplete: true
    };
    let secrets = 0;
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secrets += 1; return "test-secret"; },
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "evidence_tool_decision", summary: "Act next.", decision: { kind: "tool_call", callId: "call.act.1", toolId: "act", input: {} } }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    });
    await expect(provider.runTask(request({ context: { ...request().context, evidenceLoop: currentLoop } }))).resolves.toMatchObject({
      response: { kind: "evidence_tool_decision", decision: { toolId: "act" } }
    });
    expect(secrets).toBe(1);
  });

  it("accepts a completion-only decision after the initial observation removes the last eligible tool", async () => {
    const completionOnlyLoop = {
      iteration: 1,
      tools: [],
      evidence: [{ callId: "initial.inspect", toolId: "inspect", value: { observed: true } }],
      decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema([], completionSchema, true),
      completionSchema,
      canComplete: true
    };
    let outbound = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => { outbound = input.outboundBody; return "test-secret"; },
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "evidence_tool_decision", summary: "Initial evidence is sufficient.", decision: { kind: "complete", result: { candidateId: "candidate.1" } } }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    });

    await expect(provider.runTask(request({ context: { ...request().context, evidenceLoop: completionOnlyLoop } }))).resolves.toMatchObject({
      response: { kind: "evidence_tool_decision", decision: { kind: "complete" } }
    });
    const body = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
    const payload = JSON.parse(body.messages.find((message) => message.role === "user")!.content) as { context: { evidenceLoop: { tools: unknown[] } } };
    expect(payload.context.evidenceLoop.tools).toEqual([]);
  });

  it("accepts a production-shaped five-tool evidence context with a native node catalog", async () => {
    const productionTools = [
      { toolId: "web.inspect_current_page", description: "Capture bounded structured evidence from the current browser page.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
      { toolId: "web.navigate_same_origin", description: "Navigate within the current origin.", inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string", maxLength: 2_000 } }, additionalProperties: false } },
      { toolId: "web.click_safe", description: "Click an observed safe control.", inputSchema: { type: "object", required: ["selector"], properties: { selector: { type: "string", maxLength: 500 } }, additionalProperties: false } },
      { toolId: "web.fill_safe", description: "Fill an observed non-sensitive control.", inputSchema: { type: "object", required: ["selector", "text"], properties: { selector: { type: "string", maxLength: 500 }, text: { type: "string", maxLength: 1_000 } }, additionalProperties: false } },
      { toolId: "web.select_safe", description: "Select a value in an observed control.", inputSchema: { type: "object", required: ["selector", "value"], properties: { selector: { type: "string", maxLength: 500 }, value: { type: "string", maxLength: 500 } }, additionalProperties: false } }
    ];
    const completion = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA;
    const nodeCatalog: AutomationStudioFlowBootstrapCatalogEntry[] = Array.from({ length: 12 }, (_, index) => ({
      id: `web.action.${index}`, version: "1.0.0", label: `Action ${index}`,
      description: "Action.", category: "web",
      capabilities: ["exec", "web", "safe", "typed", "input", "output", "action", "domain", "bounded", "runtime", "native", "registered", "a", "b", "c", "d", "e", "f", "g"],
      inputs: [{ id: "input", type: "object", required: true }, { id: "context", type: "object" }],
      outputs: [{ id: "result", type: "object" }, { id: "status", type: "string" }],
      parameters: [
        { id: "selector", type: "string", required: true, constraints: { maxLength: 500 } },
        { id: "timeoutMs", type: "number", defaultValue: 5_000, constraints: { minimum: 0, maximum: 25_000 } },
        { id: "mode", type: "string", options: ["safe", "bounded", "observed", "same_origin"] }
      ]
    }));
    const catalogBytes = Buffer.byteLength(JSON.stringify(nodeCatalog), "utf8");
    expect(catalogBytes).toBeLessThanOrEqual(49_152);
    const pageEvidence = {
      schemaVersion: "web-llm-evidence.v1", trust: "untrusted-page-evidence", location: "https://example.test/products", title: "Products",
      elements: Array.from({ length: 10 }, (_, index) => ({ tag: "button", selector: `[data-product='${index}']`, role: "button", name: `Product ${index}`, text: "Open this bounded product result" })),
      truncated: false
    };
    expect(Buffer.byteLength(JSON.stringify(pageEvidence), "utf8")).toBeGreaterThan(1_200);
    expect(Buffer.byteLength(JSON.stringify(pageEvidence), "utf8")).toBeLessThan(2_000);
    const productionLoop = {
      iteration: 2, tools: productionTools,
      evidence: [{ callId: "call.inspect.1", toolId: "web.inspect_current_page", value: pageEvidence }],
      decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(productionTools, completion, true),
      completionSchema: completion, canComplete: true
    };
    let secretCalls = 0;
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secretCalls += 1; return "test-secret"; },
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "evidence_tool_decision", summary: "Inspect the page.", decision: { kind: "tool_call", callId: "call.inspect.2", toolId: "web.inspect_current_page", input: {} } }) } }],
        usage: { prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100 }
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    });
    const productionRequest = request({
      timeoutMs: 45_000,
      tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 },
      context: {
        ...request().context,
        evidenceLoop: productionLoop,
        flowBootstrap: {
          outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
          nodeCatalog,
          catalogTruncated: false,
          catalogSelection: { byteBudget: 49_152, usedBytes: catalogBytes, requiredTerms: [], missingRequiredTerms: [] }
        }
      }
    });
    expect(Buffer.byteLength(JSON.stringify(completion), "utf8")).toBeLessThan(5_000);
    expect(estimateAutomationStudioDeepSeekInputTokens(productionRequest)).toBeLessThanOrEqual(8_000);
    await expect(provider.runTask(productionRequest)).resolves.toMatchObject({ response: { kind: "evidence_tool_decision" } });
    expect(secretCalls).toBe(1);
  });
});

function request(overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.evidence.1", idempotencyKey: "request.evidence.1", timeoutMs: 20_000,
    estimatedInputTokens: 100, taskKind: "evidence_tool_decision", promptVersion: "automation-studio.evidence-tool-decision.v1",
    expectedOutput: "evidence_tool_decision", tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.25,
    context: { schemaVersion: "0.1", taskKind: "evidence_tool_decision", promptVersion: "automation-studio.evidence-tool-decision.v1", projectId: "project.one", flowId: "flow.one", instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 }, evidenceLoop },
    ...overrides
  };
}
