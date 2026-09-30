import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, buildAutomationStudioLlmEvidenceLoopDecisionSchema, runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";
import { automationStudioLlmEvidenceParseDecision } from "../evidence-loop-decision.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];

// The decision history sits beside the window, after it, from the model's
// first decision on (`../decision-context/`): one row per decision and what
// the loop answered it.
const historyEntry = (rows: unknown[]) => ({
  callId: AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID,
  toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID,
  value: expect.objectContaining({ code: "llm_evidence_loop.decision_history", rows })
});
const withoutHistory = <Entry extends { toolId: string }>(evidence: readonly Entry[]) => evidence.filter((entry) => entry.toolId !== AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID);
const requestCheck = (evidence: ReadonlyArray<{ toolId: string; value: unknown }>) => evidence.find((entry) => entry.toolId === "core.request_check")?.value as { stepsWithoutProgress: number } | undefined;

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
    expect(executeTool).toHaveBeenCalledWith({ callId: "call.1", toolId: "inspect", value: { scope: "current" } });
    expect(decide.mock.calls[1]?.[0].evidence).toEqual([
      { callId: "call.1", toolId: "inspect", value: { facts: ["ready"] } },
      historyEntry([[1, "call", "inspect", null, "call.1", "ok", "no"]])
    ]);
    // The trace is still ids and counts. `steps` is the one place what the
    // model asked for survives the loop, and it survives on purpose: a result
    // written from the record of what was done cannot lose a step the window
    // evicted. No mutating tool is offered here, so nothing is shown a draft.
    // `id` is the step's own name, which a position stops being the moment the
    // draft is reordered; what a step says about when it runs is kept under it.
    expect(result.ok && result.steps).toEqual([{ position: 1, id: "d1", iteration: 1, callId: "call.1", actionId: "inspect", input: { scope: "current" }, effect: "observe", effectApplied: true, disposition: "kept" }]);
    expect(JSON.stringify({ ...result, steps: undefined })).not.toContain("scope");
  });

  it("accepts the provider's cache split on a decision and totals it for the build", async () => {
    // `validUsage` holds a decision's usage to an exact key list, so a field
    // the adapter learns to report and the loop has not learned is not an extra
    // field -- it is a decision thrown away. The split is the one figure that
    // says whether the request's constant prefix is being reused at all, so it
    // has to reach the build's totals.
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: {}, usage: { inputTokens: 1_000, outputTokens: 40, totalTokens: 1_040, cacheHitInputTokens: 0, cacheMissInputTokens: 1_000, estimatedCostUsd: 0.00049 } })
      .mockResolvedValueOnce({ kind: "complete", result: { candidateId: "candidate.1" }, usage: { inputTokens: 1_100, outputTokens: 40, totalTokens: 1_140, cacheHitInputTokens: 960, cacheMissInputTokens: 140, estimatedCostUsd: 0.00016 } });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async () => ({ facts: ["ready"] }) });

    // Both decisions were usable -- an exact-key check that had not learned the
    // new fields would have refused the second one outright -- and the second
    // call's input cost a fraction of the first's for the same work.
    expect(result).toMatchObject({ ok: true, accounting: { iterations: 2, inputTokens: 2_100, cacheHitInputTokens: 960 } });
  });

  it("fails closed for unknown tools, and takes a result of any size", async () => {
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide: async () => ({ kind: "tool_call", callId: "call.1", toolId: "navigate", input: {} }), executeTool: async () => ({}) }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.unknown_tool" });
    const decide = vi.fn().mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} }).mockResolvedValueOnce({ kind: "complete", result: {} });
    const page = { value: "x".repeat(2_000_000) };
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async () => page }))
      .resolves.toMatchObject({ ok: true, accounting: { toolCalls: 1 } });
    expect(decide.mock.calls[1]![0].evidence[0]).toEqual({ callId: "call.1", toolId: "inspect", value: page });
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
      }) },
      historyEntry([[1, "call", "inspect", null, "call.observe.1", "ok", "no"], [2, "answered", "inspect", null, "call.observe.1", "llm_evidence_loop.already_observed"]])
    ]);
    // Every row carries the moment it was recorded, which is what lets a reader
    // put a stall on a clock instead of inferring it from one undivided gap.
    const unchangedProgress = { draftRevisionBefore: 0, draftRevisionAfter: 0, pageState: "unobserved", draftState: "unchanged", answerabilityState: "unobserved" };
    expect(blocked.trace.slice(1)).toEqual([
      { iteration: 2, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.already_observed", evidenceBytes: expect.any(Number), progress: unchangedProgress, at: expect.any(Number) },
      { iteration: 3, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.already_observed", evidenceBytes: expect.any(Number), progress: unchangedProgress, at: expect.any(Number) },
      { iteration: 4, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.rejected.repeat_without_progress", progress: unchangedProgress, at: expect.any(Number) }
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
    expect(executeTool).toHaveBeenCalledWith({ callId: "initial.inspect", toolId: "inspect", value: {} });
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

  it("shows every result whole while accounting the total", async () => {
    const visible: string[][] = [];
    let call = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools,
      decide: async ({ evidence }) => {
        visible.push(withoutHistory(evidence).map((entry) => entry.callId));
        call += 1;
        return call <= 3 ? { kind: "tool_call", callId: `call.${call}`, toolId: "inspect", input: { page: call } } : { kind: "complete", result: {} };
      },
      executeTool: async () => ({ text: "x".repeat(400) })
    });
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    expect(result.accounting.evidenceBytes).toBeGreaterThan(1_200);
    expect(visible.at(-1)).toEqual(["call.1", "call.2", "call.3"]);
  });

  it("optionally preserves a trusted caller's sanitized decision failure", async () => {
    const diagnostic = new Error("sanitized provider failure");
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, propagateDecisionErrors: true, decide: async () => { throw diagnostic; }, executeTool: async () => ({}) })).rejects.toBe(diagnostic);
  });
});

