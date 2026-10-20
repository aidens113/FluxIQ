// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { getPrimarySubflowGraph, installPrimaryRouter } from "../../service-fixtures.ts";

// An applied repair is durably saved, or the apply says it was not (t508).
// Both apply paths are covered: the typed graph transaction, taken once the
// Subflow graph has a revision chain, and the file-based apply, taken before it
// has one or for a change the transaction cannot carry.

// Heavy service test: under full-suite load these run past the 15 s default (t289).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe("Automation Studio adaptation apply writes", () => {
  let dataDir: string;
  let service: AutomationStudioService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-adaptation-durable-write-"));
    service = new AutomationStudioService({ dataDir, seedFixture: false });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  async function primaryFlow(input: { chained: boolean }) {
    const project = await service.createProject({ name: "Durable write" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.durable-write", name: "Durable write" });
    const primary = await installPrimaryRouter(service, project.id, flow.flowId, {
      nodes: [
        { id: "action.submit", definitionId: "builtin.policy.action", parameterValues: { parameters: { target: { selector: "#old" } } } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: []
    });
    const graphFlowId = primary.subflow.graphFlowId!;
    // Reading the graph's viewport indexes it, which starts its revision chain.
    if (input.chained) await service.getFlowGraphViewport({ projectId: project.id, flowId: graphFlowId, bounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 } });
    return { projectId: project.id, flowId: flow.flowId, subflowId: primary.subflow.subflowId, graphFlowId };
  }

  function targetChange(scope: { projectId: string; flowId: string; subflowId: string }, adaptationId: string, extra: Partial<AutomationStudioFlowAdaptation> = {}): AutomationStudioFlowAdaptation {
    return {
      schemaVersion: "0.1",
      ...scope,
      adaptationId,
      trigger: "Recorded target changed",
      patch: [{ kind: "edit_action_target", targetId: "action.submit", summary: "Use the new target.", after: { selector: "#new" } }],
      validationResults: [{ runId: "run.validation", status: "succeeded", checkedAt: 20 }],
      status: "validated",
      author: "runtime",
      riskLevel: "low",
      createdAt: 10,
      updatedAt: 10,
      ...extra
    };
  }

  async function submitNode(projectId: string, flowId: string) {
    return (await getPrimarySubflowGraph(service, projectId, flowId)).nodes.find((node) => node.id === "action.submit");
  }

  async function storedSummary(projectId: string, flowId: string, adaptationId: string) {
    const page = await service.listFlowAdaptationSummaries({ projectId, flowId, limit: 10, offset: 0 });
    return page.adaptations.find((item) => item.adaptationId === adaptationId);
  }

  it("fails a typed apply whose updated Flow cannot be written, rolls its graph change back and records it as not applied", async () => {
    const scope = await primaryFlow({ chained: true });
    await service.saveFlowAdaptation(targetChange(scope, "adaptation.unwritten"));
    vi.spyOn((service as any).flows, "writeProjectFlow").mockRejectedValueOnce(new Error("disk full"));

    await expect(service.reviewFlowAdaptation({ projectId: scope.projectId, flowId: scope.flowId, adaptationId: "adaptation.unwritten", action: "apply" }))
      .rejects.toThrow("Adaptation adaptation.unwritten was not applied: the updated Flow could not be written (disk full). Its graph change was rolled back.");

    expect((await submitNode(scope.projectId, scope.flowId))?.parameterValues).toEqual({ parameters: { target: { selector: "#old" } } });
    // Not applied: the graph held the change at revision 2 only until the rollback at 3, and the record says so.
    expect(await storedSummary(scope.projectId, scope.flowId, "adaptation.unwritten")).toMatchObject({ status: "reverted" });
    await expect(service.getFlowAdaptation(scope.projectId, scope.flowId, "adaptation.unwritten")).resolves.toMatchObject({ status: "reverted", metadata: { rollbackRevision: 3 } });
    expect((await getPrimarySubflowGraph(service, scope.projectId, scope.flowId)).metadata?.graphRevision).toBe(3);
  });

  it("applies a typed change whose Flow is written, stamping the node and recording the revision it produced", async () => {
    const scope = await primaryFlow({ chained: true });
    await service.saveFlowAdaptation(targetChange(scope, "adaptation.typed"));

    await expect(service.reviewFlowAdaptation({ projectId: scope.projectId, flowId: scope.flowId, adaptationId: "adaptation.typed", action: "apply" }))
      .resolves.toMatchObject({ status: "applied" });

    const node = await submitNode(scope.projectId, scope.flowId);
    expect(node?.parameterValues).toMatchObject({ parameters: { target: { selector: "#new" } } });
    expect(node?.metadata).toMatchObject({ adaptationIds: ["adaptation.typed"] });
    const stored = await storedSummary(scope.projectId, scope.flowId, "adaptation.typed");
    expect(stored).toMatchObject({ status: "applied", baseRevision: 1, appliedRevision: 2 });
  });

  it("fails a file-based apply whose Flow write throws and leaves the change unapplied", async () => {
    const scope = await primaryFlow({ chained: false });
    await service.saveFlowAdaptation(targetChange(scope, "adaptation.file-unwritten"));
    vi.spyOn((service as any).flows, "writeProjectFlow").mockRejectedValueOnce(new Error("disk full"));

    await expect(service.reviewFlowAdaptation({ projectId: scope.projectId, flowId: scope.flowId, adaptationId: "adaptation.file-unwritten", action: "apply" }))
      .rejects.toThrow("disk full");

    expect((await submitNode(scope.projectId, scope.flowId))?.parameterValues).toEqual({ parameters: { target: { selector: "#old" } } });
    expect((await storedSummary(scope.projectId, scope.flowId, "adaptation.file-unwritten"))?.status).toBe("validated");
  });

  it("fails a file-based apply whose parent Flow write throws, undoing the node change and leaving no parent claim", async () => {
    const scope = await primaryFlow({ chained: false });
    await service.saveFlowAdaptation(targetChange(scope, "adaptation.parent-unwritten"));
    const flows = (service as any).flows;
    const write = flows.writeProjectFlow.bind(flows);
    // The Subflow graph's save succeeds; the parent Flow's, which records the change on it, does not.
    vi.spyOn(flows, "writeProjectFlow").mockImplementationOnce(write).mockRejectedValueOnce(new Error("disk full"));

    await expect(service.reviewFlowAdaptation({ projectId: scope.projectId, flowId: scope.flowId, adaptationId: "adaptation.parent-unwritten", action: "apply" }))
      .rejects.toThrow("disk full");

    expect((await submitNode(scope.projectId, scope.flowId))?.parameterValues).toEqual({ parameters: { target: { selector: "#old" } } });
    expect((await service.getFlow(scope.projectId, scope.flowId)).metadata?.appliedAdaptationIds ?? []).not.toContain("adaptation.parent-unwritten");
    expect((await storedSummary(scope.projectId, scope.flowId, "adaptation.parent-unwritten"))?.status).toBe("validated");
  });

  it("stamps the node a file-based apply wrote, and records no revision for a graph that has no revision chain", async () => {
    const scope = await primaryFlow({ chained: false });
    await service.saveFlowAdaptation(targetChange(scope, "adaptation.file"));

    await expect(service.reviewFlowAdaptation({ projectId: scope.projectId, flowId: scope.flowId, adaptationId: "adaptation.file", action: "apply" }))
      .resolves.toMatchObject({ status: "applied", metadata: { applicationRecord: { durable: true } } });

    const node = await submitNode(scope.projectId, scope.flowId);
    expect(node?.parameterValues).toMatchObject({ parameters: { target: { selector: "#new" } } });
    expect(node?.metadata).toMatchObject({ adaptationIds: ["adaptation.file"] });
    const stored = await storedSummary(scope.projectId, scope.flowId, "adaptation.file");
    expect(stored).toMatchObject({ status: "applied", baseRevision: 1 });
    // The summary type leaves the revision fields to the typed store's projection.
    expect((stored as { appliedRevision?: number } | undefined)?.appliedRevision).toBeUndefined();
  });

  it("records the new revision a file-based apply produced on a graph with a revision chain", async () => {
    const scope = await primaryFlow({ chained: true });
    const subflowEdit = { kind: "edit_subflow" as const, targetId: scope.subflowId, summary: "Describe the repaired step.", after: { description: "Submits with the new target." } };
    await service.saveFlowChangeProposal({
      schemaVersion: "0.1",
      proposalId: "proposal.file-chained",
      flowId: scope.flowId,
      projectId: scope.projectId,
      mode: "auto",
      status: "auto_approved",
      riskLevel: "low",
      patches: [subflowEdit],
      createdBy: "runtime",
      createdAt: 30,
      updatedAt: 30
    });
    // A Subflow edit beside the node edit: the graph transaction cannot carry it, so the file-based apply takes the change.
    const change = targetChange(scope, "adaptation.file-chained", { proposalId: "proposal.file-chained" });
    await service.saveFlowAdaptation({ ...change, patch: [...change.patch, subflowEdit] });

    await expect(service.reviewFlowAdaptation({ projectId: scope.projectId, flowId: scope.flowId, adaptationId: "adaptation.file-chained", action: "apply" }))
      .resolves.toMatchObject({ status: "applied", metadata: { applicationRecord: { durable: true } } });

    const graph = await getPrimarySubflowGraph(service, scope.projectId, scope.flowId);
    expect(graph.metadata?.graphRevision).toBe(2);
    expect(graph.nodes.find((node) => node.id === "action.submit")?.metadata).toMatchObject({ adaptationIds: ["adaptation.file-chained"] });
    const stored = await storedSummary(scope.projectId, scope.flowId, "adaptation.file-chained");
    expect(stored).toMatchObject({ status: "applied", baseRevision: 1, appliedRevision: 2 });
  });
});
