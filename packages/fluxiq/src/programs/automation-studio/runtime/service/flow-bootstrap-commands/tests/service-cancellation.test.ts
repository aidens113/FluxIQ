import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

it("cancels before provider dispatch and does not persist a proposal", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-cancel-before-"));
  let calls = 0;
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => {
    calls++; return { provider: mockProvider(), maxCallsPerRun: 1, maxEstimatedCostUsd: 0.1 };
  } });
  try {
    const { project, flow } = await blankFixture(service);
    const propose = vi.spyOn(service, "createFlowBootstrapAdaptation");
    const building = service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller() });
    const rejected = expect(building).rejects.toMatchObject({ name: "AbortError" });
    expect(service.buildCancellation.cancel(project.id, flow.flowId)).toBe(true);
    await rejected;
    expect(calls).toBe(0);
    expect(propose).not.toHaveBeenCalled();
  } finally { await service.close(); await rm(dataDir, { recursive: true, force: true }); }
}, 30_000);

it("refuses a late successful provider result and leaves the accepted Flow unchanged", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-cancel-late-"));
  let release!: () => void;
  let started!: () => void;
  let calls = 0;
  const inProvider = new Promise<void>((resolve) => { started = resolve; });
  const provider = mockProvider(async () => {
    calls++; started(); await new Promise<void>((resolve) => { release = resolve; });
    return { response: { kind: "flow_bootstrap", summary: "Late success", plan: plan() }, usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 } };
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 1, maxEstimatedCostUsd: 0.1 }) });
  try {
    const { project, flow } = await blankFixture(service);
    const propose = vi.spyOn(service, "createFlowBootstrapAdaptation");
    const before = await service.getFlow(project.id, flow.flowId);
    const building = service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller() });
    const rejected = expect(building).rejects.toMatchObject({ name: "AbortError", cause: { diagnostic: { accounting: { estimatedInputTokens: expect.any(Number) } } } });
    await inProvider;
    const queued = service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller() });
    const queuedRejected = expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(service.buildCancellation.cancel(project.id, flow.flowId)).toBe(true);
    release(); await rejected; await queuedRejected;
    expect(calls).toBe(1);
    expect(propose).not.toHaveBeenCalled();
    expect(await service.getFlow(project.id, flow.flowId)).toEqual(before);
    expect(service.buildCancellation.cancel(project.id, flow.flowId)).toBe(false);
  } finally { await service.close(); await rm(dataDir, { recursive: true, force: true }); }
}, 30_000);

it("cancels during an actual evidence tool and never dispatches another provider/tool or proposal", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-cancel-tool-"));
  let release!: () => void, started!: () => void, calls = 0, tools = 0;
  const inTool = new Promise<void>(resolve => { started = resolve; });
  const provider = mockProvider(async () => {
    calls++;
    return { response: { kind: "evidence_tool_decision", summary: "Inspect", decision: { kind: "tool_call", callId: `inspect-${calls}`, toolId: "inspect", input: {} } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
  });
  const service = new AutomationStudioService({ dataDir,
    llmProviderResolver: () => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }], executeTool: async () => {
      tools++; started(); await new Promise<void>(resolve => { release = resolve; }); return { looked: true };
    } }
  });
  try {
    const { project, flow } = await blankFixture(service), before = await service.getFlow(project.id, flow.flowId);
    const propose = vi.spyOn(service, "createFlowBootstrapAdaptation");
    const building = service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true });
    const rejected = expect(building).rejects.toMatchObject({ name: "AbortError" });
    await inTool;
    expect(service.buildCancellation.cancel(project.id, flow.flowId)).toBe(true);
    release(); await rejected;
    expect(calls).toBe(1); expect(tools).toBe(1); expect(propose).not.toHaveBeenCalled();
    expect(await service.getFlow(project.id, flow.flowId)).toEqual(before);
  } finally { release?.(); await service.close(); await rm(dataDir, { recursive: true, force: true }); }
}, 30_000);
