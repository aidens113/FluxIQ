// No count ends an evidence loop, with or without a loop signal (t1056; user, 2026-11-24: "THERE SHOULDNT BE ANY
// ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING").
//
// Before t1056 a loop whose caller took no loop signal -- a recovery, a candidate or subflow build, the project
// supervisor -- still ended at a count: eight looks in a row, three refused repeats in a row, three refusals of one kind,
// twelve unusable replies in a row, six unreadable replies in a row, and its turns and calls (`maxIterations`,
// `maxToolCalls`, eight of each by default). These pin that each of those runs on far past its old bound, steered --
// told plainly what it keeps doing, and asked for its own loop decision -- until its result, or until its purse ends it.
// The decisions here run past every old figure several times over; each test fails on a runaway rather than hanging.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW, AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW } from "../../../../repeat-guard/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID } from "../../../../loop-decision/index.ts";
import {
  AutomationStudioLlmUnusableDecisionError,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmEvidenceLoopInput
} from "../../../../index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider } from "../../../../harness/index.ts";
import { automationStudioLlmUnusableDecisionError } from "../../../../unusable-decision.ts";
import { AutomationStudioLlmProviderError } from "../../../../../models/failures/index.ts";

type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonValue }>;
type Decide = { mock: { calls: unknown[][] } };
const shown = (decide: Decide): Shown[] => decide.mock.calls.map((call) => (call[0] as { evidence: Shown }).evidence);
/** Every entry of `toolId` any decision was shown, once each by call id. */
function entries(decide: Decide, toolId: string): JsonObject[] {
  const seen = new Map<string, JsonObject>();
  for (const evidence of shown(decide)) for (const entry of evidence) if (entry.toolId === toolId) seen.set(entry.callId, entry.value as JsonObject);
  return [...seen.values()];
}

/** Far past every count that once ended a loop: twelve unusable replies in a row was the largest of them. */
const FAR = 40;
/** Decisions past which a loop under test has run away: the test fails on it rather than hanging the run. */
const RUNAWAY = 400;
const complete = { kind: "complete", result: { done: true } };
const stalled = new Error("stalled: a count ended the loop");

const tools = [
  { toolId: "find", description: "Search the page for text.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];

/** A page that never moves: a find matches nothing; a press on "Gone" is refused, and any other changes nothing. */
function stuckSite() {
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => {
    const states = { before: "s1", after: "s1" };
    if (toolId === "find") return { kind: "llm_evidence_tool_execution", stateDigests: states, evidence: { found: `0 matches for "${String(value.query)}"` }, effectApplied: false, resultCode: "web.inspect.succeeded", draft: { actionId: "web.find", effect: "observe", proposes: false } };
    const click = { draft: { actionId: "web.click", effect: "mutate", proposes: true } };
    if (String(value.target).startsWith("Gone")) return { kind: "llm_evidence_tool_execution", stateDigests: states, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", ...click };
    return { kind: "llm_evidence_tool_execution", stateDigests: states, evidence: { ok: true, changed: "nothing" }, effectApplied: false, resultCode: "web.action.succeeded", ...click };
  });
}

/** `count` decisions from `make`, then a completion; a runaway past `RUNAWAY` throws. */
function decisions(count: number, make: (index: number) => JsonObject | Error) {
  return vi.fn(async () => {
    const index = decisionsAsked.next();
    if (index > RUNAWAY) throw new Error("runaway: nothing ended the loop");
    if (index > count) return complete;
    const made = make(index);
    if (made instanceof Error) throw made;
    return made;
  });
}
const decisionsAsked = {
  asked: 0,
  next() {
    this.asked += 1;
    return this.asked;
  },
  reset() {
    this.asked = 0;
  }
};

/** A loop with no loop signal, as a candidate build, a subflow builder or the project supervisor runs one. */
const unsignalled = (decide: ReturnType<typeof vi.fn>, extra: Partial<AutomationStudioLlmEvidenceLoopInput> = {}) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool: stuckSite(), dryRun: false, propagateDecisionErrors: true, unusableDecisions: { stalled: () => stalled }, ...extra
});

