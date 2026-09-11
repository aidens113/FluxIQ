import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioHierarchyChildrenPage, AutomationStudioProjectChangeFeedPage } from "../../../api/contracts.ts";
import {
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowInstruction,
  type AutomationStudioFlowOrigin,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowSubflow,
  createBlankAutomationStudioFlowArtifact
} from "../../../model/index.ts";
import {
  type AutomationStudioFlowResourcePage,
  type AutomationStudioGraphPatchOperation,
  AutomationStudioProjectAdministration,
  AutomationStudioProjectDatabasePool,
  AutomationStudioProjectFlowResourceRepository,
  AutomationStudioProjectGraphRepository,
  AutomationStudioProjectHierarchyRepository,
  type AutomationStudioSqlFlowDetail,
  type AutomationStudioSqlFlowRecord,
  type AutomationStudioSqlInstructionScope,
  type AutomationStudioSqlRouter,
  type AutomationStudioSqlSubflow,
  type CanonicalAutomationStudioRepositories
} from "../../../storage/index.ts";
import { createHash, randomUUID } from "node:crypto";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import { isJsonRecord, jsonObjectFromUnknown, stringOrNull } from "../json-values.ts";
import { uniqueStrings, upsertBy } from "../collections.ts";
import { stableJson } from "../stable-json.ts";
import { flowMapRouteGroups, flowMapSortedRules, flowSubflowCategoriesFromFlow, flowSummaryFromFlow, removeUndefinedSubflowFields, sqlInstructionRequirement, sqlInstructionStatus, subflowParentCategoryId } from "./mapping.ts";

