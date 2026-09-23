import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAutomationStudioFlowExpansionFixture, createCallFlowNode } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioLlmExecutionGrantService } from "../../../llm/index.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectGraphRepository } from "../../../../storage/index.ts";
import { installPrimaryRouter } from "../../service-fixtures.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

describe("AutomationStudioService canonical Flow persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("changes the LLM execution digest for same-timestamp parent and routed dependencies", async () => {
    const originalNow = Date.now;
    Date.now = () => 10_000;
    try {
      const service = createService({ dataDir: tempRoot, seedFixture: false });
      const project = await service.createProject({ name: "Execution Digest" });
      const parent = await service.createFlow({ projectId: project.id, flowId: "flow.execution-digest", name: "Execution Digest" });
      const installed = await installPrimaryRouter(service, project.id, parent.flowId, {
        nodes: [{ id: "start", definitionId: "builtin.control.start", parameterValues: {} }],
        edges: []
      });
      const initial = await service.getLlmExecutionDependencyDigest(project.id, parent.flowId);

      const changedParent = await service.saveFlow({ projectId: project.id, flow: { ...parent, description: "same millisecond parent mutation" } });
      expect(changedParent.updatedAt).toBe(parent.updatedAt);
      const afterParent = await service.getLlmExecutionDependencyDigest(project.id, parent.flowId);
      expect(afterParent).not.toBe(initial);

      const changedGraph = await service.saveFlow({ projectId: project.id, flow: { ...installed.graph, description: "same millisecond graph mutation" } });
      expect(changedGraph.updatedAt).toBe(installed.graph.updatedAt);
      const afterGraph = await service.getLlmExecutionDependencyDigest(project.id, parent.flowId);
      expect(afterGraph).not.toBe(afterParent);

      const graphPool = new AutomationStudioProjectDatabasePool({ rootDir: path.join(tempRoot, "programs", "automation-studio") });
      const canonicalGraph = await AutomationStudioProjectGraphRepository.open({ pool: graphPool, projectId: project.id });
      const graphRevision = await canonicalGraph.getFlowRevision(installed.graph.flowId);
      await canonicalGraph.applyPatch({
        pool: graphPool,
        projectId: project.id,
        flowId: installed.graph.flowId,
        baseRevision: graphRevision,
        mutationId: "execution-digest.direct-subflow-graph-patch",
        operations: [{
          op: "add_node",
          node: {
            nodeId: "sql-only-node",
            flowId: installed.graph.flowId,
            definitionId: "builtin.data.constant",
            definitionVersion: "legacy",
            label: "SQL-only dependency",
            description: "",
            x: 200,
            y: 0,
            width: 240,
            height: 96,
            zIndex: 0,
            disabled: false,
            parameterValues: { value: "changed" },
            metadata: {}
          }
        }],
        changedAt: 10_000
      });
      await canonicalGraph.close();
      await graphPool.closeAll();
      const afterCanonicalGraphPatch = await service.getLlmExecutionDependencyDigest(project.id, parent.flowId);
      expect(afterCanonicalGraphPatch).not.toBe(afterGraph);

      const router = await service.getFlowRouter(project.id, parent.flowId);
      if (!router) throw new Error("Expected Flow Map router");
      await service.saveFlowRouter({ ...router, description: "same millisecond router mutation" });
      const afterRouter = await service.getLlmExecutionDependencyDigest(project.id, parent.flowId);
      expect(afterRouter).not.toBe(afterCanonicalGraphPatch);

      await service.updateFlowSubflow({
        projectId: project.id,
        flowId: parent.flowId,
        subflowId: installed.subflow.subflowId,
        name: "Renamed dependency"
      });
      const afterSubflow = await service.getLlmExecutionDependencyDigest(project.id, parent.flowId);
      expect(afterSubflow).not.toBe(afterRouter);

      const instruction = createAutomationStudioFlowExpansionFixture(1).instructions[0]!;
      await service.saveFlowInstruction(project.id, {
        ...instruction,
        scope: { kind: "flow", projectId: project.id, flowId: parent.flowId }
      });
      const afterInstruction = await service.getLlmExecutionDependencyDigest(project.id, parent.flowId);
      expect(afterInstruction).not.toBe(afterSubflow);
    } finally {
      Date.now = originalNow;
    }
  });

  it("binds the execution digest to transitive pinned publications and lifecycle validity", async () => {
    const originalNow = Date.now;
    Date.now = () => 20_000;
    try {
      const service = createService({ dataDir: tempRoot, seedFixture: false });
      const project = await service.createProject({ name: "Published dependency digest" });

      const leafParent = await service.createFlow({ projectId: project.id, flowId: "flow.digest.leaf-parent", name: "Leaf parent" });
      const leaf = await installPrimaryRouter(service, project.id, leafParent.flowId, {
        nodes: [
          { id: "start", definitionId: "builtin.control.start" },
          { id: "end", definitionId: "builtin.control.end" }
        ],
        edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
      });
      const publishedLeaf = await service.publishFlow({ projectId: project.id, flowId: leaf.graph.flowId, version: "1.0.0" });

      const middleParent = await service.createFlow({ projectId: project.id, flowId: "flow.digest.middle-parent", name: "Middle parent" });
      const middle = await installPrimaryRouter(service, project.id, middleParent.flowId, {
        nodes: [
          { id: "start", definitionId: "builtin.control.start" },
          createCallFlowNode({ id: "call-leaf", target: { flowId: leaf.graph.flowId, version: "1.0.0", scope: { kind: "global" } } })
        ],
        edges: [{ id: "start.leaf", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "call-leaf", targetPortId: "in" }]
      });
      const publishedMiddle = await service.publishFlow({ projectId: project.id, flowId: middle.graph.flowId, version: "1.0.0" });

      const root = await service.createFlow({ projectId: project.id, flowId: "flow.digest.root", name: "Root" });
      await installPrimaryRouter(service, project.id, root.flowId, {
        nodes: [
          { id: "start", definitionId: "builtin.control.start" },
          createCallFlowNode({ id: "call-middle", target: { flowId: middle.graph.flowId, version: "1.0.0", scope: { kind: "global" } } })
        ],
        edges: [{ id: "start.middle", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "call-middle", targetPortId: "in" }]
      });

      const authorized = await service.getLlmExecutionDependencyDigest(project.id, root.flowId);
      await expect(service.getLlmExecutionDependencyDigest(project.id, root.flowId)).resolves.toBe(authorized);

      const records = await service.listFlowPublications(project.id);
      const leafRecord = records.find((record) => record.flowId === leaf.graph.flowId && record.version === "1.0.0");
      if (!leafRecord) throw new Error("Expected pinned leaf publication");
      const publicationRepository = (service as any).repositories.flowPublications;
      await publicationRepository.put({
        ...leafRecord,
        snapshot: {
          ...leafRecord.snapshot,
          name: "Tampered at the same millisecond",
          publishedAt: (publishedLeaf.publication as any).snapshot.publishedAt,
          flowDigest: leafRecord.snapshot.flowDigest
        }
      });
      const afterTransitiveSnapshotMutation = await service.getLlmExecutionDependencyDigest(project.id, root.flowId);
      expect(afterTransitiveSnapshotMutation).not.toBe(authorized);

      await publicationRepository.put(leafRecord);
      await expect(service.getLlmExecutionDependencyDigest(project.id, root.flowId)).resolves.toBe(authorized);

      await service.deprecateFlowPublication({ projectId: project.id, flowId: leaf.graph.flowId, version: "1.0.0" });
      const afterTransitiveDeprecation = await service.getLlmExecutionDependencyDigest(project.id, root.flowId);
      expect(afterTransitiveDeprecation).not.toBe(authorized);
      expect((publishedMiddle.publication as any).snapshot.dependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({ flowId: leaf.graph.flowId, version: "1.0.0" })
      ]));
    } finally {
      Date.now = originalNow;
    }
  });

  it("binds domain grants to external global publications and invalidates JIT use", async () => {
    const originalNow = Date.now;
    Date.now = () => 30_000;
    try {
      const service = createService({ dataDir: tempRoot, seedFixture: false });
      const globalProject = await service.createProject({ name: "External global publications" });
      const domainProject = await service.createProject({ name: "Domain caller", domainId: "orders" });
      const external = await service.createFlow({ projectId: globalProject.id, flowId: "flow.external-global", name: "External global" });
      const publishedExternal = await service.publishFlow({ projectId: globalProject.id, flowId: external.flowId, version: "1.0.0" });
      const caller = await service.createFlow({ projectId: domainProject.id, flowId: "flow.domain-caller", name: "Domain caller" });
      await installPrimaryRouter(service, domainProject.id, caller.flowId, {
        nodes: [createCallFlowNode({ id: "call-external", target: { flowId: external.flowId, version: "1.0.0", scope: { kind: "global" } } })],
        edges: []
      });

      const authorizedDigest = await service.getLlmExecutionDependencyDigest(domainProject.id, caller.flowId);
      await expect(service.getLlmExecutionDependencyDigest(domainProject.id, caller.flowId)).resolves.toBe(authorizedDigest);

      const unrelated = await service.createFlow({ projectId: globalProject.id, flowId: "flow.unrelated-global", name: "Unrelated global" });
      await service.publishFlow({ projectId: globalProject.id, flowId: unrelated.flowId, version: "1.0.0" });
      await expect(service.getLlmExecutionDependencyDigest(domainProject.id, caller.flowId)).resolves.toBe(authorizedDigest);
      const unrelatedRecord = (await service.listFlowPublications(globalProject.id, unrelated.flowId))[0];
      if (!unrelatedRecord) throw new Error("Expected unrelated global publication");
      await (service as any).repositories.flowPublications.put({
        ...unrelatedRecord,
        snapshot: { ...unrelatedRecord.snapshot, name: "Unrelated same-millisecond mutation" }
      });
      await expect(service.getLlmExecutionDependencyDigest(domainProject.id, caller.flowId)).resolves.toBe(authorizedDigest);

      const key = { id: "secret:external", name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "flow", scopeRef: caller.flowId, enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-flash" } };
      let revealCount = 0;
      let fetchCount = 0;
      const grants = new AutomationStudioLlmExecutionGrantService({
        now: () => 30_000,
        resolveExecutionDigest: (projectId, flowId) => service.getLlmExecutionDependencyDigest(projectId, flowId),
        identityAccess: {
          validateSession: async () => ({ user: { id: "user.one", passwordConfigured: true, pinConfigured: true }, session: {}, role: {} })
        } as any,
        secretKeys: {
          getKeySummary: async () => ({ ...key }),
          createSessionRevealAuthorization: async () => ({ authorizationId: "secret-reveal:external", keyId: key.id, keyUpdatedAtMs: key.updatedAtMs, expiresAtMs: 90_000, remainingUses: 1 }),
          revealKeyWithAuthorization: async () => { revealCount += 1; return { key: { ...key }, value: "test-provider-secret" }; },
          revokeRevealAuthorization: () => {}
        } as any,
        fetchImpl: (async () => { fetchCount += 1; throw new Error("transport must not run"); }) as typeof fetch
      });
      const grant = await grants.issue({ actorUserId: "user.one", actorSessionId: "session.one", keyId: key.id, projectId: domainProject.id, flowId: caller.flowId });
      const resolved = await grants.resolve({ grantId: grant.grantId, actorUserId: "user.one", actorSessionId: "session.one", projectId: domainProject.id, flowId: caller.flowId, purpose: "diagnosis_only" });

      const externalRecord = (await service.listFlowPublications(globalProject.id, external.flowId))[0];
      if (!externalRecord) throw new Error("Expected external global publication");
      const publicationRepository = (service as any).repositories.flowPublications;
      await publicationRepository.put({
        ...externalRecord,
        snapshot: {
          ...externalRecord.snapshot,
          name: "Same-millisecond external mutation",
          publishedAt: (publishedExternal.publication as any).snapshot.publishedAt,
          flowDigest: externalRecord.snapshot.flowDigest
        }
      });
      expect(await service.getLlmExecutionDependencyDigest(domainProject.id, caller.flowId)).not.toBe(authorizedDigest);
      await expect(resolved.provider.runTask({
        requestId: "request.external",
        idempotencyKey: "request.external",
        timeoutMs: 20_000,
        estimatedInputTokens: 100,
        maxEstimatedCostUsd: 0.25,
        taskKind: "runtime_diagnosis",
        promptVersion: "v1",
        expectedOutput: "diagnosis",
        tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 },
        context: { schemaVersion: "0.1", taskKind: "runtime_diagnosis", promptVersion: "v1", projectId: domainProject.id, flowId: caller.flowId, instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 } }
      })).rejects.toThrow("LLM execution grant is no longer valid.");
      expect(revealCount).toBe(0);
      expect(fetchCount).toBe(0);

      await publicationRepository.put(externalRecord);
      await expect(service.getLlmExecutionDependencyDigest(domainProject.id, caller.flowId)).resolves.toBe(authorizedDigest);
      await service.deprecateFlowPublication({ projectId: globalProject.id, flowId: external.flowId, version: "1.0.0" });
      expect(await service.getLlmExecutionDependencyDigest(domainProject.id, caller.flowId)).not.toBe(authorizedDigest);
      grants.close();
    } finally {
      Date.now = originalNow;
    }
  });

  it("tracks missing publication appearance and cyclic dependencies independent of insertion order", async () => {
    const originalNow = Date.now;
    Date.now = () => 40_000;
    try {
      const service = createService({ dataDir: tempRoot, seedFixture: false });
      const globalProject = await service.createProject({ name: "Global publication universe" });
      const domainProject = await service.createProject({ name: "Domain publication caller", domainId: "billing" });
      const missingCaller = await service.createFlow({ projectId: domainProject.id, flowId: "flow.missing-publication-caller", name: "Missing caller" });
      await installPrimaryRouter(service, domainProject.id, missingCaller.flowId, {
        nodes: [createCallFlowNode({ id: "call-late", target: { flowId: "flow.global-late", version: "1.0.0", scope: { kind: "global" } } })],
        edges: []
      });
      const missingDigest = await service.getLlmExecutionDependencyDigest(domainProject.id, missingCaller.flowId);
      const late = await service.createFlow({ projectId: globalProject.id, flowId: "flow.global-late", name: "Late global" });
      await service.publishFlow({ projectId: globalProject.id, flowId: late.flowId, version: "1.0.0" });
      expect(await service.getLlmExecutionDependencyDigest(domainProject.id, missingCaller.flowId)).not.toBe(missingDigest);

      const flowA = await service.createFlow({ projectId: globalProject.id, flowId: "flow.cycle-a", name: "Cycle A" });
      await service.publishFlow({ projectId: globalProject.id, flowId: flowA.flowId, version: "1.0.0" });
      const flowBParent = await service.createFlow({ projectId: globalProject.id, flowId: "flow.cycle-b-parent", name: "Cycle B parent" });
      const flowB = await installPrimaryRouter(service, globalProject.id, flowBParent.flowId, {
        nodes: [createCallFlowNode({ id: "call-a", target: { flowId: flowA.flowId, version: "1.0.0", scope: { kind: "global" } } })],
        edges: []
      });
      await service.publishFlow({ projectId: globalProject.id, flowId: flowB.graph.flowId, version: "1.0.0" });
      const cycleCaller = await service.createFlow({ projectId: domainProject.id, flowId: "flow.cycle-caller", name: "Cycle caller" });
      await installPrimaryRouter(service, domainProject.id, cycleCaller.flowId, {
        nodes: [createCallFlowNode({ id: "call-a", target: { flowId: flowA.flowId, version: "1.0.0", scope: { kind: "global" } } })],
        edges: []
      });
      const publicationRepository = (service as any).repositories.flowPublications;
      const records = await service.listFlowPublications(globalProject.id);
      const recordA = records.find((record) => record.flowId === flowA.flowId && record.version === "1.0.0");
      if (!recordA) throw new Error("Expected cycle A publication");
      await publicationRepository.put({
        ...recordA,
        snapshot: {
          ...recordA.snapshot,
          nodes: [createCallFlowNode({ id: "call-b", target: { flowId: flowB.graph.flowId, version: "1.0.0", scope: { kind: "global" } } })],
          flowDigest: recordA.snapshot.flowDigest,
          publishedAt: recordA.snapshot.publishedAt
        }
      });
      const cyclicDigest = await service.getLlmExecutionDependencyDigest(domainProject.id, cycleCaller.flowId);
      await expect(service.getLlmExecutionDependencyDigest(domainProject.id, cycleCaller.flowId)).resolves.toBe(cyclicDigest);

      const reordered = await service.listFlowPublications(globalProject.id);
      for (const record of reordered) await publicationRepository.delete(record.publicationId);
      for (const record of [...reordered].reverse()) await publicationRepository.put(record.flowId === flowA.flowId ? {
        ...record,
        snapshot: { ...record.snapshot, nodes: [createCallFlowNode({ id: "call-b", target: { flowId: flowB.graph.flowId, version: "1.0.0", scope: { kind: "global" } } })] }
      } : record);
      await expect(service.getLlmExecutionDependencyDigest(domainProject.id, cycleCaller.flowId)).resolves.toBe(cyclicDigest);
    } finally {
      Date.now = originalNow;
    }
  });
});
