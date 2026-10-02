// The digest hook a build hands its evidence loop: sides tracked per call for a
// binding that is asked, and no hook at all for one that reports each call's
// states on its result -- so that build makes no digest call.

// The llm barrel first: `runtime/loop-limits/` imports back into it.
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { describe, expect, it, vi } from "vitest";
import { automationStudioBootstrapStateDigestHook } from "../state-digest.ts";

const context = { projectId: "project.1", flowId: "flow.1" };
const bindingWith = (fields: Partial<AutomationStudioLlmEvidenceRuntimeBinding>): AutomationStudioLlmEvidenceRuntimeBinding =>
  ({ domainId: "test", tools: [], executeTool: async () => ({}), ...fields }) as unknown as AutomationStudioLlmEvidenceRuntimeBinding;

describe("automationStudioBootstrapStateDigestHook", () => {
  it("asks the binding before and after each call, by call id", async () => {
    const captureStateDigest = vi.fn(async ({ callId, phase }: { callId: string; phase: string }) => `${callId}:${phase}`);
    const hook = automationStudioBootstrapStateDigestHook(bindingWith({ captureStateDigest }), context)!;

    expect(await hook({ callId: "call.1", toolId: "t" })).toBe("call.1:before");
    expect(await hook({ callId: "call.1", toolId: "t" })).toBe("call.1:after");
    expect(await hook({ callId: "call.2", toolId: "t" })).toBe("call.2:before");
  });

  it("never asks about a call that reads the node library (t235)", async () => {
    // Each digest is a whole page capture in the web domain, and reading a
    // node's definition touches no page.
    const captureStateDigest = vi.fn(async ({ callId, phase }: { callId: string; phase: string }) => `${callId}:${phase}`);
    const hook = automationStudioBootstrapStateDigestHook(bindingWith({ captureStateDigest }), context)!;
    expect(await hook({ callId: "call.1", toolId: "core.describe_nodes" })).toBeUndefined();
    expect(await hook({ callId: "call.1", toolId: "core.describe_nodes" })).toBeUndefined();
    expect(captureStateDigest).not.toHaveBeenCalled();
  });

  it("is nothing for a binding that reports each call's states itself, and the build loop then makes no digest call", async () => {
    const captureStateDigest = vi.fn(async () => "state.a");
    const binding = bindingWith({ captureStateDigest, stateDigestsOnCalls: true });
    const hook = automationStudioBootstrapStateDigestHook(binding, context);
    expect(hook).toBeUndefined();

    // Wired as the service wires it: the hook only when there is one.
    const inspect = { toolId: "inspect", description: "Read the page.", inputSchema: { type: "object" }, effect: "observe" as const, initialObservation: { input: {} } };
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { page: 1 }, effectApplied: false, stateDigests: { before: "state.a", after: "state.a" } }));
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 2 } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "inspect", input: { page: 2 } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.3", toolId: "inspect", input: { page: 2 } })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [inspect], decide, executeTool, ...(hook ? { captureStateDigest: hook } : {}) });

    expect(result).toMatchObject({ ok: true });
    // The free look, a look, its first re-ask run once more, and a later re-ask answered from memory.
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(captureStateDigest).not.toHaveBeenCalled();
    // The states came off the results.
    expect(result.trace.find((row) => row.iteration === 1)).toMatchObject({ progress: { pageState: "unchanged" } });
  });
});