// The Flow documents and the per-project SQL projection of them, in one place
// because they are mutually dependent: saving a Flow writes its projection and
// reading a Subflow reads one back. Splitting them would need a callback in
// whichever direction was extracted second.
export class AutomationStudioFlowStore {
  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly indexes: AutomationStudioServiceIndexes,
    private readonly repositories: CanonicalAutomationStudioRepositories,
    private readonly projectDatabasePool?: AutomationStudioProjectDatabasePool
  ) {}

  async listFlowMetadataPage(input: { projectId: string; limit?: number; cursor?: string | null; status?: string }): Promise<AutomationStudioFlowResourcePage<AutomationStudioSqlFlowRecord>> {
    await this.projects.findProject(input.projectId);
    if (!this.projectDatabasePool) return { items: [], nextCursor: null, hasMore: false, limit: Math.max(1, Math.min(500, Math.trunc(input.limit ?? 50))) };
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId: input.projectId });
    try {
      return await repository.listFlowsPage({ ...(input.limit !== undefined ? { limit: input.limit } : {}), ...(input.cursor !== undefined ? { cursor: input.cursor } : {}), ...(input.status ? { status: input.status } : {}) });
    } finally {
      await repository.close();
    }
  }

  async getFlowMetadataDetail(projectId: string, flowId: string): Promise<AutomationStudioSqlFlowDetail | null> {
    await this.projects.findProject(projectId);
    if (!this.projectDatabasePool) return null;
    const canonical = await this.getFlow(projectId, flowId).catch(() => null);
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      const detail = await repository.getFlow(flowId);
      if (!detail || !canonical || detail.updatedAt === canonical.updatedAt) return detail;
      return { ...detail, updatedAt: canonical.updatedAt };
    } finally {
      await repository.close();
    }
  }

  async getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact> {
    await this.projects.findProject(projectId);
    await this.loadProjectFlow(projectId, flowId);
    const flow = await this.repositories.flows.get(flowId);
    if (!flow || flow.projectId !== projectId) throw new Error(`Unknown Automation Studio Flow: ${flowId}`);
    return await this.materializeCanonicalGraphFlow(projectId, flow);
  }

  async getFlowRouter(projectId: string, flowId: string): Promise<AutomationStudioFlowRouter | null> {
    await this.projects.findProject(projectId);
    const stored = await new ProgramJsonStore<JsonObject>(this.flowPaths.flowRouterFile(projectId, flowId), () => ({})).read();
    return typeof stored.routerId === "string" ? stored as unknown as AutomationStudioFlowRouter : null;
  }

  async getFlowSubflow(projectId: string, flowId: string, subflowId: string): Promise<AutomationStudioFlowSubflow | null> {
    await this.projects.findProject(projectId);
    const stored = await new ProgramJsonStore<JsonObject>(this.flowPaths.flowSubflowFile(projectId, flowId, subflowId), () => ({})).read();
    if (typeof stored.subflowId === "string") return stored as unknown as AutomationStudioFlowSubflow;
    return await this.readSqlFlowSubflow(projectId, flowId, subflowId);
  }

  async listProjectHierarchyChildren(input: { projectId: string; parentId?: unknown; cursor?: unknown; limit?: unknown }): Promise<AutomationStudioHierarchyChildrenPage> {
    const project = await this.projects.findProjectSummary(input.projectId);
    if (!this.projectDatabasePool) return { items: [], nextCursor: null, hasMore: false };

    const repository = await AutomationStudioProjectHierarchyRepository.open({
      pool: this.projectDatabasePool,
      projectId: input.projectId
    });
    try {
      const parentEntryId = typeof input.parentId === "string" && input.parentId.trim()
        ? input.parentId.trim()
        : null;
      const cursor = typeof input.cursor === "string" && input.cursor ? input.cursor : null;
      const limit = Math.max(1, Math.min(500, Math.trunc(Number(input.limit ?? 100)) || 100));
      let page = await repository.listChildrenPage({ parentEntryId, cursor, limit });

      if (!cursor && page.items.length === 0 && !(await repository.hasEntries())) {
        const legacyProject = await this.projects.readProjectRecord(project);
        if (legacyProject.customHierarchyNodes.length > 0) {
          await repository.importLegacyHierarchy({
            customHierarchyNodes: legacyProject.customHierarchyNodes,
            deletedHierarchyIds: legacyProject.deletedHierarchyIds,
            workspacePrefs: legacyProject.workspacePrefs ?? {}
          });
          page = await repository.listChildrenPage({ parentEntryId, limit });
        }
      }
      return page;
    } finally {
      await repository.close();
    }
  }

  async listProjectChangeFeed(input: { projectId: string; afterSequence?: unknown; limit?: unknown }): Promise<AutomationStudioProjectChangeFeedPage> {
    await this.projects.findProject(input.projectId);
    const afterSequence = Math.max(0, Math.trunc(Number(input.afterSequence ?? 0)) || 0);
    const limit = Math.max(1, Math.min(500, Math.trunc(Number(input.limit ?? 100)) || 100));
    if (!this.paths.root || !this.projectDatabasePool) return { events: [], cursor: afterSequence, hasMore: false, fallback: true };
    const admin = await AutomationStudioProjectAdministration.open({ pool: this.projectDatabasePool, projectId: input.projectId });
    try {
      const events = await admin.changeFeed.listAfter(afterSequence, limit + 1);
      const page = events.slice(0, limit).map((event) => ({
        projectId: input.projectId,
        sequence: event.sequence,
        transactionId: event.transactionId,
        entityKind: event.entityKind,
        entityId: event.entityId,
        operation: event.operation,
        revision: event.revision,
        changedAt: event.changedAt,
        ...(event.parentId !== undefined ? { parentId: event.parentId } : {}),
        ...(event.hierarchyScope !== undefined ? { hierarchyScope: event.hierarchyScope } : {})
      }));
      return {
        events: page,
        cursor: page.at(-1)?.sequence ?? afterSequence,
        hasMore: events.length > limit,
        fallback: false
      };
    } finally {
      await admin.close();
    }
  }

  async getLlmExecutionGraphRevisionBindings(projectId: string, flowIds: string[]): Promise<Array<{ flowId: string; graphRevision: number }>> {
    if (!this.projectDatabasePool) return [];
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      const bindings = await Promise.all([...new Set(flowIds)].sort().map(async (dependencyFlowId) => ({
        flowId: dependencyFlowId,
        graphRevision: await graph.getFlowRevision(dependencyFlowId)
      })));
      return bindings;
    } finally {
      await graph.close();
    }
  }

  async replaceFlowGraphIndex(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void> {
    if (!this.projectDatabasePool) return;
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      const revisions = await graph.revisions({ flowId: flow.flowId, limit: 1 });
      if (!revisions.items.length) {
        await graph.importMonolithicFlowGraph(flow, { changedAt: flow.updatedAt });
        return;
      }
      const current = await graph.exportSnapshotData(flow.flowId);
      const operations: AutomationStudioGraphPatchOperation[] = [
        ...current.edges.map((edge) => ({ op: "delete_edge" as const, edgeId: edge.edgeId })),
        ...current.nodes.map((node) => ({ op: "delete_node" as const, nodeId: node.nodeId })),
        ...flow.nodes.map((node) => ({
          op: "add_node" as const,
          node: {
            nodeId: node.id, flowId: flow.flowId, definitionId: node.definitionId, definitionVersion: node.definitionVersion ?? "legacy",
            label: node.label ?? node.id, description: node.description ?? "", x: node.position?.x ?? 0, y: node.position?.y ?? 0,
            width: typeof node.metadata?.width === "number" ? node.metadata.width : 240, height: typeof node.metadata?.height === "number" ? node.metadata.height : 96,
            zIndex: typeof node.metadata?.zIndex === "number" ? Math.trunc(node.metadata.zIndex) : 0, disabled: node.metadata?.disabled === true,
            parameterValues: node.parameterValues ?? {}, metadata: node.metadata ?? {}
          }
        })),
        ...flow.edges.map((edge) => ({
          op: "add_edge" as const,
          edge: {
            edgeId: edge.id, flowId: flow.flowId, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId,
            sourcePortId: edge.sourcePortId ?? null, targetPortId: edge.targetPortId ?? null, label: edge.label ?? "", metadata: edge.metadata ?? {}
          }
        }))
      ];
      await graph.applyPatch({
        pool: this.projectDatabasePool, projectId, flowId: flow.flowId, baseRevision: current.flow.graphRevision,
        mutationId: `flow-document-replace.${safeSegment(flow.flowId)}.${randomUUID()}`, operations,
        authorId: "automation-studio", message: "Reconcile recording-generated Flow graph", changedAt: flow.updatedAt
      });
    } finally {
      await graph.close();
    }
  }

  async tryWithFlowResourceRepository<T>(projectId: string, operation: (repository: AutomationStudioProjectFlowResourceRepository) => Promise<T>): Promise<T | null> {
    if (!this.projectDatabasePool || !this.paths.root) return null;
    try {
      await this.projects.findProject(projectId);
      const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId });
      try {
        return await operation(repository);
      } finally {
        await repository.close();
      }
    } catch {
      return null;
    }
  }

  async materializeCanonicalGraphFlow(projectId: string, flow: AutomationStudioFlowArtifact): Promise<AutomationStudioFlowArtifact> {
    if (!this.projectDatabasePool) return flow;
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      const revisions = await graph.revisions({ flowId: flow.flowId, limit: 1 });
      if (!revisions.items.length) return flow;
      const snapshot = await graph.exportSnapshotData(flow.flowId);
      return {
        ...flow,
        nodes: snapshot.nodes.map((node) => ({
          id: node.nodeId,
          definitionId: node.definitionId,
          definitionVersion: node.definitionVersion,
          label: node.label,
          ...(node.description ? { description: node.description } : {}),
          parameterValues: node.parameterValues,
          position: { x: node.x, y: node.y },
          metadata: node.metadata
        })),
        edges: snapshot.edges.map((edge) => ({
          id: edge.edgeId,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          ...(edge.sourcePortId ? { sourcePortId: edge.sourcePortId } : {}),
          ...(edge.targetPortId ? { targetPortId: edge.targetPortId } : {}),
          ...(edge.label ? { label: edge.label } : {}),
          metadata: edge.metadata
        })),
        metadata: { ...(flow.metadata ?? {}), graphRevision: snapshot.flow.graphRevision }
      };
    } finally {
      await graph.close();
    }
  }

  async writeProjectFlow(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void> {
    await this.projects.ensureProjectStructure(projectId);
    await new ProgramJsonStore<JsonObject>(this.flowPaths.flowFile(projectId, flow.flowId), () => ({})).write(flow as unknown as JsonObject);
    await this.indexes.writeFlowIndex(projectId, (index) => ({
      schemaVersion: "0.1",
      ...(index.ownershipMetadataVersion === 1 ? { ownershipMetadataVersion: 1 as const } : {}),
      ...(index.hierarchyMetadataVersion === 1 ? { hierarchyMetadataVersion: 1 as const } : {}),
      flows: upsertBy(index.flows ?? [], "flowId", flowSummaryFromFlow(flow))
    }));
  }

  async writeSqlFlowMetadata(projectId: string, flow: AutomationStudioFlowArtifact): Promise<AutomationStudioSqlFlowDetail | null> {
    if (!this.projectDatabasePool) return null;
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      const metadata = jsonObjectFromUnknown(flow.metadata) ?? {};
      const parentSubflowId = stringOrNull(metadata.parentSubflowId);
      const scope = flow.scope.kind === "domain" ? { scopeKind: "domain" as const, scopeId: flow.scope.domainId } : { scopeKind: "global" as const, scopeId: null };
      const detail = await repository.upsertFlow({
        flowId: flow.flowId,
        parentFlowId: stringOrNull(metadata.parentFlowId),
        owningSubflowId: parentSubflowId && await repository.getSubflow(parentSubflowId) ? parentSubflowId : null,
        name: flow.name,
        description: flow.description ?? "",
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        visibility: flow.visibility === "public" ? scope.scopeKind : "private",
        origin: flowOriginForSql(flow.origin),
        sourceMode: flow.source.mode === "code" ? "code" : "visual",
        status: flow.publication.status === "deprecated" ? "archived" : "draft",
        compiledRevision: null,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
        settings: {
          executionDefaults: (flow.executionDefaults ?? {}) as JsonObject,
          training: jsonObjectFromUnknown(metadata.trainingModeSettings) ?? {},
          adaptation: {
            ...(jsonObjectFromUnknown(metadata.adaptationPolicySettings) ?? {}),
            ...(typeof metadata.adaptationPolicyId === "string" ? { policyId: metadata.adaptationPolicyId } : {})
          },
          llm: {
            provider: typeof metadata.llmProvider === "string" ? metadata.llmProvider : "host",
            ...(typeof metadata.llmModel === "string" ? { model: metadata.llmModel } : {}),
            ...(typeof metadata.llmSecretKeyId === "string" ? { secretKeyId: metadata.llmSecretKeyId } : {}),
            execution: jsonObjectFromUnknown(metadata.llmExecutionSettings) ?? {}
          },
          safety: {}
        },
        inputs: flow.interface.inputs.map((port, index) => ({ portId: port.id, name: port.name, valueType: port.valueType as JsonValue, required: port.required === true, defaultValue: port.defaultValue ?? null, description: port.description ?? "", sortKey: String(index).padStart(8, "0") })),
        outputs: flow.interface.outputs.map((port, index) => ({ portId: port.id, name: port.name, valueType: port.valueType as JsonValue, required: port.required === true, defaultValue: port.defaultValue ?? null, description: port.description ?? "", sortKey: String(index).padStart(8, "0") })),
        variables: flow.variables.map((variable, index) => ({ variableId: variable.id, name: variable.name, valueType: variable.valueType as JsonValue, initialValue: variable.initialValue ?? null, description: variable.description ?? "", sortKey: String(index).padStart(8, "0") })),
        errors: flow.errors.map((error) => ({ errorId: error.id, code: error.id, description: error.description ?? "", metadata: error.metadata ?? {} }))
      });
      for (const [index, category] of orderSubflowCategoriesParentFirst(flowSubflowCategoriesFromFlow(flow)).entries()) {
        await repository.upsertSubflowCategory({
          categoryId: category.id,
          flowId: flow.flowId,
          parentCategoryId: category.parentId ?? null,
          name: category.name,
          sortKey: String(index).padStart(8, "0") + "." + category.name.toLowerCase()
        });
      }
      return detail;
    } finally {
      await repository.close();
    }
  }

  async readSqlFlowSubflow(projectId: string, flowId: string, subflowId: string): Promise<AutomationStudioFlowSubflow | null> {
    if (!this.projectDatabasePool) return null;
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      const row = await repository.getSubflow(subflowId);
      if (!row || row.parentFlowId !== flowId || row.deletedAt !== null) return null;
      return sqlSubflowToFlowSubflow(projectId, row);
    } finally {
      await repository.close();
    }
  }

  async writeSqlFlowSubflow(projectId: string, subflow: AutomationStudioFlowSubflow): Promise<void> {
    if (!this.projectDatabasePool) return;
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      await this.loadProjectFlow(projectId, subflow.flowId);
      const parentFlow = await this.repositories.flows.get(subflow.flowId);
      if (parentFlow?.projectId === projectId) {
        for (const [index, category] of orderSubflowCategoriesParentFirst(flowSubflowCategoriesFromFlow(parentFlow)).entries()) {
          await repository.upsertSubflowCategory({
            categoryId: category.id,
            flowId: subflow.flowId,
            parentCategoryId: category.parentId ?? null,
            name: category.name,
            sortKey: String(index).padStart(8, "0") + "." + category.name.toLowerCase()
          });
        }
      }
      const graphFlowId = subflow.graphFlowId ?? `${subflow.flowId}.${subflow.subflowId}.graph`;
      if (!await repository.getFlow(graphFlowId)) {
        await this.loadProjectFlow(projectId, graphFlowId);
        let graphFlow = await this.repositories.flows.get(graphFlowId);
        if (!graphFlow || graphFlow.projectId !== projectId) {
          if (!parentFlow || parentFlow.projectId !== projectId) return;
          graphFlow = createBlankAutomationStudioFlowArtifact({
            flowId: graphFlowId,
            projectId,
            name: `${subflow.name} Graph`,
            scope: parentFlow.scope,
            description: `Isolated graph for subflow ${subflow.name}.`,
            origin: "manual",
            now: subflow.createdAt,
            metadata: { parentFlowId: subflow.flowId, parentSubflowId: subflow.subflowId, subflowGraph: true }
          });
          await this.writeProjectFlow(projectId, graphFlow);
          await this.repositories.flows.put(graphFlow);
        }
        await this.writeSqlFlowMetadata(projectId, graphFlow);
      }
      await repository.upsertSubflow(sqlSubflowFromFlowSubflow(subflow));
    } finally {
      await repository.close();
    }
  }

  async ensureSqlFlowRouterProjection(projectId: string, flowId: string): Promise<void> {
    if (!this.projectDatabasePool) return;
    const exists = await this.tryWithFlowResourceRepository(projectId, (repository) => repository.getRouterSummaryForFlow(flowId));
    if (exists) return;
    const router = await this.getFlowRouter(projectId, flowId);
    if (!router) return;
    const fallbackSubflowId = router.fallback?.kind === "subflow" && "subflowId" in router.fallback
      ? router.fallback.subflowId
      : null;
    const referencedSubflowIds = uniqueStrings([
      ...(fallbackSubflowId ? [fallbackSubflowId] : []),
      ...router.rules.flatMap((rule) => rule.target.kind === "subflow" && "subflowId" in rule.target ? [rule.target.subflowId] : [])
    ]);
    for (const subflowId of referencedSubflowIds) {
      const subflow = await this.getFlowSubflow(projectId, flowId, subflowId);
      if (subflow) await this.writeSqlFlowSubflow(projectId, subflow);
    }
    await this.writeSqlFlowRouterProjection(router);
  }

  async writeSqlFlowRouterProjection(router: AutomationStudioFlowRouter): Promise<void> {
    if (!this.projectDatabasePool) return;
    const ownerFlow = await this.getFlow(router.projectId, router.flowId).catch(() => null);
    if (ownerFlow) await this.writeSqlFlowMetadata(router.projectId, ownerFlow);
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId: router.projectId });
    try {
      await repository.replaceRouterProjection(sqlRouterFromFlowRouter(router));
    } finally {
      await repository.close();
    }
  }

  async writeSqlFlowInstruction(projectId: string, instruction: AutomationStudioFlowInstruction): Promise<void> {
    if (!this.projectDatabasePool) return;
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      await repository.upsertInstruction({
        instructionId: instruction.instructionId,
        title: instruction.title,
        bodyObjectId: null,
        inlineBody: null,
        requirement: sqlInstructionRequirement(instruction.requirement),
        status: sqlInstructionStatus(instruction.status),
        priority: instruction.priority,
        contentDigest: `sha256:${createHash("sha256").update(stableJson([instruction.title, instruction.body])).digest("hex")}`,
        scopes: [sqlInstructionScopeFromInstruction(projectId, instruction.scope)],
        tags: instruction.tags ?? [],
        createdAt: instruction.createdAt,
        updatedAt: instruction.updatedAt
      });
    } finally {
      await repository.close();
    }
  }

  async markSqlFlowSubflowDeleted(projectId: string, subflow: AutomationStudioFlowSubflow, deletedAt: number): Promise<void> {
    if (!this.projectDatabasePool) return;
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      await repository.upsertSubflow({ ...sqlSubflowFromFlowSubflow(subflow), status: "deleted", updatedAt: deletedAt, deletedAt });
    } finally {
      await repository.close();
    }
  }

  async markSqlFlowDeleted(projectId: string, flowId: string, deletedAt: number): Promise<AutomationStudioSqlFlowRecord | null> {
    if (!this.projectDatabasePool) return null;
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool: this.projectDatabasePool, projectId });
    try {
      return await repository.markFlowDeleted(flowId, deletedAt);
    } finally {
      await repository.close();
    }
  }

  async loadProjectFlow(projectId: string, flowId: string): Promise<void> {
    if (!this.paths.root) return;
    const existing = await this.repositories.flows.get(flowId);
    if (existing?.projectId === projectId) return;
    const stored = await new ProgramJsonStore<JsonObject>(this.flowPaths.flowFile(projectId, flowId), () => ({})).read();
    if (typeof stored.flowId === "string") await this.repositories.flows.put(stored as unknown as AutomationStudioFlowArtifact);
  }
}

