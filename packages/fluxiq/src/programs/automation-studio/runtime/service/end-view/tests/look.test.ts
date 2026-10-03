// The look at the page a run or a build's test ended on (t174-w89; t174-w87
// Cause 7, run `run-murwd8le-79e735a8`).
//
// The run's judges -- of its tests (0046, 0047) and after it (0069, 0071) --
// never saw `Cart (3)`, the coupon's "Collected" or the quantity field, and one
// invented a quantity that was never committed. The page is taken through the
// bound domain's own free look (`runsNodes.initial`, or a tool's
// `initialObservation`), by the view keys the domain declared, bounded in time.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { harness, verify } from "../../../result-verification/tests/run-outcome-harness.ts";
import { automationStudioEndViewLook, automationStudioRunEndViewReader } from "../index.ts";

const PAGE = "PAGE \"Voltbay USB C Hub\"\nt885 link \"3 Cart\" ~/cart\nt965 field \"Quantity\" =\"3\"\nt970 \"Collected\"";
const LOOK = { node: "web.output.dom-capture_snapshot", parameters: {}, consequences: [] };
const DENIED = ["html", "cookies", "selector"];

const page = (extra: JsonObject = {}) => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, page: PAGE, ...extra }, effectApplied: false });

function binding(executeTool: AutomationStudioLlmEvidenceRuntimeBinding["executeTool"], fields: Partial<AutomationStudioLlmEvidenceRuntimeBinding> = {}): AutomationStudioLlmEvidenceRuntimeBinding {
  return { domainId: "web-automation", deniedEvidenceKeys: DENIED, observedStateKeys: ["page", "read.rows"], tools: [], runsNodes: { initial: LOOK }, executeTool, ...fields };
}

describe("the look at the page a test ended on", () => {
  const tools = [
    { toolId: "press", effect: "mutate" as const },
    { toolId: "core.run_node", effect: "mutate" as const, initialObservation: { input: LOOK } }
  ];

  it("sends the domain's free look and keeps only the view keys of what it answered", async () => {
    const look = automationStudioEndViewLook({ tools, viewKeys: ["page", "read.rows"] })!;
    const executeTool = vi.fn(async (_call: { callId: string; toolId: string; value: JsonObject }) => page({ handles: 3 }));
    expect(await look({ callId: "core.dry_run.1.end_view", after: 3, executeTool })).toEqual({ after: 3, view: { page: PAGE } });
    expect(executeTool.mock.calls[0]?.[0]).toMatchObject({ callId: "core.dry_run.1.end_view", toolId: "core.run_node", value: LOOK });
  });

  it("is no view when the look answered without one", async () => {
    const look = automationStudioEndViewLook({ tools, viewKeys: ["page"] })!;
    expect(await look({ callId: "c", executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "not_there_yet" }, effectApplied: false }) })).toBeUndefined();
  });

  it("is bounded in time: a look that does not come back fails, naming the timeout, and its call is cancelled", async () => {
    const look = automationStudioEndViewLook({ tools, viewKeys: ["page"], timeoutMs: 20 })!;
    let seen: AbortSignal | undefined;
    const executeTool = vi.fn(({ signal }: { signal?: AbortSignal }) => { seen = signal; return new Promise<never>(() => undefined); });
    await expect(look({ callId: "c", executeTool })).rejects.toMatchObject({ name: "TimeoutError" });
    expect(seen?.aborted).toBe(true);
  });

  it("is not offered where the domain has no free look, or declares no view keys", () => {
    expect(automationStudioEndViewLook({ tools: [{ toolId: "press" }], viewKeys: ["page"] })).toBeUndefined();
    expect(automationStudioEndViewLook({ tools, viewKeys: undefined })).toBeUndefined();
    expect(automationStudioEndViewLook({ tools, viewKeys: ["read.rows"] })).toBeUndefined();
  });
});

describe("the post-run check's look at the page the run ended on", () => {
  it("is the binding's free look, sent for the run's own project and Flow under a check that permits nothing gated", async () => {
    const executeTool = vi.fn(async (_call: Parameters<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>[0]) => page());
    const read = automationStudioRunEndViewReader(binding(executeTool))!;
    expect(await read({ projectId: "project-1", runId: "run-1", flowId: "flow-1" })).toEqual({ view: { page: PAGE } });
    const sent = executeTool.mock.calls[0]?.[0] as unknown as Parameters<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>[0];
    expect(sent).toMatchObject({ projectId: "project-1", flowId: "flow-1", callId: "result-check.end-view.run-1", toolId: "core.run_node", value: LOOK });
    expect(await sent.permission({ consequences: ["move_money"], control: { name: "Place order", kind: "button" }, verb: "press" })).toMatchObject({ permitted: false });
    expect(sent).not.toHaveProperty("startLocation");
  });

  it("is not offered for a binding with no free look", () => {
    expect(automationStudioRunEndViewReader(undefined)).toBeUndefined();
    expect(automationStudioRunEndViewReader(binding(async () => page(), { runsNodes: {} }))).toBeUndefined();
  });

  it("reaches the post-run judge when the host gives one, and the run is judged without one when it gives none", async () => {
    const context = harness({ answer: "yes" });
    const read = automationStudioRunEndViewReader(binding(async () => page()))!;
    await verify(context, { ports: { ...context.ports, deniedEvidenceKeys: DENIED, readEndView: read } });
    expect(context.requests[0]?.context.resultSummary?.endView).toEqual({ view: { page: PAGE } });

    const none = harness({ answer: "yes" });
    const silent = automationStudioRunEndViewReader(binding(async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false })))!;
    const next = await verify(none, { ports: { ...none.ports, deniedEvidenceKeys: DENIED, readEndView: silent } });
    expect(none.requests).toHaveLength(1);
    expect(none.requests[0]?.context.resultSummary).not.toHaveProperty("endView");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "confirmed" });
  });
});