// The total a loop gathers used to be a limit: 64,000 bytes, then a 1 MiB
// backstop, and what one decision was shown was a 24,000-byte window. Realistic
// pages cost 5 to 20 KB and a whole page far more, so builds ended
// `evidence_limit` with money left (`run-mubpn1ga-8ae8fdc5`). Since 2026-09-30
// nothing ends a loop on bytes, every result is shown whole, and a tool is
// handed no byte allowance: the only bound is the model's context window,
// enforced loudly before a request is sent.
describe("the total the loop gathers", () => {
  const pageCall = (number: number) => ({ kind: "tool_call", callId: `call.${number}`, toolId: "inspect", input: { page: number } });
  const pageOf = (value: JsonObject) => ({ page: value.page ?? null, text: "x".repeat(90_000) });

  it("goes past the old 1 MiB backstop, with every page in front of every decision", async () => {
    const shown: Array<ReadonlyArray<{ callId: string; toolId: string; value: unknown }>> = [];
    const calls: object[] = [];
    let call = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, maxIterations: 26, maxToolCalls: 27,
      decide: async ({ evidence }) => {
        shown.push(evidence);
        call += 1;
        return call <= 20 ? pageCall(call) : { kind: "complete", result: {} };
      },
      executeTool: async (input) => { calls.push(input); return pageOf(input.value); }
    });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 20, iterations: 21 } });
    expect(result.accounting.evidenceBytes).toBeGreaterThan(1_048_576);
    // No byte allowance is handed to a tool.
    expect(calls.every((input) => !("maxEvidenceBytes" in input))).toBe(true);
    const last = shown.at(-1)!;
    expect(withoutHistory(last).map((entry) => entry.callId)).toEqual(Array.from({ length: 20 }, (_, index) => `call.${index + 1}`));
    expect(withoutHistory(last).every((entry, index) => JSON.stringify(entry.value) === JSON.stringify(pageOf({ page: index + 1 })))).toBe(true);
    expect(last.at(-1)!.toolId).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID);
    const rows = (last.at(-1)!.value as { rows: unknown[][] }).rows;
    expect(rows.map((row) => row[4])).toEqual(Array.from({ length: 20 }, (_, index) => `call.${index + 1}`));
  });

  it("never ends evidence_limit, however much is gathered", async () => {
    let call = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, maxIterations: 12, maxToolCalls: 12, unusableDecisions: { stalled: () => new Error("stalled") },
      decide: async () => (call += 1) <= 11 ? pageCall(call) : { kind: "complete", result: {} },
      executeTool: async ({ value }) => ({ page: value.page ?? null, text: "x".repeat(200_000) })
    });
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 11 } });
    expect(result.accounting.evidenceBytes).toBeGreaterThan(2_000_000);
    expect(result.trace.some((step) => step.resultCode === "llm_evidence_loop.evidence_limit")).toBe(false);
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
      // What it repeats: asked at 1 and again at 2, answered at 1, nothing run since.
      timesAsked: 2,
      askedAt: [1, 2],
      answeredAt: 1,
      stepsWithoutProgress: 1,
      maxStepsWithoutProgress: 3,
      instruction: expect.stringContaining("already answered")
    };
    expect(decide.mock.calls[2]?.[0].evidence).toEqual([
      { callId: "call.1", toolId: "inspect", value: { facts: ["ready"] } },
      { callId: "core.request_check.2", toolId: "core.request_check", value: note },
      historyEntry([[1, "call", "inspect", null, "call.1", "ok", "no"], [2, "answered", "inspect", null, "call.1", "llm_evidence_loop.already_answered", null, null, 1]])
    ]);
    const shownNote = decide.mock.calls[2]?.[0].evidence[1].value as { instruction: string };
    expect(shownNote.instruction).toContain("no action has run since");
    expect(shownNote.instruction).toContain("2nd time");
    const noteBytes = Buffer.byteLength(JSON.stringify(shownNote), "utf8");
    // Larger than it was (it now says what it repeats), still a note and not a page.
    expect(noteBytes).toBeLessThan(768);
    expect(result.accounting.evidenceBytes).toBe(Buffer.byteLength(JSON.stringify({ facts: ["ready"] }), "utf8") + noteBytes);
    expect(result.trace[1]).toEqual({
      iteration: 2, decision: "tool_call", toolId: "inspect", resultCode: "llm_evidence_loop.already_answered",
      evidenceBytes: noteBytes,
      progress: { draftRevisionBefore: 0, draftRevisionAfter: 0, pageState: "unobserved", draftState: "unchanged", answerabilityState: "unobserved" },
      at: expect.any(Number), usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 }
    });
  });

  // Every result stays in front of the model, in call order, so a repeat is
  // answered with a note naming the entry it already has, and nothing moves.
  it("names the earlier result, which stays where it happened", async () => {
    const page = (number: number) => ({ kind: "tool_call", callId: `call.${number}`, toolId: "inspect", input: { page: number } });
    const decide = vi.fn()
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(2))
      .mockResolvedValueOnce(page(3))
      .mockResolvedValueOnce({ ...page(1), callId: "call.4" })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide,
      executeTool: async ({ value }) => ({ page: value.page ?? null, text: "x".repeat(12_000) })
    });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    const beforeRepeat = decide.mock.calls[3]?.[0].evidence;
    expect(beforeRepeat.map((item: { callId: string }) => item.callId)).toEqual(["call.1", "call.2", "call.3", AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID]);
    const afterRepeat = decide.mock.calls[4]?.[0].evidence;
    expect(afterRepeat.map((item: { callId: string }) => item.callId)).toEqual(["call.1", "call.2", "call.3", "core.request_check.4", AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID]);
    expect(requestCheck(afterRepeat)).toMatchObject({ answeredByCallId: "call.1" });
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
    expect(requestCheck(decide.mock.calls[5]?.[0].evidence)).toMatchObject({ stepsWithoutProgress: 1 });
    expect(requestCheck(decide.mock.calls[6]?.[0].evidence)).toMatchObject({ stepsWithoutProgress: 2 });
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
    expect(withoutHistory(decide.mock.calls[4]?.[0].evidence as Array<{ callId: string; toolId: string; value: { page: number } }>).map((item) => [item.callId, item.value.page])).toEqual([
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

// A statement about when a step runs travels the same road an ordinary
// amendment does: it is read strictly, a field the model mistyped leaves the
// amendment out rather than becoming something else, and the grammar itself is
// in the schema every decision that may amend already carries.
describe("the routing words of an amendment", () => {
  it("reads each one, with the fields it carries", () => {
    const read = automationStudioLlmEvidenceParseDecision({
      kind: "amend_draft",
      amendments: [
        { step: 2, change: "optional" },
        { step: 3, change: "only_if", check: 2 },
        { step: 4, change: "on_failed", to: 5 },
        { step: 6, change: "repeat", through: 7, over: 5 }
      ]
    });

    expect(read).toEqual({
      kind: "amend_draft",
      amendments: [
        { step: 2, change: "optional" },
        { step: 3, change: "only_if", check: 2 },
        { step: 4, change: "on_failed", to: 5 },
        { step: 6, change: "repeat", through: 7, over: 5 }
      ]
    });
  });

  // A recovery naming no step would say a failure recovers into nowhere, which
  // is what the word is for; and a position that is not one is not read as zero.
  it("leaves out a recovery that names no step, and a position that is not one", () => {
    expect(automationStudioLlmEvidenceParseDecision({ kind: "amend_draft", amendments: [{ step: 2, change: "on_failed" }] })).toBeUndefined();
    expect(automationStudioLlmEvidenceParseDecision({ kind: "amend_draft", amendments: [{ step: 2, change: "only_if", check: 0 }] })).toBeUndefined();
    expect(automationStudioLlmEvidenceParseDecision({ kind: "amend_draft", amendments: [{ step: 2, change: "repeat", through: "two" }] })).toBeUndefined();
  });

  it("offers every one of them in the schema the model answers in", () => {
    const schema = buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, { type: "object" }, true, true) as {
      oneOf: Array<{ properties: { kind: { const: string }; amendments?: { items: { properties: { change: { enum: string[] } } } } } }>;
    };
    const amend = schema.oneOf.find((variant) => variant.properties.kind.const === "amend_draft");

    expect(amend?.properties.amendments?.items.properties.change.enum).toEqual(
      expect.arrayContaining(["optional", "only_if", "on_failed", "repeat"])
    );
  });
});