function flowOriginForSql(origin: AutomationStudioFlowOrigin): AutomationStudioSqlFlowRecord["origin"] {
  if (origin === "recorded") return "recording";
  if (origin === "imported" || origin === "migrated") return "import";
  return "user";
}

function orderSubflowCategoriesParentFirst(categories: Array<{ id: string; name: string; parentId?: string }>): Array<{ id: string; name: string; parentId?: string }> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const ordered: Array<{ id: string; name: string; parentId?: string }> = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(category: { id: string; name: string; parentId?: string }) {
    if (visited.has(category.id) || visiting.has(category.id)) return;
    visiting.add(category.id);
    const parent = category.parentId ? byId.get(category.parentId) : null;
    if (parent) visit(parent);
    visiting.delete(category.id);
    visited.add(category.id);
    ordered.push(category);
  }
  for (const category of categories) visit(category);
  return ordered;
}

function sqlInstructionScopeFromInstruction(projectId: string, scope: AutomationStudioFlowInstruction["scope"]): AutomationStudioSqlInstructionScope {
  if (scope.kind === "global") return { scopeKind: "global", projectId: null, flowId: null, routerId: null, subflowId: null, nodeId: null, errorCode: null };
  if (scope.kind === "project") return { scopeKind: "project", projectId: scope.projectId, flowId: null, routerId: null, subflowId: null, nodeId: null, errorCode: null };
  if (scope.kind === "flow") return { scopeKind: "flow", projectId: scope.projectId, flowId: scope.flowId, routerId: null, subflowId: null, nodeId: null, errorCode: null };
  if (scope.kind === "router") return { scopeKind: "router", projectId: scope.projectId, flowId: scope.flowId, routerId: scope.routerId, subflowId: null, nodeId: null, errorCode: null };
  if (scope.kind === "subflow") return { scopeKind: "subflow", projectId: scope.projectId, flowId: scope.flowId, routerId: null, subflowId: scope.subflowId, nodeId: null, errorCode: null };
  if (scope.kind === "node") return { scopeKind: "node", projectId: scope.projectId, flowId: scope.flowId, routerId: null, subflowId: scope.subflowId ?? null, nodeId: scope.nodeId, errorCode: null };
  if (scope.kind === "on_error") return { scopeKind: "error", projectId: scope.projectId, flowId: scope.flowId, routerId: null, subflowId: scope.subflowId ?? null, nodeId: scope.nodeId ?? null, errorCode: stringOrNull(scope.nodeId) ?? "flow_error" };
  if (scope.kind === "adaptation_review") return { scopeKind: "flow", projectId: scope.projectId, flowId: scope.flowId, routerId: null, subflowId: scope.subflowId ?? null, nodeId: null, errorCode: null };
  return { scopeKind: "flow", projectId, flowId: "flow.unknown", routerId: null, subflowId: null, nodeId: null, errorCode: null };
}

