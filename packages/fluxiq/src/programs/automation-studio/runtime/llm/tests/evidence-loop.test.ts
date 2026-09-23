import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS, buildAutomationStudioLlmEvidenceLoopDecisionSchema, runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST } from "../harness/index.ts";
import { automationStudioLlmTokenBudgetBytes } from "../token-estimation.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];

describe("Automation Studio LLM evidence loop", () => {
  it("runs allowlisted tools and returns a candidate with sanitized trace accounting", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { scope: "current" }, usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, estimatedCostUsd: 0.001 } })
      .mockResolvedValueOnce({ kind: "complete", result: { candidateId: "candidate.1" }, usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15, estimatedCostUsd: 0.001 } });
    const executeTool = vi.fn().mockResolvedValue({ facts: ["ready"] });

    // The guard is named here rather than inherited: its default is now a far
    // backstop (twenty-four), because three ended builds that were working.
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxStepsWithoutProgress: 3 });

    expect(result).toMatchObject({ ok: true, result: { candidateId: "candidate.1" }, accounting: { iterations: 2, toolCalls: 1, inputTokens: 22, outputTokens: 7, totalTokens: 29, estimatedCostUsd: 0.002 } });
    expect(executeTool).toHaveBeenCalledWith({ callId: "call.1", toolId: "inspect", value: { scope: "current" }, maxEvidenceBytes: 63_488 });
    expect(decide.mock.calls[1]?.[0].evidence).toEqual([{ callId: "call.1", toolId: "inspect", value: { facts: ["ready"] } }]);
    // The trace is still ids and counts. `steps` is the one place what the
    // model asked for survives the loop, and it survives on purpose: a result
    // written from the record of what was done cannot lose a step the window
    // evicted. No mutating tool is offered here, so nothing is shown a draft.
    expect(result.ok && result.steps).toEqual([{ position: 1, iteration: 1, callId: "call.1", actionId: "inspect", input: { scope: "current" }, effect: "observe", effectApplied: true, disposition: "kept" }]);
    expect(JSON.stringify({ ...result, steps: undefined })).not.toContain("scope");
  });

  it("fails closed for unknown tools and evidence overflow", async () => {
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide: async () => ({ kind: "tool_call", callId: "call.1", toolId: "navigate", input: {} }), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.unknown_tool" });
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
    // Asking to look again with nothing changed is answered with the last look
    // and counted as a step without progress; three in a row end the loop.
    const blockedDecide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.1", toolId: "inspect", input: { scope: "current" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.2", toolId: "inspect", input: { scope: "expanded" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.3", toolId: "inspect", input: { scope: "wider" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.4", toolId: "inspect", input: { scope: "widest" } });
    const blockedExecute = vi.fn().mockResolvedValue({ observed: true });
    const blocked = await runAutomationStudioLlmEvidenceLoop({ tools: progressTools, decide: blockedDecide, executeTool: blockedExecute, maxStepsWithoutProgress: 3 });
    expect(blocked).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress", accounting: { iterations: 4, toolCalls: 1 } });
    expect(blockedExecute).toHaveBeenCalledTimes(1);
    expect(blockedDecide.mock.calls[1]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["act"]);
    expect(JSON.stringify(blockedDecide.mock.calls[1]?.[0].decisionSchema)).not.toContain('"inspect"');
    expect(blockedDecide.mock.calls[2]?.[0].evidence).toEqual([
      { callId: "call.observe.1", toolId: "inspect", value: { observed: true } },
      { callId: "core.request_check.2", toolId: "core.request_check", value: expect.objectContaining({
        ok: false, code: "llm_evidence_loop.already_observed", toolId: "inspect", answeredByCallId: "call.observe.1", stepsWithoutProgress: 1, maxStepsWithoutProgress: 3
      }) }
    ]);
    expect(blocked.trace.slice(1)).toEqual([
      { iteration: 2, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.already_observed", evidenceBytes: expect.any(Number) },
      { iteration: 3, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.already_observed", evidenceBytes: expect.any(Number) },
      { iteration: 4, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.rejected.repeat_without_progress" }
    ]);

    const progressiveDecide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.1", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.act.1", toolId: "act", input: { target: "next" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.2", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: { ready: true } });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools: progressTools, decide: progressiveDecide, executeTool: async ({ toolId }) => toolId === "act"
      ? { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, targetsUnchanged: true }
      : { observed: true } }))
      .resolves.toMatchObject({ ok: true, result: { ready: true }, accounting: { iterations: 4, toolCalls: 3 } });
    expect(progressiveDecide.mock.calls[1]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["act"]);
    expect(progressiveDecide.mock.calls[2]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "act"]);

    const recoverableDecide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.1", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.act.1", toolId: "act", input: { target: "blocked" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.observe.2", toolId: "inspect", input: { scope: "varied" } })
      .mockResolvedValueOnce({ kind: "complete", result: { ready: false } });
    const recoverable = await runAutomationStudioLlmEvidenceLoop({
      tools: progressTools,
      decide: recoverableDecide,
      executeTool: async ({ toolId }) => toolId === "act"
        ? { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "action.recoverable" }, effectApplied: false, resultCode: "action.recoverable" }
        : { observed: true }
    });
    // The action was refused, and a refusal is something having happened: it
    // may itself be the domain saying the thing it was asked to act on is gone,
    // and it is new information the model can only act on by looking. So the
    // look after it is offered and runs, where it used to be withheld as
    // "already observed" -- three of which ended a live build with nothing.
    expect(recoverable).toMatchObject({ ok: true, accounting: { iterations: 4, toolCalls: 3 } });
    expect(recoverable.trace[2]).toMatchObject({ iteration: 3, toolId: "inspect", callId: "call.observe.2" });
    expect(recoverable.trace[2]?.resultCode).toBeUndefined();
    expect(recoverableDecide.mock.calls[2]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "act"]);
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

  // An implicit one-shot initial observation used to be shut after its free
  // look whatever else was offered, so a caller whose policy withheld every
  // mutating tool looked once and could never look again. "Not again until
  // something changes" cannot gate a list in which nothing can change, so the
  // tool is offered again -- and what stops the model simply re-asking is the
  // duplicate-request check, which was always the thing doing that work.
  it("offers an implicit one-shot initial observation again when nothing can mutate, and answers only the identical request from what it holds", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "inspect", input: { scope: "wider" } })
      .mockResolvedValueOnce({ kind: "complete", result: { ready: true } });
    const executeTool = vi.fn().mockResolvedValue({ facts: ["ready"] });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
      minToolCalls: 1,
      decide,
      executeTool
    });

    expect(result).toMatchObject({ ok: true, result: { ready: true }, accounting: { iterations: 3, toolCalls: 2 } });
    expect(decide.mock.calls[0]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect"]);
    expect(JSON.stringify(decide.mock.calls[0]?.[0].decisionSchema)).toContain('"tool_call"');
    // The free look still ran, the repeat of it was answered from the evidence
    // already held, and only the question with a new input reached the tool.
    expect(executeTool.mock.calls.map((call) => (call[0] as { callId: string }).callId)).toEqual(["initial.inspect", "call.2"]);
    expect(result.trace).toMatchObject([
      { iteration: 0, decision: "tool_call", callId: "initial.inspect" },
      { iteration: 1, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.already_answered" },
      { iteration: 2, decision: "tool_call", callId: "call.2" },
      { iteration: 3, decision: "complete" }
    ]);
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

  it("refuses a context window larger than the one per-request token ceiling carries", async () => {
    const run = (maxEvidenceContextBytes: number) => runAutomationStudioLlmEvidenceLoop({ tools, maxEvidenceContextBytes, decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({}) });
    const ceilingBytes = automationStudioLlmTokenBudgetBytes(AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST);

    await expect(run(ceilingBytes + 1)).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });
    await expect(run(ceilingBytes)).resolves.toMatchObject({ ok: true });
  });

  it("optionally preserves a trusted caller's sanitized decision failure", async () => {
    const diagnostic = new Error("sanitized provider failure");
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, propagateDecisionErrors: true, decide: async () => { throw diagnostic; }, executeTool: async () => ({}) })).rejects.toBe(diagnostic);
  });
});

