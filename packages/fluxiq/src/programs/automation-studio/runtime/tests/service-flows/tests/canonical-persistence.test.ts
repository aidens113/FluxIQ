import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCallFlowNode } from "../../../../model/index.ts";
import { generateFlowTypeScript } from "../../../../dsl/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
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

  it("persists new canonical Flows in project files with project scope enforcement", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" });
    const globalProject = await service.createProject({ name: "Global" });
    const flow = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.submit", name: "Submit order" });
    await expect(service.createFlow({ projectId: domainProject.id, flowId: flow.flowId, name: "Accidental overwrite" })).rejects.toThrow("already exists");

    expect(flow.scope).toEqual({ kind: "domain", domainId: "orders" });
    await expect(service.saveFlow({ projectId: globalProject.id, flow: { ...flow, projectId: globalProject.id } })).rejects.toThrow("scope");
    const published = await service.publishFlow({ projectId: domainProject.id, flowId: flow.flowId, version: "1.0.0", flowDigest: "sha256:submit-order" });
    expect(published).toMatchObject({ visibility: "public", publication: { status: "published", version: "1.0.0" } });
    await expect(service.listFlowPublications(domainProject.id, flow.flowId)).resolves.toMatchObject([{ flowId: flow.flowId, version: "1.0.0", status: "published" }]);
    await expect(service.saveFlow({ projectId: domainProject.id, flow: { ...published, publicationHistory: [] } })).rejects.toThrow("publication history is immutable");
    await expect(service.saveFlow({ projectId: domainProject.id, flow: { ...published, publication: { status: "draft" } } })).rejects.toThrow("snapshot metadata is immutable");

    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    const entries = await reloaded.listFlows(domainProject.id);
    expect(entries.find((entry) => entry.source === "canonical")?.flow).toMatchObject({ flowId: flow.flowId, projectId: domainProject.id });
    await expect(reloaded.deprecateFlowPublication({ projectId: domainProject.id, flowId: flow.flowId, version: "1.0.0", reason: "Use 2.0.0" })).resolves.toMatchObject({ status: "deprecated", deprecationReason: "Use 2.0.0" });
    await expect(reloaded.listPublishedFlowNodes(domainProject.id)).resolves.toEqual([]);
    await expect(reloaded.getFlow(globalProject.id, flow.flowId)).rejects.toThrow("Unknown Automation Studio Flow");
  });

  it("creates Flows without hydrating every persisted Flow in the project", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Large Flow Project" });
    await service.createFlow({ projectId: project.id, flowId: "flow.persisted", name: "Persisted" });

    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    ((reloaded as any).catalogue as { loadProjectFlows: () => Promise<void> }).loadProjectFlows = async () => {
      throw new Error("full project Flow hydration should not be used for createFlow");
    };

    await expect(reloaded.createFlow({ projectId: project.id, flowId: "flow.new", name: "New Flow" })).resolves.toMatchObject({
      flowId: "flow.new",
      projectId: project.id,
      name: "New Flow"
    });
    await expect(reloaded.createFlow({ projectId: project.id, flowId: "flow.persisted", name: "Duplicate" })).rejects.toThrow("already exists");
  });

  it("runs the selected canonical Flow with its compiled region plan", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Canonical runtime" });
    const blank = await service.createFlow({ projectId: project.id, flowId: "flow.canonical.runtime", name: "Canonical runtime" });
    await installPrimaryRouter(service, project.id, blank.flowId, {
      nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "canonical" } }],
      edges: [{ id: "start.value", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "value", targetPortId: "in" }],
      regions: [{ id: "deterministic", name: "Deterministic", kind: "deterministic", nodeIds: ["start", "value"], entryPorts: [], exitPorts: [] }]
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: blank.flowId });
    expect(run).toMatchObject({ status: "succeeded", targetKind: "flow", flowId: blank.flowId, metadata: { canonicalFlow: true } });
    expect(run.trace?.attempts.map((attempt) => attempt.regionId)).toEqual(["deterministic", "deterministic"]);
    expect(run.trace?.values.value).toBe("canonical");
  });

  it("requires an explicit per-run grant for global-to-domain Call Flow execution", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(new IoRegistry(), "orders");
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" });
    const globalProject = await service.createProject({ name: "Global orchestrator" });
    const child = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.child", name: "Orders child" });
    const childExecutable = await installPrimaryRouter(service, domainProject.id, child.flowId, { nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "end", definitionId: "builtin.control.end" }], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }] });
    const publishedChild = await service.publishFlow({ projectId: domainProject.id, flowId: childExecutable.graph.flowId, version: "1.0.0" });
    expect((publishedChild.publication as any).snapshot.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId: "builtin.control.start", definitionVersion: "1.0.0" })]));
    const parent = await service.createFlow({ projectId: globalProject.id, flowId: "flow.global.parent", name: "Global parent" });
    const parentExecutable = await installPrimaryRouter(service, globalProject.id, parent.flowId, { nodes: [{ id: "start", definitionId: "builtin.control.start" }, createCallFlowNode({ id: "call", target: { flowId: childExecutable.graph.flowId, version: "1.0.0", scope: { kind: "domain", domainId: "orders" } } })], edges: [{ id: "start.call", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "call", targetPortId: "in" }] });
    await service.saveFlow({ projectId: globalProject.id, flow: { ...parentExecutable.graph, executionDefaults: { authorizedDomainIds: ["orders"] } } });
    expect((await service.inspectFlowDependencies(domainProject.id, childExecutable.graph.flowId)).usedBy).toEqual([]);
    await expect(service.runRuntimeSession({ projectId: globalProject.id, flowId: parent.flowId })).resolves.toMatchObject({ status: "failed", trace: { message: expect.stringContaining("cross_scope_call_not_authorized") } });
    const granted = await service.runRuntimeSession({ projectId: globalProject.id, flowId: parent.flowId, authorizedDomainIds: ["orders"] });
    expect(granted).toMatchObject({
      status: "succeeded",
      trace: {
        attempts: expect.arrayContaining([
          expect.objectContaining({
            nodeId: "call",
            compositeTarget: {
              flowId: childExecutable.graph.flowId,
              version: "1.0.0",
              flowDigest: (publishedChild.publication as any).flowDigest
            }
          })
        ])
      }
    });
  });

  it("converts source ownership explicitly and rejects uncompiled code-owned edits", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Source ownership" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.source", name: "Source" });
    const { graph: blank, subflow } = await installPrimaryRouter(service, project.id, parent.flowId, { nodes: [], edges: [] });
    const generatedSourcePath = path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", blank.flowId, "source", "flows", `${blank.flowId}.flow.ts`);
    await expect(readFile(generatedSourcePath, "utf8")).resolves.toContain(`flowId": "${blank.flowId}"`);
    expect(blank.metadata).toMatchObject({ generatedSource: { moduleId: `flows/${blank.flowId}.flow.ts`, relativePath: `flows/${blank.flowId}/source/flows/${blank.flowId}.flow.ts`, authoritative: false } });
    await expect(service.getProjectArtifact(project.id, "config", `flow.${blank.flowId}.config`)).resolves.toMatchObject({
      configId: `flow.${blank.flowId}.config`,
      metadata: { generated: true, ownerKind: "flow", flowId: blank.flowId },
      values: { flowId: blank.flowId, name: "Primary Graph", source: { mode: "visual" } }
    });
    const visual = await service.saveFlow({ projectId: project.id, flow: { ...blank, nodes: [{ id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } }] } });
    await expect(service.getProjectArtifact(project.id, "config", `flow.${blank.flowId}.config`)).resolves.toMatchObject({
      values: { flowId: blank.flowId, source: { mode: "visual" } }
    });
    const converted = await service.compileAndSaveFlowSource({ projectId: project.id, flowId: visual.flowId, moduleId: "flows/source.flow.ts", sourceText: generateFlowTypeScript(visual) });
    expect(converted.compilation.ok).toBe(true);
    expect(converted.flow?.source).toMatchObject({ mode: "code", moduleId: "flows/source.flow.ts", compilerVersion: "0.1" });
    await expect(readFile(path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", blank.flowId, "source", "flows", "source.flow.ts"), "utf8")).resolves.toContain(`flowId": "${blank.flowId}"`);
    await expect(service.getProjectArtifact(project.id, "config", `flow.${blank.flowId}.config`)).resolves.toMatchObject({
      values: { flowId: blank.flowId, source: { mode: "code", moduleId: "flows/source.flow.ts" } }
    });
    await expect(service.saveFlow({ projectId: project.id, flow: { ...converted.flow!, nodes: [...converted.flow!.nodes, { id: "tampered", definitionId: "builtin.control.end" }] } })).rejects.toThrow("compiler digest");
    await expect(service.saveFlow({ projectId: project.id, flow: { ...converted.flow!, source: { mode: "visual" } } })).rejects.toThrow("explicit conversion");
    await expect(service.convertFlowToVisual({ projectId: project.id, flowId: visual.flowId })).resolves.toMatchObject({ source: { mode: "visual" }, publication: { status: "draft" } });
    await expect(service.getProjectArtifact(project.id, "config", `flow.${blank.flowId}.config`)).resolves.toMatchObject({
      values: { flowId: blank.flowId, source: { mode: "visual" } }
    });
    await service.setFlowMapFallback({ projectId: project.id, flowId: parent.flowId, kind: "fail", message: "Source graph removed." });
    await expect(service.deleteFlowSubflow({ projectId: project.id, flowId: parent.flowId, subflowId: subflow.subflowId })).resolves.toMatchObject({ deletedSubflowId: subflow.subflowId, deletedGraphFlowId: visual.flowId });
    await expect(service.getProjectArtifact(project.id, "config", `flow.${blank.flowId}.config`)).rejects.toThrow("Unknown Automation Studio config");
  });

  it("exposes and executes explicitly bound domain-native nodes only in their project scope", async () => {
    const definition = { schemaVersion: "0.1" as const, id: "orders.total", version: "1.0.0", label: "Order total", description: "Calculates total", category: "Orders", source: { kind: "importer" as const, domainId: "orders", packageId: "orders.package", implementationKey: "total" }, availability: { kind: "domain" as const, domainId: "orders" }, capabilities: { executable: true as const }, inputs: [], outputs: [{ id: "total", label: "Total", valueType: "number" as const }], parameters: [] };
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "orders.package", packageVersion: "1.0.0", domainId: "orders", nodes: [definition] };
    const native = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "orders.package", packageVersion: "1.0.0", implementations: { total: () => ({ outputs: { total: 42 } }) } });
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindNativeNodeRuntime(native);
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" }); const globalProject = await service.createProject({ name: "Global" });
    expect(await service.listNativeNodeDefinitions(domainProject.id)).toMatchObject([{ id: "orders.total" }]); expect(await service.listNativeNodeDefinitions(globalProject.id)).toEqual([]);
    const blank = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.native", name: "Native" });
    await installPrimaryRouter(service, domainProject.id, blank.flowId, { nodes: [{ id: "total", definitionId: "orders.total" }], edges: [] });
    await expect(service.runRuntimeSession({ projectId: domainProject.id, flowId: blank.flowId })).resolves.toMatchObject({ status: "succeeded", trace: { values: { total: 42 } } });
  });

  it("inspects and applies non-destructive legacy Flow migration idempotently", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Migration" });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: {
        schemaVersion: "0.1",
        taskId: "task.legacy",
        name: "Legacy task",
        recordingIds: [],
        createdAt: 100,
        updatedAt: 100
      }
    });

    const inspection = await service.inspectFlowMigration(project.id);
    expect(inspection).toMatchObject({ migrationNeeded: true, outcomes: [{ legacyKind: "task", status: "created" }] });
    const migration = await service.migrateFlows(project.id);
    expect(migration.status).toBe("completed");
    expect(migration.outcomes[0]).toMatchObject({ status: "created" });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [{ taskId: "task.legacy" }] });

    const backup = await service.exportLegacyProject(project.id);
    expect(backup).toMatchObject({ backupId: migration.backupId, artifacts: { tasks: [{ taskId: "task.legacy" }] } });
    await service.verifyLegacyBackup(project.id, backup.backupId);
    await service.recordLegacyRetirementEvidence({ projectId: project.id, importerCoverageAcknowledged: true, importerEvidence: [{ packageId: "example.importer", packageVersion: "1.0.0", status: "validated" }] });
    await expect(service.inspectLegacyRetirement(project.id)).resolves.toMatchObject({ canLockWrites: true, unmigrated: [] });

    const rollbackPlan = await service.planFlowMigrationRollback(project.id, migration.migrationId);
    expect(rollbackPlan.status).toBe("ready");
    await expect(service.rollbackFlowMigration(project.id, migration.migrationId)).resolves.toMatchObject({ status: "applied" });
    await expect(service.rollbackFlowMigration(project.id, migration.migrationId)).resolves.toMatchObject({ status: "applied", flowIds: [] });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [{ taskId: "task.legacy" }] });
    expect((await service.inspectFlowMigration(project.id)).migrationNeeded).toBe(true);
    const remigration = await service.migrateFlows(project.id);
    const remigratedFlow = await service.getFlow(project.id, remigration.outcomes[0]!.flowId);
    await service.saveFlow({ projectId: project.id, flow: { ...remigratedFlow, name: "Operator edited migrated Flow" } });
    await expect(service.planFlowMigrationRollback(project.id, remigration.migrationId)).resolves.toMatchObject({ status: "blocked", blockers: [expect.stringContaining("changed after migration")] });

    const secondInspection = await service.inspectFlowMigration(project.id);
    expect(secondInspection).toMatchObject({ migrationNeeded: false, outcomes: [{ status: "already_migrated" }] });
    const secondMigration = await service.migrateFlows(project.id);
    expect(secondMigration.outcomes[0]).toMatchObject({ status: "already_migrated" });

    const sealed = await service.sealLegacyWrites({ projectId: project.id, expectedSchemaVersion: "0.2" });
    expect(sealed).toMatchObject({ state: { phase: "write_locked", projectSchemaVersion: "0.2" }, diagnostic: { code: "legacy.write_locked" } });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "task", artifact: { taskId: "task.blocked", name: "Blocked", recordingIds: [] } })).rejects.toMatchObject({ code: "legacy.write_locked" });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "flow", artifact: { flowId: "task.blocked.flow", ownerKind: "task", ownerId: "task.blocked", name: "Blocked" } })).rejects.toMatchObject({ code: "legacy.write_locked" });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "config", artifact: { configId: "config.allowed", name: "Allowed" } })).resolves.toMatchObject({ configId: "config.allowed" });
    await expect(service.getProjectArtifact(project.id, "task", "task.legacy")).resolves.toMatchObject({ taskId: "task.legacy" });
    expect((await service.listLegacyRetirementAudit(project.id)).map((event) => event.type)).toEqual(expect.arrayContaining(["backup_created", "backup_verified", "migration_applied", "rollback_applied", "writes_locked"]));
  });

  it("rejects stale Flow saves without overwriting the current revision", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Save conflicts" });
    const created = await service.createFlow({ projectId: project.id, flowId: "flow.conflict", name: "Original" });
    const saved = await service.saveFlow({ projectId: project.id, expectedUpdatedAt: created.updatedAt, flow: { ...created, name: "Current revision" } });

    await expect(service.saveFlow({ projectId: project.id, expectedUpdatedAt: saved.updatedAt + 1, flow: { ...saved, name: "Stale overwrite" } })).rejects.toThrow("FLOW_SAVE_CONFLICT");
    await expect(service.getFlow(project.id, created.flowId)).resolves.toMatchObject({ name: "Current revision" });
  });

  it("finalizes recordings idempotently and rejects every later event, note, or marker mutation", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Final recording immutability" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.final", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "ready", payload: {}, timestamp: 10 } });
    const first = await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 20 });
    const second = await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 999 });
    expect(second.endedAt).toBe(first.endedAt);
    expect(second.timeline).toHaveLength(first.timeline.length);
    await expect(service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "late", payload: {} } })).rejects.toThrow("Finalized recordings are immutable");
    await expect(service.appendRecordingNoteEntry({ projectId: project.id, recordingId: recording.recordingId, text: "late note" })).rejects.toThrow("Finalized recordings are immutable");
    await expect(service.appendRecordingMarkerEntry({ projectId: project.id, recordingId: recording.recordingId, label: "late marker" })).rejects.toThrow("Finalized recordings are immutable");
  });
});
