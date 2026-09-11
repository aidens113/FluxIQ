import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioProject } from "../../../api/contracts.ts";
import { generateFlowTypeScript, verifyCodeOwnedFlowCompilation } from "../../../dsl/index.ts";
import {
  type AutomationStudioConfigArtifact,
  type AutomationStudioFlowArtifact,
  automationStudioFlowRepresentationKind,
  type AutomationStudioFlowRepresentationKind,
  type AutomationStudioFlowScope,
  type AutomationStudioProjectArtifactKind,
  isAutomationStudioSubflowGraphMetadata,
  validateAutomationStudioFlow,
  withAutomationStudioFlowRepresentation
} from "../../../model/index.ts";
import {
  AutomationStudioProjectAdministration,
  AutomationStudioProjectDatabasePool,
  type AutomationStudioSqlFlowRecord,
  type CanonicalAutomationStudioRepositories
} from "../../../storage/index.ts";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import type { AutomationStudioLegacyRetirementStore } from "../legacy/index.ts";
import type { AutomationStudioObjectDocuments } from "../object-documents.ts";
import type { AutomationStudioFlowStore } from "./store.ts";
import { isJsonRecord, jsonObjectFromUnknown, stringOrNull } from "../json-values.ts";
import { stableJson } from "../stable-json.ts";
import { projectArtifactDocumentFileName } from "../paths/index.ts";

