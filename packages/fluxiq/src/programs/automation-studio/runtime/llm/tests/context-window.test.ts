// What one decision is shown: every evidence entry, whole, in call order, and
// beside them the history and the draft, each in full. There is no byte or
// count limit and no ranking (the standing decision of 2026-09-30); the only
// bound is the model's context window, enforced loudly before a request is
// sent, with its measured size (the last block below).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema, runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmTaskRequest } from "../harness.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, AutomationStudioLlmDecisionContextRecorder, automationStudioLlmDecisionContextEntry, automationStudioLlmDecisionContextShown } from "../decision-context/index.ts";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const page = (callId: string, size: number, toolId = "inspect"): AutomationStudioLlmEvidenceEntry =>
  ({ callId, toolId, value: { page: callId, text: "x".repeat(size) } });
const note = (callId: string): AutomationStudioLlmEvidenceEntry =>
  ({ callId, toolId: "core.request_check", value: { ok: false, code: "llm_evidence_loop.already_answered" } });

describe("the evidence one decision is shown", () => {
  it("is every entry, unchanged and without the loop's bookkeeping", () => {
    const records = [page("call.1", 100), note("core.request_check.2"), page("call.3", 100, "act")];
    const window = automationStudioLlmEvidenceContextWindow(records);
    expect(window).toEqual(records.map(({ callId, toolId, value }) => ({ callId, toolId, value })));
    expect(window.every((entry) => Object.keys(entry).join() === "callId,toolId,value")).toBe(true);
  });

  it("shows 100 entries of 50 KB each, all of them, whole, in call order", () => {
    const records = Array.from({ length: 100 }, (_, index) => page(`call.${index + 1}`, 50_000, index % 3 ? "act" : "inspect"));
    const window = automationStudioLlmEvidenceContextWindow(records);
    expect(window.map((entry) => entry.callId)).toEqual(records.map((record) => record.callId));
    for (const [index, entry] of window.entries()) expect(entry.value).toEqual(records[index]!.value);
    expect(bytes(window)).toBeGreaterThan(5_000_000);
  });

  it("ranks nothing: an older result of a tool is shown where it happened, beside the newer one", () => {
    const records = [page("call.1", 4_000), page("call.2", 10, "other"), page("call.3", 4_000), page("call.4", 10, "other")];
    expect(automationStudioLlmEvidenceContextWindow(records).map((entry) => entry.callId)).toEqual(["call.1", "call.2", "call.3", "call.4"]);
  });
});

describe("what one decision is shown beside the evidence", () => {
  const press = (position: number): AutomationStudioFlowDraftStep => ({
    position, iteration: position, callId: `call.${position}`, actionId: "press", input: { target: `target.${position}`, note: "n".repeat(5_000) }, effect: "mutate", effectApplied: true, disposition: "kept"
  });

  it("is every entry, then the history in full, then the whole draft, then the budget", () => {
    const evidence = Array.from({ length: 100 }, (_, index) => page(`call.${index + 1}`, 50_000));
    const recorder = new AutomationStudioLlmDecisionContextRecorder();
    for (let iteration = 1; iteration <= 60; iteration += 1) {
      recorder.record(iteration, { kind: "call", signature: `s${iteration}`, callId: `call.${iteration}`, toolId: "core.run_node", actionId: `node-${iteration}`, resultCode: "web.action.succeeded", changed: "yes" });
    }
    const steps = Array.from({ length: 60 }, (_, index) => press(index + 1));
    const budgetEntry = { callId: "core.budget", toolId: "core.budget", value: { decisionsLeft: 3 } };
    const { shown, draftShown } = automationStudioLlmDecisionContextShown({ evidence, records: recorder.records(), draft: { steps }, budgetEntry });

    expect(shown).toHaveLength(103);
    expect(shown.slice(0, 100).map((entry) => entry.callId)).toEqual(evidence.map((entry) => entry.callId));
    const history = shown[100]!;
    expect(history.toolId).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID);
    expect(history).toEqual(automationStudioLlmDecisionContextEntry({ records: recorder.records() }));
    expect((history.value as { rows: unknown[] }).rows).toHaveLength(60);
    const draft = shown[101]!.value as { steps: { step: number; input: unknown }[]; omitted?: unknown; unlisted?: unknown };
    expect(draft.steps.map((line) => line.step)).toEqual(steps.map((line) => line.position));
    expect(draft.steps.map((line) => line.input)).toEqual(steps.map((line) => line.input));
    expect(draft).not.toHaveProperty("omitted");
    expect(draft).not.toHaveProperty("unlisted");
    expect(draftShown).toMatchObject({ steps: 60, budget: draftShown!.bytes });
    expect(shown[102]).toEqual(budgetEntry);
  });
});

