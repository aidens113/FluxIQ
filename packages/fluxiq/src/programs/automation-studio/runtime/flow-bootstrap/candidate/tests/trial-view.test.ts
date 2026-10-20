// After a trial, the model's next decision sees the page the trial left
// (`../trial-view.ts`, t477; lane C round 10, `run-mv5uu9g1-9d80deea`: the
// trial moved the browser to a filtered page and the model held only handles
// from the page before it).
import { describe, expect, it, vi } from "vitest";
import { automationStudioActionPermissionDenied } from "../../../action-permissions/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../../../llm/deepseek/index.ts";
import type { JsonValue } from "../../../../../../core/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/evidence-loop.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/harness.ts";
import { packAutomationStudioLlmContext } from "../../../llm/harness/index.ts";
import { automationStudioLlmNodeDescriptions, automationStudioLlmRunNodeDescribingFailures } from "../../../llm/node-tools/index.ts";
import { automationStudioCandidateTrialView } from "../index.ts";

const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" }, arrival: { node: "web.navigate" } } };
const others: AutomationStudioLlmEvidenceTool[] = [{ toolId: "web.find_on_page", description: "Find", inputSchema: { type: "object" }, effect: "observe" }];
const trial = (effectApplied: boolean): AutomationStudioLlmEvidenceToolExecutionResult => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, verdict: "unsure", retestsLeft: 2 }, effectApplied, targetsUnchanged: !effectApplied, resultCode: "candidate.trial_unsure", resultReason: "retry_allowed" });

describe("the page a trial left", () => {
  it("is looked at once with the domain's own look and put on the trial's answer, the answer otherwise as it was", async () => {
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "filtered results", handles: ["t901"] }, effectApplied: false }));
    const answered = await automationStudioCandidateTrialView({ answer: trial(true), tools: [...others, look], executeTool, callId: "test.1" });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith({ callId: "test.1.page", toolId: "core.run_node", value: { node: "web.inspect" } });
    expect(answered).toMatchObject({ effectApplied: true, resultCode: "candidate.trial_unsure", resultReason: "retry_allowed" });
    expect(answered.evidence).toMatchObject({ verdict: "unsure", retestsLeft: 2, pageAfterTrial: { page: "filtered results", handles: ["t901"] } });
    expect(String((answered.evidence as { pageAfterTrialNote: string }).pageAfterTrialNote)).toContain("handles to use now");
  });

  it("is not looked at when nothing ran on the target, or when no tool declares a look", async () => {
    const executeTool = vi.fn();
    expect(await automationStudioCandidateTrialView({ answer: trial(false), tools: [look], executeTool, callId: "test.2" })).toEqual(trial(false));
    expect(await automationStudioCandidateTrialView({ answer: trial(true), tools: others, executeTool, callId: "test.3" })).toEqual(trial(true));
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("says to look again when the look failed or was refused, and lets the build's stop through", async () => {
    const threw = await automationStudioCandidateTrialView({ answer: trial(true), tools: [look], executeTool: async () => { throw new Error("capture failed"); }, callId: "test.4" });
    expect(threw.evidence).not.toHaveProperty("pageAfterTrial");
    expect(String((threw.evidence as { pageAfterTrialNote: string }).pageAfterTrialNote)).toContain("look at it again");
    const refused = await automationStudioCandidateTrialView({ answer: trial(true), tools: [look], executeTool: async () => ({ ok: false, code: "page_unreadable" }), callId: "test.5" });
    expect(refused.evidence).not.toHaveProperty("pageAfterTrial");

    const stop = new AbortController();
    stop.abort();
    await expect(automationStudioCandidateTrialView({ answer: trial(true), tools: [look], executeTool: async () => { throw new Error("aborted"); }, callId: "test.6", signal: stop.signal })).rejects.toThrow("aborted");
  });
});

// Lane C round 11 (`run-mv5yaapy-8c34bf34`, 0029, t480): the first look after a
// trial described the domain's look node, and the definition went into the
// request's head because its `describedNodes` sat under `pageAfterTrial`, where
// the request does not look for it. 51,218 of 55,058 input tokens missed the
// provider's cache on that one decision.
describe("the look after a trial and the provider's cache", () => {
  const AND = "builtin.logic.and";
  const OR = "builtin.logic.or";

  it("names the node the look described on the trial's answer, not inside its page", async () => {
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "results", describedNodes: [OR] }, effectApplied: false }));
    const answered = await automationStudioCandidateTrialView({ answer: trial(true), tools: [look], executeTool, callId: "test.7" });

    expect(answered.evidence).toMatchObject({ describedNodes: [OR], pageAfterTrial: { page: "results" } });
    expect((answered.evidence as { pageAfterTrial: object }).pageAfterTrial).not.toHaveProperty("describedNodes");
  });

  it("leaves every byte the decision before the trial sent in front of its window unchanged, and shows the definition once", async () => {
    const memory = automationStudioLlmNodeDescriptions({ resolution: GLOBAL_RESOLUTION });
    const library = automationStudioLlmRunNodeDescribingFailures(async (input) => ({
      kind: "llm_evidence_tool_execution",
      evidence: { ok: true, ran: input.value.node as string, page: { url: "https://example.test/", title: "A page" } },
      effectApplied: false
    }), memory);
    const executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"] = async (call) =>
      await library({ projectId: "project.one", flowId: "flow.one", callId: call.callId, optionId: call.toolId, value: call.value, permission: automationStudioActionPermissionDenied });
    const evidenceOf = (result: unknown): JsonValue => (result as AutomationStudioLlmEvidenceToolExecutionResult).evidence;
    const window: Window = [{ callId: "initial.core.run_node", toolId: "core.run_node", value: evidenceOf(await executeTool({ callId: "initial.core.run_node", toolId: "core.run_node", value: { node: AND, parameters: {}, consequences: [] } })) }];
    const first = await userMessage(packedRequest(1, window, memory.ids()));

    const lookOn: AutomationStudioLlmEvidenceTool = { ...look, initialObservation: { input: { node: OR, parameters: {}, consequences: [] } } };
    const answered = await automationStudioCandidateTrialView({ answer: trial(true), tools: [lookOn], executeTool, callId: "call.1" });
    window.push({ callId: "call.1", toolId: "core.test_candidate", value: answered.evidence });
    const second = await userMessage(packedRequest(2, window, memory.ids()));

    expect(memory.ids()).toContain(OR);
    const end = first.indexOf('],"iteration":', first.indexOf('"evidence":'));
    expect(end).toBeGreaterThan(0);
    expect(second.slice(0, end)).toBe(first.slice(0, end));
    expect(second.split(JSON.stringify(memory.definition(OR))).length - 1).toBe(1);
  });
});