// Writing a Flow document and everything derived from it: its representation
// checks, the generated source file and config artifact, the summary index
// entries, and the project change feed the write appends to. It reads Flows
// back through the flow store rather than reaching for the documents itself.
export class AutomationStudioFlowWriter {
  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly indexes: AutomationStudioServiceIndexes,
    private readonly flows: AutomationStudioFlowStore,
    private readonly legacy: AutomationStudioLegacyRetirementStore,
    private readonly objectDocuments: AutomationStudioObjectDocuments,
    private readonly repositories: CanonicalAutomationStudioRepositories,
    private readonly runtimeProjectDatabasePool?: AutomationStudioProjectDatabasePool
  ) {}

  async getProjectArtifact(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): Promise<unknown> {
    await this.projects.findProject(projectId);
    const artifact = await new ProgramJsonStore<JsonObject>(this.paths.projectArtifactFile(projectId, kind, artifactId), () => ({})).read();
    if (!Object.keys(artifact).length) throw new Error(`Unknown Automation Studio ${kind}: ${artifactId}`);
    return artifact;
  }

  async saveProjectArtifact(input: { projectId: string; kind: AutomationStudioProjectArtifactKind; artifact: unknown }): Promise<unknown> {
    await this.projects.findProject(input.projectId);
    if (input.kind !== "config") await this.legacy.assertLegacyWriteAllowed(input.projectId);
    if (!input.artifact || typeof input.artifact !== "object" || Array.isArray(input.artifact)) throw new Error("Artifact object is required.");
    const artifact = input.artifact as Record<string, unknown>;
    const id = this.projectArtifactId(input.kind, artifact);
    const now = Date.now();
    const withTimestamps = {
      ...artifact,
      schemaVersion: typeof artifact.schemaVersion === "string" ? artifact.schemaVersion : "0.1",
      createdAt: typeof artifact.createdAt === "number" ? artifact.createdAt : now,
      updatedAt: now
    } as unknown as JsonObject;
    await new ProgramJsonStore<JsonObject>(this.paths.projectArtifactFile(input.projectId, input.kind, id), () => ({})).write(withTimestamps);
    return withTimestamps;
  }

  async saveFlowInternal(
    input: { projectId: string; flow: AutomationStudioFlowArtifact; expectedUpdatedAt?: number },
    allowPublicationMutation: boolean,
    representationCreationKind?: AutomationStudioFlowRepresentationKind
  ): Promise<AutomationStudioFlowArtifact> {
    const project = await this.projects.findProject(input.projectId);
    if (input.flow.projectId !== project.id) throw new Error("Flow projectId must match the target project.");
    const expectedScope = flowScopeForProject(project);
    if (!sameFlowScope(input.flow.scope, expectedScope)) throw new Error("Flow scope must match the target project scope.");
    const existing = await this.repositories.flows.get(input.flow.flowId);
    if (existing && existing.projectId !== project.id) throw new Error(`Flow ID is already owned by project ${existing.projectId}.`);
    if (existing && input.expectedUpdatedAt !== undefined && existing.updatedAt !== input.expectedUpdatedAt) throw new Error(`FLOW_SAVE_CONFLICT: Flow changed after this draft began (expected ${input.expectedUpdatedAt}, current ${existing.updatedAt}).`);
    if (existing && existing.source.mode !== input.flow.source.mode) throw new Error("Flow source ownership changes require an explicit conversion endpoint.");
    if (existing) assertPublicationMutationAllowed(existing, input.flow, allowPublicationMutation);
    else if (!allowPublicationMutation && (input.flow.publication.status === "published" || input.flow.publication.status === "deprecated" || input.flow.publicationHistory?.length)) throw new Error("Published Flow state can only be created through publishFlow().");
    const now = Date.now();
    const createdAt = existing?.createdAt ?? input.flow.createdAt ?? now;
    const representationKind = this.resolveFlowRepresentationForSave(existing, input.flow, representationCreationKind);
    let flow: AutomationStudioFlowArtifact = {
      ...input.flow,
      createdAt,
      updatedAt: Math.max(now, createdAt),
      metadata: withAutomationStudioFlowRepresentation(input.flow.metadata, representationKind)
    };
    await this.assertFlowRepresentationSaveAllowed(project.id, existing, flow, representationKind, representationCreationKind);
    if (existing) flow = recordManualRecordingProposalChanges(existing, flow, now);
    const validation = validateAutomationStudioFlow(flow);
    if (!validation.ok) throw new Error(`Invalid Automation Studio Flow: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    if (!verifyCodeOwnedFlowCompilation(flow)) throw new Error("Code-owned Flow IR does not match its compiler digest.");
    flow = withFlowSourceFileMetadata(flow);
    const validationWithSourceMetadata = validateAutomationStudioFlow(flow);
    if (!validationWithSourceMetadata.ok) throw new Error(`Invalid Automation Studio Flow: ${validationWithSourceMetadata.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    const saved = await this.repositories.flows.put(flow);
    await this.flows.writeProjectFlow(project.id, saved);
    await this.writeFlowSourceFile(project.id, saved);
    await this.writeGeneratedFlowConfig(project.id, saved);
    const sqlFlow = await this.flows.writeSqlFlowMetadata(project.id, saved);
    await this.appendProjectMutationChangeFeed({
      projectId: project.id,
      entityKind: "flow",
      entityId: saved.flowId,
      parentId: stringOrNull(jsonObjectFromUnknown(saved.metadata)?.parentFlowId),
      operation: existing ? "update" : "create",
      revision: flowFeedRevision(sqlFlow),
      changedAt: saved.updatedAt,
      hierarchyScope: { kind: "project", id: project.id }
    });
    return saved;
  }

  async deleteFlowArtifact(
    input: { projectId: string; flowId: string },
    allowOwnedSubflowGraph: boolean
  ): Promise<{ deletedFlowId: string }> {
    const flow = await this.flows.getFlow(input.projectId, input.flowId);
    if (!allowOwnedSubflowGraph && this.persistedFlowRepresentation(flow) === "subflow_graph") {
      throw new Error("Owned Subflow graph Flows must be deleted through their owning Subflow.");
    }
    const deletedAt = Date.now();
    const sqlFlow = await this.flows.markSqlFlowDeleted(input.projectId, input.flowId, deletedAt);
    await this.repositories.flows.delete(input.flowId);
    await this.objectDocuments.deleteProjectArtifactFile(input.projectId, "config", flowConfigArtifactId(input.flowId));
    await this.deleteFlowSourceFile(input.projectId, flow);
    await this.indexes.writeFlowIndex(input.projectId, (index) => ({
      schemaVersion: "0.1",
      ...(index.ownershipMetadataVersion === 1 ? { ownershipMetadataVersion: 1 as const } : {}),
      ...(index.hierarchyMetadataVersion === 1 ? { hierarchyMetadataVersion: 1 as const } : {}),
      flows: (index.flows ?? []).filter((item) => item.flowId !== input.flowId)
    }));
    await ProgramJsonStore.deletePath(this.flowPaths.flowDirectory(input.projectId, input.flowId));
    await rm(this.flowPaths.flowDirectory(input.projectId, input.flowId), { recursive: true, force: true });
    await this.appendProjectMutationChangeFeed({
      projectId: input.projectId,
      entityKind: "flow",
      entityId: input.flowId,
      parentId: stringOrNull(jsonObjectFromUnknown(flow.metadata)?.parentFlowId),
      operation: "delete",
      revision: flowFeedRevision(sqlFlow),
      changedAt: deletedAt,
      hierarchyScope: { kind: "project", id: input.projectId }
    });
    return { deletedFlowId: input.flowId };
  }

  async appendProjectMutationChangeFeed(input: { projectId: string; entityKind: string; entityId: string; parentId?: string | null; operation: "create" | "update" | "delete" | "touch"; revision: number; changedAt: number; hierarchyScope?: { kind: string; id?: string } | null }): Promise<void> {
    if (!this.runtimeProjectDatabasePool) return;
    const admin = await AutomationStudioProjectAdministration.open({ pool: this.runtimeProjectDatabasePool, projectId: input.projectId });
    try {
      await admin.changeFeed.append({
        transactionId: projectChangeTransactionId(input),
        entityKind: input.entityKind,
        entityId: input.entityId,
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        operation: input.operation,
        revision: input.revision,
        changedAt: input.changedAt,
        ...(input.hierarchyScope !== undefined ? { hierarchyScope: input.hierarchyScope } : {})
      });
    } finally {
      await admin.close();
    }
  }

  async assertFlowRepresentationSaveAllowed(
    projectId: string,
    existing: AutomationStudioFlowArtifact | null | undefined,
    flow: AutomationStudioFlowArtifact,
    representationKind: AutomationStudioFlowRepresentationKind,
    representationCreationKind?: AutomationStudioFlowRepresentationKind
  ): Promise<void> {
    const hasOwnershipMetadata = flow.metadata?.subflowGraph === true
      || typeof flow.metadata?.parentFlowId === "string"
      || typeof flow.metadata?.parentSubflowId === "string";
    if (representationKind !== "subflow_graph" && hasOwnershipMetadata) {
      throw new Error("Top-level and legacy Flows cannot declare Subflow graph ownership metadata.");
    }
    if (representationKind === "orchestration") {
      if (flow.nodes.length || flow.edges.length) throw new Error("Top-level orchestration Flows cannot own Nodes or edges; create a Subflow and edit its graph Flow instead.");
      return;
    }
    if (representationKind === "legacy_single_graph") {
      if (!existing && representationCreationKind !== "legacy_single_graph") throw new Error("Legacy single-graph compatibility cannot be selected for a newly created Flow.");
      return;
    }
    if (!existing && representationCreationKind === "subflow_graph") return;
    await this.assertOwnedSubflowGraph(projectId, flow);
  }

  resolveFlowRepresentationForSave(
    existing: AutomationStudioFlowArtifact | null | undefined,
    next: AutomationStudioFlowArtifact,
    representationCreationKind?: AutomationStudioFlowRepresentationKind
  ): AutomationStudioFlowRepresentationKind {
    if (!existing) {
      if (representationCreationKind === "subflow_graph") return "subflow_graph";
      if (representationCreationKind === "legacy_single_graph") return "legacy_single_graph";
      return "orchestration";
    }
    const existingKind = this.persistedFlowRepresentation(existing);
    const requestedKind = automationStudioFlowRepresentationKind(next);
    if (existingKind === "legacy_single_graph" && requestedKind === "orchestration"
      && representationCreationKind === "orchestration" && next.nodes.length === 0 && next.edges.length === 0) return "orchestration";
    return existingKind;
  }

  persistedFlowRepresentation(flow: AutomationStudioFlowArtifact): AutomationStudioFlowRepresentationKind {
    const explicit = automationStudioFlowRepresentationKind(flow);
    if (explicit) return explicit;
    if (isAutomationStudioSubflowGraphMetadata(flow.metadata)) return "subflow_graph";
    if (flow.legacyProvenance || flow.nodes.length > 0 || flow.edges.length > 0) return "legacy_single_graph";
    return "orchestration";
  }

  async assertOwnedSubflowGraph(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void> {
    const parentFlowId = typeof flow.metadata?.parentFlowId === "string" ? flow.metadata.parentFlowId.trim() : "";
    const parentSubflowId = typeof flow.metadata?.parentSubflowId === "string" ? flow.metadata.parentSubflowId.trim() : "";
    if (!parentFlowId || !parentSubflowId || flow.metadata?.subflowGraph !== true) throw new Error("Subflow graph metadata is incomplete; graph mutation refused.");
    const subflow = await this.flows.getFlowSubflow(projectId, parentFlowId, parentSubflowId);
    if (!subflow || subflow.graphFlowId !== flow.flowId) throw new Error("Flow is not the graph owned by its declared Subflow; graph mutation refused.");
  }

  async writeFlowSourceFile(projectId: string, flow: AutomationStudioFlowArtifact, sourceText?: string): Promise<void> {
    if (!this.paths.root) return;
    const moduleId = flowSourceModuleId(flow);
    const filePath = this.paths.projectFile(projectId, "flows", safeSegment(flow.flowId), "source", ...safeRelativePathParts(moduleId));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, sourceText ?? generateFlowTypeScript(flow), "utf8");
  }

  async deleteFlowSourceFile(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void> {
    if (!this.paths.root) return;
    await rm(this.paths.projectFile(projectId, "flows", safeSegment(flow.flowId), "source"), { recursive: true, force: true });
  }

  async writeGeneratedFlowConfig(projectId: string, flow: AutomationStudioFlowArtifact): Promise<AutomationStudioConfigArtifact> {
    const configId = flowConfigArtifactId(flow.flowId);
    const existing = await this.getProjectArtifact(projectId, "config", configId).then((artifact) => artifact as AutomationStudioConfigArtifact).catch(() => null);
    const values: JsonObject = {
      flowId: flow.flowId,
      name: flow.name,
      scope: flow.scope as unknown as JsonObject,
      source: flow.source as unknown as JsonObject,
      interface: flow.interface as unknown as JsonObject,
      errors: flow.errors as unknown as JsonObject,
      variables: flow.variables as unknown as JsonObject,
      executionDefaults: flow.executionDefaults as unknown as JsonObject,
      publication: flow.publication as unknown as JsonObject,
      declaredDependencies: (flow.source.mode === "code" ? flow.source.declaredDependencies ?? [] : []) as unknown as JsonObject
    };
    if (flow.description !== undefined) values.description = flow.description;
    const relativePath = `configs/${safeSegment(configId)}/${projectArtifactDocumentFileName("configs")}`;
    const config: AutomationStudioConfigArtifact = {
      schemaVersion: "0.1",
      configId,
      name: `${flow.name} config`,
      description: `Generated configuration for Flow ${flow.flowId}.`,
      values,
      createdAt: existing?.createdAt ?? flow.createdAt,
      updatedAt: flow.updatedAt,
      metadata: {
        ...(existing?.metadata ?? {}),
        generated: true,
        generatedKind: "flow.config",
        ownerKind: "flow",
        flowId: flow.flowId,
        projectId,
        relativePath
      }
    };
    return await this.saveProjectArtifact({ projectId, kind: "config", artifact: config }) as AutomationStudioConfigArtifact;
  }

  projectArtifactId(kind: AutomationStudioProjectArtifactKind, artifact: Record<string, unknown>): string {
    const id = kind === "task" ? artifact.taskId : kind === "routine" ? artifact.routineId : kind === "config" ? artifact.configId : artifact.flowId;
    if (typeof id !== "string" || !id.trim()) throw new Error(`${kind} ID is required.`);
    return id;
  }
}

export function flowScopeForProject(project: AutomationStudioProject): AutomationStudioFlowScope {
  return typeof project.domainId === "string" && project.domainId.trim()
    ? { kind: "domain", domainId: project.domainId }
    : { kind: "global" };
}

export function sameFlowScope(left: AutomationStudioFlowScope, right: AutomationStudioFlowScope): boolean {
  return left.kind === right.kind && (left.kind !== "domain" || left.domainId === (right as Extract<AutomationStudioFlowScope, { kind: "domain" }>).domainId);
}

export function withFlowSourceFileMetadata(flow: AutomationStudioFlowArtifact): AutomationStudioFlowArtifact {
  if (flow.source.mode === "code") return flow;
  const moduleId = flowSourceModuleId(flow);
  return {
    ...flow,
    metadata: {
      ...(flow.metadata ?? {}),
      generatedSource: {
        moduleId,
        relativePath: `flows/${safeSegment(flow.flowId)}/source/${safeRelativePathParts(moduleId).join("/")}`,
        authoritative: false
      }
    }
  };
}

function assertPublicationMutationAllowed(existing: AutomationStudioFlowArtifact, incoming: AutomationStudioFlowArtifact, allowPublicationMutation: boolean): void {
  if (allowPublicationMutation) return;
  if ((incoming.publication.status === "published" || incoming.publication.status === "deprecated") && existing.publication.status !== incoming.publication.status) {
    throw new Error("Published Flow lifecycle can only be changed through publication endpoints.");
  }
  if ((existing.publication.status === "published" || existing.publication.status === "deprecated") && stableJson(existing.publication) !== stableJson(incoming.publication)) {
    throw new Error("Published Flow snapshot metadata is immutable; use publication lifecycle endpoints.");
  }
  if (stableJson(existing.publicationHistory ?? []) !== stableJson(incoming.publicationHistory ?? [])) {
    throw new Error("Flow publication history is immutable; use publishFlow() to append a version.");
  }
}

function flowConfigArtifactId(flowId: string): string {
  return `flow.${flowId}.config`;
}

function flowFeedRevision(flow: Pick<AutomationStudioSqlFlowRecord, "graphRevision" | "settingsRevision"> | null): number {
  if (!flow) return 1;
  return Math.max(1, Math.trunc(Math.max(flow.graphRevision, flow.settingsRevision)));
}

function flowSourceModuleId(flow: AutomationStudioFlowArtifact): string {
  return flow.source.mode === "code" && flow.source.moduleId.trim()
    ? flow.source.moduleId
    : `flows/${safeSegment(flow.flowId)}.flow.ts`;
}

function projectChangeTransactionId(input: { projectId: string; entityKind: string; entityId: string; operation: string; changedAt: number }): string {
  const digest = createHash("sha256").update(JSON.stringify([input.projectId, input.entityKind, input.entityId, input.operation, input.changedAt])).digest("hex").slice(0, 24);
  return `project-change.${input.operation}.${digest}`;
}

function recordManualRecordingProposalChanges(existing: AutomationStudioFlowArtifact, next: AutomationStudioFlowArtifact, editedAt: number): AutomationStudioFlowArtifact {
  const existingById = new Map(existing.nodes.map((node) => [node.id, node]));
  const immutableKeys = ["recordingProposalId", "recordingCandidateId", "mapperId", "mapperVersion", "sourceObservationIds", "evidence", "rawEvidenceImmutable"] as const;
  const nodes = next.nodes.map((node) => {
    const previous = existingById.get(node.id);
    if (!previous?.metadata?.recordingProposalId) return node;
    const changedFields = (["definitionId", "label", "description", "parameterValues", "position"] as const).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(node[key]));
    const immutableMetadata = Object.fromEntries(immutableKeys.flatMap((key) => previous.metadata?.[key] === undefined ? [] : [[key, structuredClone(previous.metadata[key])]])) as JsonObject;
    if (!changedFields.length) return { ...node, metadata: { ...(node.metadata ?? {}), ...immutableMetadata } };
    const priorEvents = Array.isArray(previous.metadata.manualProvenance) ? previous.metadata.manualProvenance : [];
    return { ...node, metadata: { ...(node.metadata ?? {}), ...immutableMetadata, manualProvenance: [...priorEvents, { editedAt, changedFields }] } };
  });
  const retainedIds = new Set(next.nodes.map((node) => node.id));
  const deleted = existing.nodes.filter((node) => node.metadata?.recordingProposalId && !retainedIds.has(node.id)).map((node) => ({ editedAt, change: "node_deleted", nodeId: node.id, recordingProposalId: String(node.metadata!.recordingProposalId) }));
  if (!deleted.length) return { ...next, nodes };
  const prior = Array.isArray(existing.metadata?.manualRecordingProposalChanges) ? existing.metadata.manualRecordingProposalChanges : [];
  return { ...next, nodes, metadata: { ...(next.metadata ?? {}), manualRecordingProposalChanges: [...prior, ...deleted] } };
}

function safeRelativePathParts(moduleId: string): string[] {
  const parts = moduleId
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => safeSegment(part))
    .filter((part) => part && part !== "." && part !== "..");
  return parts.length ? parts : ["flows", "flow.flow.ts"];
}