// The total a loop gathers used to be a limit, and Flow creation set it at
// 64,000 bytes. Realistic pages cost 5 to 20 KB, so builds ended
// `evidence_limit` after ten to fifteen calls with money left
// (`run-mubpn1ga-8ae8fdc5`), and a tool offered what was left of the total got a
// few dozen bytes and threw, which read as a tool failure. The total is now
// accounted and held only to a far backstop; the window bounds each request.
describe("the total the loop gathers", () => {
  const pageCall = (number: number) => ({ kind: "tool_call", callId: `call.${number}`, toolId: "inspect", input: { page: number } });
  const pageOf = (value: JsonObject) => ({ page: value.page ?? null, text: "x".repeat(9_000) });

  it("goes past the old 64,000-byte limit while every decision stays inside its window", async () => {
    const offered: number[] = [];
    const shown: Array<ReadonlyArray<{ callId: string; toolId: string; value: unknown }>> = [];
    let call = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, maxIterations: 26, maxToolCalls: 27, maxEvidenceContextBytes: 24_000,
      decide: async ({ evidence }) => {
        shown.push(evidence);
        call += 1;
        return call <= 20 ? pageCall(call) : { kind: "complete", result: {} };
      },
      executeTool: async ({ value, maxEvidenceBytes }) => { offered.push(maxEvidenceBytes); return pageOf(value); }
    });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 20, iterations: 21 } });
    expect(result.accounting.evidenceBytes).toBeGreaterThan(64_000);
    expect(new Set(offered)).toEqual(new Set([24_000 - 512]));
    for (const evidence of shown) expect(Buffer.byteLength(JSON.stringify(evidence), "utf8")).toBeLessThanOrEqual(24_000);
    const last = shown.at(-1)!;
    expect(last.at(-1)).toMatchObject({ callId: "call.20", value: { page: 20 } });
    const history = last.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)!.value as { calls: Array<{ callId: string; changed: string }> };
    expect(history.calls.map((line) => line.callId)).toEqual(Array.from({ length: 18 }, (_, index) => `call.${index + 1}`));
    expect(history.calls.every((line) => line.changed === "no")).toBe(true);
  });

  it("offers each tool the window's bound however much has been gathered, and ends evidence_limit at the backstop, never tool_failed", async () => {
    const offered: number[] = [];
    let call = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, maxIterations: 12, maxToolCalls: 12, maxEvidenceBytes: 40_000, maxEvidenceContextBytes: 24_000, unusableDecisions: { stalled: () => new Error("stalled") },
      decide: async () => pageCall((call += 1)),
      executeTool: async ({ value, maxEvidenceBytes }) => {
        offered.push(maxEvidenceBytes);
        // A domain whose packet has a floor refuses a bound below it, as the web domain's page capture does.
        if (maxEvidenceBytes < 5_000) throw new Error("no room for a page");
        return pageOf(value);
      }
    });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.evidence_limit", accounting: { toolCalls: 4 } });
    expect(result.accounting.evidenceBytes).toBeLessThanOrEqual(40_000);
    expect(offered).toEqual([23_488, 23_488, 23_488, 23_488, 23_488]);
    expect(result.trace.some((step) => step.resultCode === "llm_evidence_loop.tool_failed")).toBe(false);
  });

  it("is still a configurable backstop, defaulting to the loop's ceiling", async () => {
    const offered: number[] = [];
    await runAutomationStudioLlmEvidenceLoop({ tools, maxIterations: 2, decide: vi.fn().mockResolvedValueOnce(pageCall(1)).mockResolvedValueOnce({ kind: "complete", result: {} }), executeTool: async ({ maxEvidenceBytes }) => { offered.push(maxEvidenceBytes); return {}; } });
    expect(offered).toEqual([64_000 - 512]);
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, maxEvidenceBytes: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes + 1, decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });
  });
});