function sqlRouterFromFlowRouter(router: AutomationStudioFlowRouter): AutomationStudioSqlRouter {
  const fallback = router.fallback;
  const fallbackSubflowId = fallback?.kind === "subflow" && "subflowId" in fallback ? fallback.subflowId : null;
  return {
    routerId: router.routerId,
    flowId: router.flowId,
    fallbackKind: fallbackSubflowId ? "subflow" : "error",
    fallbackSubflowId,
    revision: Math.max(1, Math.trunc(Number(router.metadata?.revision ?? 1))),
    createdAt: router.createdAt,
    updatedAt: router.updatedAt,
    groups: flowMapRouteGroups(router).map((group) => ({
      groupId: group.groupId,
      routerId: router.routerId,
      name: group.name,
      description: group.description ?? "",
      order: group.order,
      status: group.status,
      collapsed: group.collapsed === true,
      sortKey: String(group.order).padStart(12, "0") + "." + group.groupId,
      revision: Math.max(1, Math.trunc(Number(group.metadata?.revision ?? 1))),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      metadata: group.metadata ?? {}
    })),
    routes: flowMapSortedRules(router.rules).map((rule) => ({
      routeId: rule.ruleId,
      routerId: router.routerId,
      groupId: typeof rule.metadata?.groupId === "string" ? rule.metadata.groupId : null,
      name: rule.name,
      priority: rule.order,
      enabled: rule.status === "active",
      conditionKind: typeof (rule.condition as any)?.kind === "string" ? String((rule.condition as any).kind) : rule.condition ? "condition" : "always",
      condition: (rule.condition ?? null) as JsonValue,
      targetKind: "subflow",
      targetSubflowId: rule.target.subflowId,
      revision: Math.max(1, Math.trunc(Number(rule.metadata?.revision ?? 1))),
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    }))
  };
}

