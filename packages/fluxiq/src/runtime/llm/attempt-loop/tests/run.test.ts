// An evidence loop on its attempt's model ladder, through the real loop with a scripted model whose
// every decision asks the attempt's routed provider which model serves it: the base first, one rung
// per cause, sticky across the attempt's loops, a failed repair round climbing, a Stop not, and a
// new attempt on the base again. The sites here are made up.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput } from "../../index.ts";
import { automationStudioLlmLoopAttemptRecord } from "../../repeat-guard/index.ts";
import type { AutomationStudioLlmProviderResolverInput } from "../../resolver-contract.ts";
import { automationStudioLlmRoleRoutedResolution, runWithAutomationStudioLlmModelRole } from "../../role-routing/index.ts";

const tools = [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
const stalledError = new Error("stalled");
const decisionRequest = { requestId: "r", taskKind: "evidence_tool_decision", context: {} } as unknown as AutomationStudioLlmTaskRequest;
const call = (index: number, input: JsonObject) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input });
/** A control something covers: refused every time, on a page that never moves. */
const covered = () => vi.fn(async () => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: "s1", after: "s1" }, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_covered", draft: { actionId: "web.click", effect: "mutate", proposes: true } }));

async function attemptProvider(): Promise<AutomationStudioLlmProvider> {
  const resolved = await automationStudioLlmRoleRoutedResolution(async (input: AutomationStudioLlmProviderResolverInput) => {
    const model = input.modelId ?? "claude-haiku-5-5";
    return { provider: { metadata: { provider: "anthropic", model }, runTask: async () => ({ model }) } };
  }, { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
  return resolved!.provider;
}

/** A model that rewords one press, then completes; each decision notes the model that served it. */
function scripted(provider: AutomationStudioLlmProvider, served: string[], next: (index: number) => unknown) {
  const decide = vi.fn();
  decide.mockImplementation(async () => {
    served.push((provider.servedBy?.(decisionRequest) ?? provider).metadata.model);
    return next(decide.mock.calls.length);
  });
  return decide;
}

const loop = (decide: ReturnType<typeof vi.fn>, extra: Partial<AutomationStudioLlmEvidenceLoopInput> = {}) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool: covered() as unknown as AutomationStudioLlmEvidenceLoopInput["executeTool"], maxIterations: 60, maxToolCalls: 60, dryRun: false, propagateDecisionErrors: true,
  unusableDecisions: { stalled: () => stalledError }, ...extra
} as AutomationStudioLlmEvidenceLoopInput);

describe("a loop on its attempt's model ladder", () => {
  it("retains its starting model through caught loops, later rounds and fresh attempts", async () => {
    const provider = await attemptProvider();
    const record = automationStudioLlmLoopAttemptRecord();
    const served: string[] = [];
    const rewording = scripted(provider, served, (index) => index > 3 ? { kind: "complete", result: { done: true } } : call(index, { target: "Close", reason: `try ${index}` }));
    await loop(rewording, { attemptRecord: record });
    // Decision 1 and 2 on Haiku; the second press was a near repeat, steered, and the next decision is Sonnet's.
    expect(served.slice(0, 3)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5"]);
    expect(record.ladder.level).toBe(0);

    const later: string[] = [];
    await loop(scripted(provider, later, () => ({ kind: "complete", result: { done: true } })), { attemptRecord: record });
    expect(later).toEqual(["claude-haiku-5-5"]);

    const fresh: string[] = [];
    await loop(scripted(provider, fresh, () => ({ kind: "complete", result: { done: true } })), { attemptRecord: automationStudioLlmLoopAttemptRecord() });
    expect(fresh).toEqual(["claude-haiku-5-5"]);
  });

  it("keeps the starting model after failed repairs and Stop", async () => {
    const provider = await attemptProvider();
    const record = automationStudioLlmLoopAttemptRecord();
    const served: string[] = [];
    const broken = scripted(provider, served, () => { throw new Error("the model broke"); });
    await expect(runWithAutomationStudioLlmModelRole("repair", () => loop(broken, { attemptRecord: record }))).rejects.toThrow("the model broke");
    expect(record.data().ladder?.escalations ?? []).toEqual([]);
    // The same failure on an exploring round climbs nothing.
    await expect(loop(scripted(provider, [], () => { throw new Error("the model broke"); }), { attemptRecord: record })).rejects.toThrow("the model broke");
    expect(record.ladder.level).toBe(0);
    const stop = new AbortController();
    stop.abort();
    await runWithAutomationStudioLlmModelRole("repair", () => loop(scripted(provider, [], () => ({ kind: "complete", result: {} })), { attemptRecord: record, signal: stop.signal })).catch(() => undefined);
    expect(record.ladder.level).toBe(0);
  });

  it("shares the ladder of the loop it runs inside where it is given no record of its own", async () => {
    const provider = await attemptProvider();
    const record = automationStudioLlmLoopAttemptRecord();
    record.ladder.serve(["claude-haiku-5-5", "claude-haiku-5-5", "claude-opus-5-5"]);
    record.ladder.escalate({ reason: "model_decided" });
    const inner: string[] = [];
    const outer = vi.fn(async () => {
      await loop(scripted(provider, inner, () => ({ kind: "complete", result: { done: true } })));
      return { kind: "complete", result: { done: true } };
    });
    await loop(outer, { attemptRecord: record });
    expect(inner).toEqual(["claude-haiku-5-5"]);
  });
});