// The one size limit on a request: the model's context window. A request over
// it is refused before it is sent, loudly, with its measured size, and nothing
// is ever trimmed to make it fit.
const WINDOW = { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 };
const tools = [{ toolId: "web.inspect", description: "Look at the page as it is now.", inputSchema: { type: "object" } }];
const completionSchema = { type: "object" };
/** A page of prose past a million tokens at any estimate Core makes. */
const hugePage = (): JsonObject => ({ schemaVersion: "web-llm-evidence.v2", text: "word ".repeat(840_000) });

function countedProvider() {
  const calls = { secrets: 0, transport: 0 };
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => { calls.secrets += 1; return "test-secret"; },
    fetchImpl: (async () => { calls.transport += 1; throw new Error("must not be sent"); }) as typeof fetch
  });
  return { provider, calls };
}

describe("a request over the model's context window", () => {
  it("is refused by the harness before any provider call, with its estimated tokens, its bytes and the window", async () => {
    const { provider, calls } = countedProvider();
    const result = await runAutomationStudioLlmHarness({
      taskKind: "evidence_tool_decision",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [],
      deniedEvidenceKeys: [],
      tokenLimits: WINDOW,
      evidenceLoop: { iteration: 2, tools, evidence: [{ callId: "call.1", toolId: "web.inspect", value: hugePage() }], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema), completionSchema, canComplete: true },
      provider
    });
    expect(result.ok).toBe(false);
    expect(result.providerInvocation).toBe("not_attempted");
    expect(calls).toEqual({ secrets: 0, transport: 0 });
    const refused = result.diagnostics.find((diagnostic) => diagnostic.code === "llm_budget.input_limit_exceeded");
    expect(refused?.message).toMatch(/^Packed LLM request is an estimated \d+ input tokens \(\d+ bytes\), over its 992000-token input limit: the 1000000-token context window less 8000 reserved for the reply\. It was not sent, and nothing was trimmed to fit\.$/u);
    expect(refused?.metadata).toMatchObject({ maxInputTokens: 992_000, maxTotalTokens: 1_000_000 });
    expect((refused?.metadata?.estimatedInputTokens as number)).toBeGreaterThan(1_000_000);
    expect((refused?.metadata?.estimatedInputBytes as number)).toBeGreaterThan(4_000_000);
    // The evidence the request was built from went into it whole.
    expect(JSON.stringify(result.request.context.evidenceLoop?.evidence[0]?.value)).toBe(JSON.stringify(hugePage()));
  });

  it("is refused by the DeepSeek adapter with its measured size and the model's window, never sent", async () => {
    const { provider, calls } = countedProvider();
    const built = await runAutomationStudioLlmHarness({
      taskKind: "evidence_tool_decision",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [],
      deniedEvidenceKeys: [],
      tokenLimits: WINDOW,
      evidenceLoop: { iteration: 2, tools, evidence: [{ callId: "call.1", toolId: "web.inspect", value: hugePage() }], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema), completionSchema, canComplete: true },
      dryRun: true
    });
    // The request Core builds, with a caller's claim of its size that is far too
    // low: the adapter measures the body itself.
    const request: AutomationStudioLlmTaskRequest = { ...built.request, estimatedInputTokens: 100 };
    const failure = await provider.runTask(request).then(() => undefined, (error: unknown) => error);
    expect(failure).toBeInstanceOf(AutomationStudioLlmProviderError);
    expect((failure as AutomationStudioLlmProviderError).code).toBe("llm.provider_input_budget_exceeded");
    expect((failure as Error).message).toMatch(/^Outbound request is an estimated \d+ input tokens \(\d+ bytes\) plus 8000 reserved for the reply, over its 992000-token input or 1000000-token total limit; deepseek-flash's context window is 1000000 tokens\. It was not sent, and nothing was trimmed to fit\.$/u);
    expect(calls).toEqual({ secrets: 0, transport: 0 });
  });

  it("ends the build failed, with that message", async () => {
    const { provider, calls } = countedProvider();
    const build = runAutomationStudioLlmEvidenceLoop({
      tools,
      completionSchema,
      propagateDecisionErrors: true,
      executeTool: async () => hugePage(),
      decide: async ({ iteration, tools: offered, evidence, decisionSchema, canComplete }) => {
        if (iteration === 1) return { kind: "tool_call", callId: "call.1", toolId: "web.inspect", input: {} };
        const result = await runAutomationStudioLlmHarness({
          taskKind: "evidence_tool_decision",
          projectId: "project.one",
          flowId: "flow.one",
          instructions: [],
          deniedEvidenceKeys: [],
          tokenLimits: WINDOW,
          evidenceLoop: { iteration, tools: offered, evidence: [...evidence], decisionSchema, completionSchema, canComplete },
          provider
        });
        if (!result.ok) throw new Error(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join(" "));
        return result.response;
      }
    });
    await expect(build).rejects.toThrow(/llm_budget\.input_limit_exceeded: Packed LLM request is an estimated \d+ input tokens \(\d+ bytes\), over its 992000-token input limit: the 1000000-token context window/u);
    expect(calls).toEqual({ secrets: 0, transport: 0 });
  });
});
