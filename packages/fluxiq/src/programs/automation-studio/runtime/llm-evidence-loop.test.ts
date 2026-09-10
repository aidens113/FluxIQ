import { describe, expect, it, vi } from "vitest";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema, runAutomationStudioLlmEvidenceLoop } from "./llm-evidence-loop.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];

describe("Automation Studio LLM evidence loop", () => {
  it("runs allowlisted tools and returns a candidate with sanitized trace accounting", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { scope: "current" }, usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, estimatedCostUsd: 0.001 } })
      .mockResolvedValueOnce({ kind: "complete", result: { candidateId: "candidate.1" }, usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15, estimatedCostUsd: 0.001 } });
    const executeTool = vi.fn().mockResolvedValue({ facts: ["ready"] });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool });

    expect(result).toMatchObject({ ok: true, result: { candidateId: "candidate.1" }, accounting: { iterations: 2, toolCalls: 1, inputTokens: 22, outputTokens: 7, totalTokens: 29, estimatedCostUsd: 0.002 } });
    expect(executeTool).toHaveBeenCalledWith({ callId: "call.1", toolId: "inspect", value: { scope: "current" }, maxEvidenceBytes: 63_488 });
    expect(decide.mock.calls[1]?.[0].evidence).toEqual([{ callId: "call.1", toolId: "inspect", value: { facts: ["ready"] } }]);
    expect(JSON.stringify(result)).not.toContain("scope");
  });

  it("fails closed for unknown tools, duplicate calls, and evidence overflow", async () => {
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide: async () => ({ kind: "tool_call", callId: "call.1", toolId: "navigate", input: {} }), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.unknown_tool" });
    const duplicate = vi.fn().mockResolvedValue({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide: duplicate, executeTool: async () => ({ ok: true }) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.duplicate_call", accounting: { toolCalls: 1 } });
    const repeatedRequest = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1, scope: "current" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "inspect", input: { scope: "current", page: 1 } });
    const repeatedExecute = vi.fn().mockResolvedValue({ ok: true });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide: repeatedRequest, executeTool: repeatedExecute }))
      .resolves.toMatchObject({
        ok: false,
        code: "llm_evidence_loop.duplicate_tool_request",
        accounting: { iterations: 2, toolCalls: 1 },
        trace: [expect.anything(), { iteration: 2, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.rejected.duplicate_tool_request" }]
      });
    expect(repeatedExecute).toHaveBeenCalledTimes(1);
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, maxEvidenceBytes: 1_024, maxEvidenceContextBytes: 1_024, decide: async () => ({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} }), executeTool: async () => ({ value: "x".repeat(1_025) }) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.evidence_limit", accounting: { toolCalls: 0 } });
  });

  it("rejects malformed decisions and enforces cancellation and iteration limits", async () => {
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide: async () => ({ kind: "complete", result: {}, extra: true }), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_decision" });
    const controller = new AbortController();
    controller.abort();
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, signal: controller.signal, decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.cancelled", accounting: { iterations: 0 } });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, maxIterations: 1, decide: async () => ({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} }), executeTool: async () => ({ ok: true }) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit", accounting: { iterations: 1, toolCalls: 1 } });
  });

  it("requires a successful mutation before repeating a protected observation", async () => {
    const progressTools = [
      { ...tools[0]!, effect: "observe" as const, repeatPolicy: "after_mutation" as const },
      { toolId: "act", description: "Perform a bounded state change.", inputSchema: { type: "object" }, effect: "mutate" as const }
    ];
    const blockedDecide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.1", toolId: "inspect", input: { scope: "current" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.2", toolId: "inspect", input: { scope: "expanded" } });
    const blockedExecute = vi.fn().mockResolvedValue({ observed: true });
    const blocked = await runAutomationStudioLlmEvidenceLoop({ tools: progressTools, decide: blockedDecide, executeTool: blockedExecute });
    expect(blocked).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress", accounting: { iterations: 2, toolCalls: 1 } });
    expect(blockedExecute).toHaveBeenCalledTimes(1);
    expect(blockedDecide.mock.calls[1]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["act"]);
    expect(JSON.stringify(blockedDecide.mock.calls[1]?.[0].decisionSchema)).not.toContain('"inspect"');
    expect(blocked).toMatchObject({ trace: expect.arrayContaining([
      { iteration: 2, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.rejected.repeat_without_progress" }
    ]) });

    const progressiveDecide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.1", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.act.1", toolId: "act", input: { target: "next" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.2", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: { ready: true } });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools: progressTools, decide: progressiveDecide, executeTool: async ({ toolId }) => toolId === "act"
      ? { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true }
      : { observed: true } }))
      .resolves.toMatchObject({ ok: true, result: { ready: true }, accounting: { iterations: 4, toolCalls: 3 } });
    expect(progressiveDecide.mock.calls[1]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["act"]);
    expect(progressiveDecide.mock.calls[2]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "act"]);

    const recoverableDecide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.1", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.act.1", toolId: "act", input: { target: "blocked" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.2", toolId: "inspect", input: { scope: "varied" } });
    const recoverable = await runAutomationStudioLlmEvidenceLoop({
      tools: progressTools,
      decide: recoverableDecide,
      executeTool: async ({ toolId }) => toolId === "act"
        ? { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "action.recoverable" }, effectApplied: false, resultCode: "action.recoverable" }
        : { observed: true }
    });
    expect(recoverable).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress", accounting: { iterations: 3, toolCalls: 2 } });
    expect(recoverableDecide.mock.calls[2]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["act"]);
    expect(recoverableDecide.mock.calls[2]?.[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ toolId: "act", value: { ok: false, code: "action.recoverable" } })
    ]));
    expect(recoverable.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({ toolId: "act", effectApplied: false, resultCode: "action.recoverable" })
    ]));
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: progressTools,
      decide: async () => ({ kind: "tool_call", callId: "call.invalid-code", toolId: "act", input: {} }),
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, resultCode: "private result text!" })
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed", accounting: { toolCalls: 0 } });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools: [progressTools[0]!], decide: async () => ({}), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration", accounting: { iterations: 0 } });
  });

  it("runs one domain-declared initial observation before the first provider decision", async () => {
    const initialTools = [
      { toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" }, effect: "observe" as const, initialObservation: { input: {} } },
      { toolId: "act", description: "Perform a bounded state change.", inputSchema: { type: "object" }, effect: "mutate" as const }
    ];
    const decide = vi.fn().mockResolvedValue({ kind: "complete", result: { ready: true } });
    const executeTool = vi.fn().mockResolvedValue({ facts: ["ready"] });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: initialTools, minToolCalls: 1, decide, executeTool });

    expect(result).toMatchObject({ ok: true, result: { ready: true }, accounting: { iterations: 1, toolCalls: 1 } });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith({ callId: "initial.inspect", toolId: "inspect", value: {}, maxEvidenceBytes: 63_488 });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(decide.mock.calls[0]?.[0]).toMatchObject({ iteration: 1, canComplete: true, evidence: [{ callId: "initial.inspect", toolId: "inspect", value: { facts: ["ready"] } }] });
    expect(decide.mock.calls[0]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["act"]);
    expect(JSON.stringify(decide.mock.calls[0]?.[0].decisionSchema)).not.toContain('"inspect"');
    expect(result.trace).toMatchObject([{ iteration: 0, decision: "tool_call", toolId: "inspect" }, { iteration: 1, decision: "complete" }]);
  });

  it("allows completion from an implicit one-shot initial observation when no tools remain eligible", async () => {
    const decide = vi.fn().mockResolvedValue({ kind: "complete", result: { ready: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
      minToolCalls: 1,
      decide,
      executeTool: async () => ({ facts: ["ready"] })
    });

    expect(result).toMatchObject({ ok: true, result: { ready: true }, accounting: { iterations: 1, toolCalls: 1 } });
    expect(decide.mock.calls[0]?.[0].tools).toEqual([]);
    expect((decide.mock.calls[0]?.[0].decisionSchema as { oneOf: unknown[] }).oneOf).toHaveLength(1);
    expect(JSON.stringify(decide.mock.calls[0]?.[0].decisionSchema)).not.toContain('"tool_call"');
  });

  it("fails closed for ambiguous or mutating initial observations", async () => {
    const initial = { input: {} };
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: [
        { toolId: "one", description: "One.", inputSchema: {}, effect: "observe", initialObservation: initial },
        { toolId: "two", description: "Two.", inputSchema: {}, effect: "observe", initialObservation: initial }
      ],
      decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({})
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration", accounting: { iterations: 0, toolCalls: 0 } });
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "act", description: "Act.", inputSchema: {}, effect: "mutate", initialObservation: initial }],
      decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({})
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration", accounting: { iterations: 0, toolCalls: 0 } });
  });

  it("publishes a strict provider-facing decision schema", () => {
    const schema = buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools);
    expect(schema).toMatchObject({ oneOf: [
      { additionalProperties: false, properties: { kind: { const: "complete" } } },
      { additionalProperties: false, properties: { kind: { const: "tool_call" }, toolId: { const: "inspect" }, input: tools[0]!.inputSchema } }
    ] });
    expect((schema.oneOf as Array<{ properties: { kind: { const: string } } }>).map((variant) => variant.properties.kind.const)).toEqual(["complete", "tool_call"]);
  });

  it("requires configured evidence before exposing completion", async () => {
    const schemas: unknown[] = [];
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools,
      minToolCalls: 1,
      decide: async ({ iteration, decisionSchema }) => {
        schemas.push(decisionSchema);
        return iteration === 1
          ? { kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} }
          : { kind: "complete", result: { candidate: true } };
      },
      executeTool: async () => ({ observed: true })
    });
    expect(result.ok).toBe(true);
    expect((schemas[0] as { oneOf: unknown[] }).oneOf).toHaveLength(1);
    expect((schemas[1] as { oneOf: unknown[] }).oneOf).toHaveLength(2);
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, minToolCalls: 1, decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_decision", accounting: { toolCalls: 0 } });
  });

  it("windows model-visible evidence while preserving cumulative audit totals", async () => {
    const visible: number[] = [];
    let call = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, maxEvidenceBytes: 20_000, maxEvidenceContextBytes: 1_024,
      decide: async ({ evidence }) => {
        visible.push(Buffer.byteLength(JSON.stringify(evidence), "utf8"));
        call += 1;
        return call <= 3 ? { kind: "tool_call", callId: `call.${call}`, toolId: "inspect", input: { page: call } } : { kind: "complete", result: {} };
      },
      executeTool: async ({ maxEvidenceBytes }) => ({ text: "x".repeat(Math.min(400, maxEvidenceBytes - 20)) })
    });
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    expect(result.accounting.evidenceBytes).toBeGreaterThan(1_024);
    expect(Math.max(...visible)).toBeLessThanOrEqual(1_024);
  });

  it("optionally preserves a trusted caller's sanitized decision failure", async () => {
    const diagnostic = new Error("sanitized provider failure");
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, propagateDecisionErrors: true, decide: async () => { throw diagnostic; }, executeTool: async () => ({}) })).rejects.toBe(diagnostic);
  });
});