function sqlSubflowFromFlowSubflow(subflow: AutomationStudioFlowSubflow): Omit<AutomationStudioSqlSubflow, "revision" | "createdAt" | "updatedAt" | "deletedAt"> & { revision?: number; createdAt?: number; updatedAt?: number; deletedAt?: number | null } {
  return {
    subflowId: subflow.subflowId,
    parentFlowId: subflow.flowId,
    graphFlowId: subflow.graphFlowId ?? `${subflow.flowId}.${subflow.subflowId}.graph`,
    parentCategoryId: subflowParentCategoryId(subflow) ?? null,
    name: subflow.name,
    description: subflow.description ?? "",
    role: subflow.role,
    status: subflow.status === "disabled" ? "draft" : subflow.status,
    inputMapping: subflow.inputMapping ?? [],
    outputMapping: subflow.outputMapping ?? [],
    approvalOverride: subflow.interventionModeOverride === "no_llm_intervention" ? "disabled" : subflow.interventionModeOverride === "manual_approval" ? "manual_approval" : subflow.interventionModeOverride === "fully_adaptive" ? "adaptive" : subflow.proposalModeOverride === "manual" ? "manual_approval" : subflow.proposalModeOverride === "auto" || subflow.proposalModeOverride === "mixed" ? "adaptive" : null,
    createdAt: subflow.createdAt,
    updatedAt: subflow.updatedAt,
    deletedAt: null
  };
}