describe("a loop with no loop signal", () => {
  it("looks far past the old eight in a row, steered and offered its own loop decision, until its result", async () => {
    decisionsAsked.reset();
    const decide = decisions(FAR, (index) => ({ kind: "tool_call", callId: `find.${index}`, toolId: "find", input: { query: `query ${index}` } }));

    const result = await unsignalled(decide);

    expect(result).toMatchObject({ ok: true });
    expect(result.accounting.toolCalls).toBe(FAR);
    expect(FAR).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW * 4);
    // Told at the fifth that it is searching without acting, in words that end nothing.
    const [search] = entries(decide, "core.search_check");
    expect(String(search?.instruction)).toContain("caught as a repeat, and you decide how to go on");
    expect(String(search?.instruction)).not.toMatch(/stopped|tested and judged/u);
    // From the eighth, caught as a repeat: the model is told what it repeated and asked to decide.
    const steers = entries(decide, "core.loop_check");
    expect(steers.length).toBeGreaterThan(0);
    expect(steers[0]).toMatchObject({ code: "llm_evidence_loop.loop_steered", pattern: "no_progress" });
    expect(steers.some((steer) => steer.decide !== undefined)).toBe(true);
    // The decision is offered to a loop with no loop signal too, without asking a person nobody can reach.
    const offered = ((decide.mock.calls as unknown as Array<[{ tools: ReadonlyArray<{ toolId: string }> }]>)[0]![0]).tools.map((tool) => tool.toolId);
    expect(offered).toContain(AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID);
    const ask = steers.find((steer) => steer.decide !== undefined)!.decide as JsonObject;
    expect(String(ask.instruction)).toContain("No person can be asked from here");
    expect(ask.offered).not.toContain("ask_person");
  });

  it("is refused the same call far past the old three in a row, steered, until its result", async () => {
    decisionsAsked.reset();
    // The same press on the same unchanged page every time: the repeat guard refuses every one after the first two.
    const decide = decisions(FAR, () => ({ kind: "tool_call", callId: "press.same", toolId: "press", input: { target: "Save" } }));

    const result = await unsignalled(decide);

    expect(result).toMatchObject({ ok: true });
    const refusals = entries(decide, "core.repeat_check");
    expect(refusals.length).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW * 4);
    for (const note of refusals) {
      expect(note).not.toHaveProperty("maxRefusedInARow");
      expect(String(note.instruction)).not.toMatch(/end this (round|work|build)|ends this|tested and judged/u);
    }
  });

  it("runs the caller's own move at the top of the ladder, then goes on", async () => {
    decisionsAsked.reset();
    const decide = decisions(FAR, () => ({ kind: "tool_call", callId: "press.same", toolId: "press", input: { target: "Save" } }));
    const recoverStall = vi.fn(() => ({ call: { toolId: "find", input: { query: "what moved" } } }));

    const result = await unsignalled(decide, { recoverStall });

    expect(result).toMatchObject({ ok: true });
    expect(recoverStall).toHaveBeenCalled();
    expect(entries(decide, "core.stall_recovery")[0]).toMatchObject({ code: "llm_evidence_loop.stall_recovered", ran: { toolId: "find" } });
  });

  it("is refused by the page for one reason far past the old three in a row, steered, until its result", async () => {
    decisionsAsked.reset();
    // A different control each time, so no guard refuses it unrun: the page refuses every one for the same reason.
    const decide = decisions(FAR, (index) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target: `Gone ${index}` } }));

    const result = await unsignalled(decide);

    expect(result).toMatchObject({ ok: true });
    expect(result.accounting.toolCalls).toBe(FAR);
    const [warning] = entries(decide, "core.refusal_run");
    expect(warning).toMatchObject({ code: "llm_evidence_loop.refused_in_a_row", inARow: 2 });
    expect(warning).not.toHaveProperty("maxInARow");
    expect(String(warning?.instruction)).toContain("caught as a repeat, and you decide how to go on");
    expect(String(warning?.instruction)).not.toMatch(/ends this|tested and judged/u);
  });

  it("gets unusable decisions far past the old twelve in a row, each asked again, until its result", async () => {
    decisionsAsked.reset();
    const decide = decisions(FAR, () => ({ kind: "no_such_decision" }));

    const result = await unsignalled(decide);

    expect(result).toMatchObject({ ok: true });
    expect(result.trace.filter((row) => row.decision === "unusable")).toHaveLength(FAR);
  });

  it("gets unreadable replies far past the old six in a row, each asked again and paid for, until its result", async () => {
    decisionsAsked.reset();
    // A different case each time, as a model that keeps getting the shape wrong in new ways sends them; each one billed.
    const cases = ["content_mismatched", "content_unclosed", "content_trailing", "content_prefixed"] as const;
    const usage = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
    const decide = decisions(FAR, (index) => new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: cases[index % cases.length]!, finishReason: "stop", contentChars: 900, usage }));

    const result = await unsignalled(decide);

    expect(result).toMatchObject({ ok: true });
    expect(result.trace.filter((row) => row.decision === "unusable")).toHaveLength(FAR);
    const notes = entries(decide, "core.decision_feedback");
    for (const note of notes) {
      expect(note).not.toHaveProperty("maxUnreadableInARow");
      expect(String(note.instruction)).not.toContain("stop this build");
    }
  });

  it("runs far past the turns and calls it was configured for, which no longer bound it", async () => {
    decisionsAsked.reset();
    const decide = decisions(FAR, (index) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target: `Control ${index}` } }));

    const result = await unsignalled(decide, { maxIterations: 4, maxToolCalls: 4 });

    expect(result).toMatchObject({ ok: true });
    expect(result.accounting.iterations).toBe(FAR + 1);
    expect(result.accounting.toolCalls).toBe(FAR);
  });
});