// A model that asks for something it already has used to end the loop on the
// spot: a live Flow creation asked to detect the page's repeating structure a
// second time and the build ended with nothing. The loop now answers the
// repeat from the result it already holds, and only a run of steps that give it
// nothing new ends it.
describe("a tool request the loop has already answered", () => {
  const first = { kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1, scope: "current" } };
  const again = (callId: string) => ({ kind: "tool_call", callId, toolId: "inspect", input: { scope: "current", page: 1 } });

  it("is answered from the earlier result without running the tool, and the loop goes on", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ ...again("call.2"), usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 } })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = vi.fn().mockResolvedValue({ facts: ["ready"] });

    // The guard is named here rather than inherited: its default is now a far
    // backstop (twenty-four), because three ended builds that were working.
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxStepsWithoutProgress: 3 });

    expect(result).toMatchObject({ ok: true, result: { done: true }, accounting: { iterations: 3, toolCalls: 1, totalTokens: 6 } });
    expect(executeTool).toHaveBeenCalledTimes(1);
    const note = {
      ok: false,
      code: "llm_evidence_loop.already_answered",
      toolId: "inspect",
      answeredByCallId: "call.1",
      stepsWithoutProgress: 1,
      maxStepsWithoutProgress: 3,
      instruction: expect.stringContaining("already answered")
    };
    expect(decide.mock.calls[2]?.[0].evidence).toEqual([
      { callId: "call.1", toolId: "inspect", value: { facts: ["ready"] } },
      { callId: "core.request_check.2", toolId: "core.request_check", value: note }
    ]);
    const noteBytes = Buffer.byteLength(JSON.stringify(decide.mock.calls[2]?.[0].evidence[1].value), "utf8");
    expect(noteBytes).toBeLessThan(512);
    expect(result.accounting.evidenceBytes).toBe(Buffer.byteLength(JSON.stringify({ facts: ["ready"] }), "utf8") + noteBytes);
    expect(result.trace[1]).toEqual({
      iteration: 2, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.already_answered",
      evidenceBytes: noteBytes, usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 }
    });
  });

  it("brings the earlier result back into view when it has scrolled out of the model's window", async () => {
    const page = (number: number) => ({ kind: "tool_call", callId: `call.${number}`, toolId: "inspect", input: { page: number } });
    const decide = vi.fn()
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(2))
      .mockResolvedValueOnce(page(3))
      .mockResolvedValueOnce({ ...page(1), callId: "call.4" })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxEvidenceBytes: 20_000, maxEvidenceContextBytes: 2_048,
      executeTool: async ({ value }) => ({ page: value.page ?? null, text: "x".repeat(900) })
    });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    // Out of the window, call.1 is a line in the history, not a result.
    const beforeRepeat = decide.mock.calls[3]?.[0].evidence;
    expect(beforeRepeat.map((item: { callId: string }) => item.callId)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, "call.3"]);
    expect(beforeRepeat[0].value.calls.map((call: { callId: string }) => call.callId)).toEqual(["call.1", "call.2"]);
    const afterRepeat = decide.mock.calls[4]?.[0].evidence;
    expect(afterRepeat.map((item: { callId: string }) => item.callId)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, "call.1", "core.request_check.4"]);
    expect(afterRepeat[1].value).toMatchObject({ page: 1 });
    expect(afterRepeat[0].value.calls.map((call: { callId: string }) => call.callId)).toEqual(["call.2", "call.3"]);
    expect(Buffer.byteLength(JSON.stringify(afterRepeat), "utf8")).toBeLessThanOrEqual(2_048);
  });

  // The window lists results it no longer carries and says to ask again for
  // one still needed. A live auction build did, three times, and the guard
  // ended the build as repeating itself (`run-mubrqhvc-91d1f227`).
  it("does not count bringing a result back into view against the guard, once per result until a tool runs", async () => {
    const page = (number: number, callId = `call.${number}`) => ({ kind: "tool_call", callId, toolId: "inspect", input: { page: number } });
    const decide = vi.fn()
      .mockResolvedValueOnce(page(1)).mockResolvedValueOnce(page(2)).mockResolvedValueOnce(page(3))
      .mockResolvedValueOnce(page(1, "again.1")).mockResolvedValueOnce(page(2, "again.2"))
      .mockResolvedValueOnce(page(1, "again.3")).mockResolvedValueOnce(page(1, "again.4")).mockResolvedValueOnce(page(1, "again.5"));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 12, maxToolCalls: 12, maxEvidenceBytes: 20_000, maxEvidenceContextBytes: 2_048, maxStepsWithoutProgress: 3,
      executeTool: async ({ value }) => ({ page: value.page ?? null, text: "x".repeat(900) })
    });

    // Each of call.1 and call.2 had left the window, so the first ask for each is free; asking again is not.
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress", accounting: { iterations: 8, toolCalls: 3 } });
    const notes = decide.mock.calls.slice(4).map((call) => call[0].evidence.at(-1).value);
    expect(notes.map((note: { stepsWithoutProgress: number }) => note.stepsWithoutProgress)).toEqual([0, 0, 1, 2]);
  });

  it("ends the loop with no progress once repeats run to the guard", async () => {
    let call = 0;
    const decide = vi.fn(async () => (call += 1) === 1 ? first : again(`call.${call}`));
    const executeTool = vi.fn().mockResolvedValue({ facts: ["ready"] });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxIterations: 20, maxStepsWithoutProgress: 3 });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress", accounting: { iterations: 4, toolCalls: 1 } });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(result.trace.map((step) => step.resultCode)).toEqual([
      undefined, "llm_evidence_loop.already_answered", "llm_evidence_loop.already_answered", "llm_evidence_loop.rejected.repeat_without_progress"
    ]);
  });

  it("honours a configured guard, far from the default", async () => {
    let call = 0;
    const decide = vi.fn(async () => (call += 1) === 1 ? first : again(`call.${call}`));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async () => ({ ok: true }), maxIterations: 20, maxStepsWithoutProgress: 6 });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress", accounting: { iterations: 7, toolCalls: 1 } });
  });

  it("starts counting again after a request that brings new evidence", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(again("call.2"))
      .mockResolvedValueOnce(again("call.3"))
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.4", toolId: "inspect", input: { page: 2 } })
      .mockResolvedValueOnce(again("call.5"))
      .mockResolvedValueOnce(again("call.6"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async ({ value }) => ({ page: value.page ?? null }) });

    expect(result).toMatchObject({ ok: true, accounting: { iterations: 7, toolCalls: 2 } });
    expect(decide.mock.calls[5]?.[0].evidence.at(-1).value).toMatchObject({ stepsWithoutProgress: 1 });
    expect(decide.mock.calls[6]?.[0].evidence.at(-1).value).toMatchObject({ stepsWithoutProgress: 2 });
  });

  it("answers a request repeated word for word, call id included", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn().mockResolvedValue({ facts: [] });

    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool })).resolves.toMatchObject({ ok: true, accounting: { toolCalls: 1 } });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("runs the same request again after a change was applied in between", async () => {
    const withAction = [...tools, { toolId: "act", description: "Change the page.", inputSchema: { type: "object" }, effect: "mutate" as const }];
    const decide = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.act", toolId: "act", input: {} })
      .mockResolvedValueOnce(again("call.3"))
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => toolId === "act"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true }
      : { ok: true });

    await expect(runAutomationStudioLlmEvidenceLoop({ tools: withAction, decide, executeTool })).resolves.toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    expect(executeTool).toHaveBeenCalledTimes(3);
  });

  // A live Flow creation navigated twice under one call id and the build ended.
  // The ids are the model's own bookkeeping; the loop keeps its evidence
  // unambiguous by giving the second request an id of its own.
  it("runs a new request whose call id was already used, under an id the loop assigns", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1 } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 2 } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 3 } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1.2", toolId: "inspect", input: { page: 4 } })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => ({ page: value.page ?? null }));

    // The guard is named here rather than inherited: its default is now a far
    // backstop (twenty-four), because three ended builds that were working.
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxStepsWithoutProgress: 3 });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 4 } });
    const callIds = executeTool.mock.calls.map(([call]) => (call as unknown as { callId: string }).callId);
    expect(callIds).toEqual(["call.1", "call.1.2", "call.1.3", "call.1.2.2"]);
    expect(new Set(callIds).size).toBe(4);
    expect(decide.mock.calls[4]?.[0].evidence.map((item: { callId: string; value: { page: number } }) => [item.callId, item.value.page])).toEqual([
      ["call.1", 1], ["call.1.2", 2], ["call.1.3", 3], ["call.1.2.2", 4]
    ]);
    expect(result.trace.slice(0, 4).map((step) => step.callId)).toEqual(callIds);
  });

  it("keeps an assigned call id within the id bound", async () => {
    const long = "c".repeat(200);
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: long, toolId: "inspect", input: { page: 1 } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: long, toolId: "inspect", input: { page: 2 } })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const executeTool = vi.fn(async () => ({ ok: true }));

    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool })).resolves.toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
    const assigned = (executeTool.mock.calls[1] as unknown as [{ callId: string }])[0].callId;
    expect(assigned).toMatch(/^[a-zA-Z0-9_.:-]{1,200}$/);
    expect(assigned).not.toBe(long);
  });

  it.each([0, 1.5, 21])("refuses a guard of %s it cannot honour", async (maxStepsWithoutProgress) => {
    const decide = vi.fn();
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async () => ({}), maxIterations: 20, maxStepsWithoutProgress }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });
    expect(decide).not.toHaveBeenCalled();
  });
});