function sqlSubflowToFlowSubflow(projectId: string, row: AutomationStudioSqlSubflow): AutomationStudioFlowSubflow {
  return removeUndefinedSubflowFields({
    schemaVersion: "0.1",
    subflowId: row.subflowId,
    projectId,
    flowId: row.parentFlowId,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    role: row.role as AutomationStudioFlowSubflow["role"],
    status: row.status === "draft" ? "active" : row.status,
    inputMapping: Array.isArray(row.inputMapping) ? row.inputMapping as AutomationStudioFlowSubflow["inputMapping"] : [],
    outputMapping: Array.isArray(row.outputMapping) ? row.outputMapping as AutomationStudioFlowSubflow["outputMapping"] : [],
    ...(row.approvalOverride === "manual_approval" ? { proposalModeOverride: "manual" as const, interventionModeOverride: "manual_approval" as const } : row.approvalOverride === "adaptive" ? { proposalModeOverride: "auto" as const, interventionModeOverride: "fully_adaptive" as const } : row.approvalOverride === "disabled" ? { interventionModeOverride: "no_llm_intervention" as const } : {}),
    graphFlowId: row.graphFlowId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.parentCategoryId ? { metadata: { parentCategoryId: row.parentCategoryId, subflowCategoryId: row.parentCategoryId } } : {}),
    stability: { runCount: 0, successCount: 0, failureCount: 0 }
  } as AutomationStudioFlowSubflow);
}