describe("a loop with no loop signal that never stops repeating", () => {
  it("is ended by its purse, through the real harness, never by a count", async () => {
    // Each decision is asked through the real harness, as a build asks it, and reports a cent spent against a purse of
    // a quarter: the purse refusing the next decision is what ends it.
    let asked = 0;
    const llm: AutomationStudioLlmProvider = {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      estimateCostUsd: ({ inputTokens, outputTokens }) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000,
      runTask: async () => {
        asked += 1;
        if (asked > RUNAWAY) throw new Error("runaway: the purse never ended the loop");
        // Alternately a look and the same refused press: looks in a row, refused repeats and refusals of one kind all
        // climb past their old bounds here.
        const decision = asked % 2 === 0
          ? { kind: "tool_call", callId: `find.${asked}`, toolId: "find", input: { query: `query ${asked}` } }
          : { kind: "tool_call", callId: "press.gone", toolId: "press", input: { target: "Gone" } };
        return { response: { kind: "evidence_tool_decision", summary: "Again.", decision }, usage: { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: 0.01 } };
      }
    };
    const decide = vi.fn(async ({ iteration, tools: offered, evidence, decisionSchema, canComplete }: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]) => {
      const decision = await runAutomationStudioLlmHarness({
        taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", instructions: [],
        evidenceLoop: { iteration, tools: offered, evidence: evidence.map((item) => ({ ...item })), decisionSchema, completionSchema: { type: "object" }, canComplete },
        provider: llm, tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, expectedOutput: "evidence_tool_decision", deniedEvidenceKeys: []
      });
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw new Error(`decision failed: ${decision.diagnostics.map((item) => item.code).join(",")}`);
      return { ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) };
    });

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: stuckSite(), dryRun: false, completionSchema: { type: "object" }, propagateDecisionErrors: true,
      unusableDecisions: { stalled: () => stalled }, budget: { maxCostUsd: 0.25 }
    });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit", exhaustion: { bound: "budget", budgetBound: "cost" } });
    expect(asked).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW * 2);
    expect(entries(decide, "core.loop_check").length).toBeGreaterThan(0);
  });
});