const GLOBAL_RESOLUTION = { scope: { kind: "global" as const } };
const loopTools = [
  { toolId: "core.run_node", description: "Run one node from the library against the page.", inputSchema: { type: "object" } },
  { toolId: "core.test_candidate", description: "Test the draft from the start.", inputSchema: { type: "object" } }
];
const completionSchema = { type: "object" } as const;

/** A decision's evidence window, in the order the calls ran. */
type Window = Array<{ callId: string; toolId: string; value: JsonValue }>;

/** An evidence decision packed by Core's own packer from a window and the build's described ids. */
function packedRequest(iteration: number, gathered: Window, describedNodeIds: readonly string[]): AutomationStudioLlmTaskRequest {
  const evidenceLoop = { iteration, tools: loopTools, evidence: structuredClone(gathered), decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(loopTools, completionSchema, true, false), completionSchema, canComplete: true };
  const context = packAutomationStudioLlmContext({ taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", instructions: [], deniedEvidenceKeys: [], evidenceLoop, flowBootstrap: { resolution: GLOBAL_RESOLUTION, describedNodeIds } });
  return {
    requestId: "request.evidence.1",
    idempotencyKey: "request.evidence.1",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "evidence_tool_decision",
    promptVersion: context.promptVersion,
    expectedOutput: "evidence_tool_decision",
    tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 4_000, maxTotalTokens: 52_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: [],
    context
  };
}

/** The user message one request would put on the wire, read from the outbound body itself. */
async function userMessage(request: AutomationStudioLlmTaskRequest): Promise<string> {
  let outbound = "";
  const provider = createAutomationStudioDeepSeekProvider({
    now: () => Date.UTC(2026, 8, 30, 2),
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async (input) => {
      outbound = input.outboundBody;
      return "test-secret";
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "evidence_tool_decision", summary: "Enough.", decision: { kind: "complete", result: {} } }) } }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
  });
  await provider.runTask(request);
  const body = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
  return body.messages.find((message) => message.role === "user")!.content;
}

// t738 (photo rerun round 2, `run-mvgf801u-cc23575e`, 0057): a refused test whose
// checks moved the tab shows where it left it.
const refusal = (effectApplied: boolean): AutomationStudioLlmEvidenceToolExecutionResult => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "candidate.trial_reset_required", instruction: "Undo each act." }, effectApplied, targetsUnchanged: !effectApplied, resultCode: "candidate.trial_reset_required", resultReason: "retry_allowed" });
const REFUSED_PAGE = { page: "PAGE \"Reading list\"\nURL ~/list", handles: ["t3"] };

describe("a refused test and the page its checks left", () => {
  it("is looked at when the caller says the checks moved the tab, and answered as having moved it", async () => {
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution", evidence: REFUSED_PAGE, effectApplied: false }));
    const answered = await automationStudioCandidateTrialView({ answer: refusal(false), targetMoved: true, tools: [look], executeTool, callId: "test.9" });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(answered).toMatchObject({ effectApplied: true, targetsUnchanged: false, resultCode: "candidate.trial_reset_required", resultReason: "retry_allowed" });
    expect(answered.evidence).toMatchObject({ code: "candidate.trial_reset_required", pageAfterTrial: REFUSED_PAGE });
    expect(String((answered.evidence as { pageAfterTrialNote: string }).pageAfterTrialNote)).toContain("No trial ran");
  });

  it("says to look again, in a refusal's words, when that look failed", async () => {
    const answered = await automationStudioCandidateTrialView({ answer: refusal(true), tools: [look], executeTool: async () => { throw new Error("capture failed"); }, callId: "test.10" });
    expect(answered.evidence).not.toHaveProperty("pageAfterTrial");
    expect(String((answered.evidence as { pageAfterTrialNote: string }).pageAfterTrialNote)).toMatch(/No trial ran.*look at it again/u);
  });

  it("is left as it was when nothing moved", async () => {
    const executeTool = vi.fn();
    expect(await automationStudioCandidateTrialView({ answer: refusal(false), targetMoved: false, tools: [look], executeTool, callId: "test.11" })).toEqual(refusal(false));
    expect(executeTool).not.toHaveBeenCalled();
  });
});