// With no count ending a loop, a provider that keeps failing must end it by what its failure is (t1056; AGENTS.md: paid
// work stops at the first balance error). Each decision here goes through the real harness and the real classification
// of what a failed call means (`../../unusable-decision.ts`, `../../../models/failures/disposition.ts`).
describe("a provider that keeps failing and bills nothing", () => {
  /** A provider whose every call fails with `error` and reports no usage. */
  const failing = (error: () => Error) => {
    let calls = 0;
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      estimateCostUsd: ({ inputTokens, outputTokens }) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000,
      runTask: async () => {
        calls += 1;
        if (calls > RUNAWAY) throw new Error("runaway: nothing ended the loop");
        throw error();
      }
    };
    return { provider, calls: () => calls };
  };
  /** The build's own decide: a failure that only spent a call is asked again; any other ends the loop (`automationStudioLlmUnusableDecisionError`). */
  const decideThrough = (provider: AutomationStudioLlmProvider) => vi.fn(async ({ iteration, tools: offered, evidence, decisionSchema, canComplete }: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]) => {
    const result = await runAutomationStudioLlmHarness({
      taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", instructions: [],
      evidenceLoop: { iteration, tools: offered, evidence: evidence.map((item) => ({ ...item })), decisionSchema, completionSchema: { type: "object" }, canComplete },
      provider, tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, expectedOutput: "evidence_tool_decision", deniedEvidenceKeys: []
    });
    if (result.ok && result.response?.kind === "evidence_tool_decision") return result.response.decision;
    const spent = automationStudioLlmUnusableDecisionError(result);
    if (spent) throw spent;
    throw new Error(`provider failure: ${result.diagnostics.filter((item) => item.severity === "error").map((item) => item.code).join(",")}`);
  });
  const run = (provider: AutomationStudioLlmProvider) => runAutomationStudioLlmEvidenceLoop({
    tools, decide: decideThrough(provider), executeTool: stuckSite(), dryRun: false, completionSchema: { type: "object" }, propagateDecisionErrors: true,
    unusableDecisions: { stalled: () => stalled }, budget: { maxCostUsd: 0.25 }
  });

  it.each([
    ["a rejected key", "llm.provider_auth_failed"],
    ["an empty balance", "llm.provider_balance_exhausted"],
    ["a request the provider refused", "llm.provider_http_error"]
  ] as const)("ends at the first call on %s, as that provider failure", async (_name, code) => {
    const { provider, calls } = failing(() => new AutomationStudioLlmProviderError(code, "refused", false, code === "llm.provider_http_error" ? 400 : undefined));
    await expect(run(provider)).rejects.toThrow(`provider failure: ${code}`);
    expect(calls()).toBe(1);
  });

  it("ends a provider that never answers as the provider being unavailable, never by looping to the clock", async () => {
    const { provider, calls } = failing(() => new AutomationStudioLlmProviderError("llm.provider_timeout", "timed out", true));
    const result = await run(provider);
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.provider_unavailable", providerUnavailable: { codes: ["llm.provider_timeout"] } });
    expect(calls()).toBeLessThan(20);
  });

  it("ends a provider whose replies arrive unreadable and unbilled as the provider failing, not as the model's unusable replies", async () => {
    const { provider, calls } = failing(() => new AutomationStudioLlmProviderError("llm.provider_malformed_response", "not json"));
    const result = await run(provider);
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.provider_unavailable", providerUnavailable: { codes: ["llm.provider_malformed_response"] } });
    expect(calls()).toBeLessThan(20);
    expect(result.accounting.estimatedCostUsd).toBe(0);
  });
});
