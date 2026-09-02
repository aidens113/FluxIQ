import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectFlowResourceRepository } from "./project-flow-resource-repository.ts";
import { AutomationStudioProjectFlowResourceMutations } from "./project-flow-resource-mutations.ts";

const rootDir = path.join(process.cwd(), ".tmp", `automation-studio-flow-resource-test-${process.pid}`);

describe("AutomationStudioProjectFlowResourceRepository", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("owns Flow metadata, settings, interface, variables, and errors in project SQL", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.phase4" });
    const saved = await repository.upsertFlow({
      flowId: "flow.main",
      parentFlowId: null,
      owningSubflowId: null,
      name: "Main Flow",
      description: "SQL-owned metadata",
      scopeKind: "global",
      scopeId: null,
      visibility: "private",
      origin: "user",
      sourceMode: "visual",
      status: "draft",
      compiledRevision: null,
      settings: { executionDefaults: { timeoutMs: 5000 }, adaptation: { mode: "adaptive" }, llm: { provider: "openai" } },
      inputs: [{ portId: "port.in", name: "Input", valueType: { kind: "string" }, required: true, defaultValue: null, description: "", sortKey: "0" }],
      outputs: [{ portId: "port.out", name: "Output", valueType: { kind: "json" }, required: false, defaultValue: null, description: "", sortKey: "0" }],
      variables: [{ variableId: "var.count", name: "count", valueType: { kind: "number" }, initialValue: 0, description: "", sortKey: "0" }],
      errors: [{ errorId: "error.timeout", code: "timeout", description: "Timed out", metadata: { severity: "high" } }],
      createdAt: 1,
      updatedAt: 2
    });
    expect(saved.settings?.adaptation).toEqual({ mode: "adaptive" });
    await repository.close();

    const reopened = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.phase4" });
    await expect(reopened.getFlow("flow.main")).resolves.toMatchObject({ name: "Main Flow", inputs: [{ portId: "port.in" }], variables: [{ variableId: "var.count" }], errors: [{ code: "timeout" }] });
    await expect(readFile(path.join(rootDir, "projects", "project.phase4", "indexes", "flows.json"), "utf8")).rejects.toThrow();
    await reopened.close();
    await pool.closeAll();
  });

  it("keyset-paginates Flow, category, and subflow lists while preserving graph Flow ownership", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.pages" });
    for (let index = 0; index < 4; index += 1) {
      await repository.upsertFlow(baseFlow(`flow.${index}`, `Flow ${index}`, index + 1));
    }
    await repository.upsertSubflowCategory({ categoryId: "category.alpha", flowId: "flow.0", parentCategoryId: null, name: "Alpha", sortKey: "a" });
    await repository.upsertSubflowCategory({ categoryId: "category.beta", flowId: "flow.0", parentCategoryId: null, name: "Beta", sortKey: "b" });
    await repository.upsertSubflow({ subflowId: "subflow.one", parentFlowId: "flow.0", graphFlowId: "flow.1", parentCategoryId: "category.alpha", name: "One", description: "", role: "utility", status: "active", inputMapping: [], outputMapping: [], approvalOverride: null });
    await repository.upsertSubflow({ subflowId: "subflow.two", parentFlowId: "flow.0", graphFlowId: "flow.2", parentCategoryId: "category.alpha", name: "Two", description: "", role: "utility", status: "active", inputMapping: [], outputMapping: [], approvalOverride: "adaptive" });
    const firstFlows = await repository.listFlowsPage({ limit: 2 });
    const secondFlows = await repository.listFlowsPage({ limit: 2, cursor: firstFlows.nextCursor });
    expect([...firstFlows.items, ...secondFlows.items].map((item) => item.flowId)).toEqual(["flow.3", "flow.2", "flow.1", "flow.0"]);
    await expect(repository.listSubflowCategoriesPage({ flowId: "flow.0", limit: 1 })).resolves.toMatchObject({ items: [{ categoryId: "category.alpha" }], hasMore: true });
    await expect(repository.listSubflowsPage({ flowId: "flow.0", categoryId: "category.alpha" })).resolves.toMatchObject({ items: [{ graphFlowId: "flow.1" }, { graphFlowId: "flow.2" }] });
    await repository.close();
    await pool.closeAll();
  });

  it("offset-paginates subflow and instruction summaries from indexed SQL metadata", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.summary-pages" });
    await repository.upsertFlow(baseFlow("flow.main", "Main", 1));
    await repository.upsertSubflowCategory({ categoryId: "category.alpha", flowId: "flow.main", parentCategoryId: null, name: "Alpha", sortKey: "a" });
    await repository.upsertSubflowCategory({ categoryId: "category.beta", flowId: "flow.main", parentCategoryId: null, name: "Beta", sortKey: "b" });
    for (let index = 0; index < 6; index += 1) {
      await repository.upsertFlow({ ...baseFlow(`flow.graph.${index}`, `Worker ${index} Graph`, 10 + index), parentFlowId: "flow.main" });
      await repository.upsertSubflow({
        subflowId: `subflow.${String(index).padStart(2, "0")}`,
        parentFlowId: "flow.main",
        graphFlowId: `flow.graph.${index}`,
        parentCategoryId: index % 2 === 0 ? "category.alpha" : "category.beta",
        name: index === 5 ? "Needle Worker" : `Worker ${String(index).padStart(2, "0")}`,
        description: "large detail text that should not be needed for list hydration",
        role: index === 5 ? "recovery" : "utility",
        status: "active",
        inputMapping: [{ from: "state" }],
        outputMapping: [{ to: "result" }],
        approvalOverride: index % 2 === 0 ? "adaptive" : null,
        updatedAt: 100 + index
      });
    }
    for (let index = 0; index < 5; index += 1) {
      await repository.upsertInstruction({
        instructionId: `instruction.${String(index).padStart(2, "0")}`,
        title: index === 4 ? "Needle instruction" : `Instruction ${String(index).padStart(2, "0")}`,
        inlineBody: `Detailed instruction body ${index} that belongs to detail views only.`,
        bodyObjectId: null,
        requirement: index % 2 === 0 ? "required" : "guidance",
        status: "active",
        priority: index,
        contentDigest: `digest.${index}`,
        scopes: [{ scopeKind: "flow", projectId: "project.summary-pages", flowId: "flow.main", routerId: null, subflowId: null, nodeId: null, errorCode: null }],
        tags: ["runtime"],
        updatedAt: 200 + index
      });
    }

    const subflowPage = await repository.listSubflowSummariesPage({ flowId: "flow.main", limit: 2, offset: 2, sort: "name", direction: "asc" });
    expect(subflowPage).toMatchObject({ total: 6, limit: 2, offset: 2 });
    expect(subflowPage.items.map((item) => item.subflowId)).toEqual(["subflow.01", "subflow.02"]);
    const categoryPage = await repository.listSubflowSummariesPage({ flowId: "flow.main", categoryId: "category.beta", limit: 10, offset: 0, sort: "updated", direction: "asc" });
    expect(categoryPage.items.map((item) => item.subflowId)).toEqual(["subflow.01", "subflow.03", "subflow.05"]);
    const searchedSubflows = await repository.listSubflowSummariesPage({ flowId: "flow.main", role: "recovery", search: "needle", limit: 10, offset: 0 });
    expect(searchedSubflows.items).toEqual([expect.objectContaining({ subflowId: "subflow.05", name: "Needle Worker", role: "recovery" })]);

    const instructionPage = await repository.listInstructionSummariesPage({ flowId: "flow.main", limit: 2, offset: 1, sort: "priority", direction: "asc" });
    expect(instructionPage).toMatchObject({ total: 5, limit: 2, offset: 1 });
    expect(instructionPage.items.map((item) => item.instructionId)).toEqual(["instruction.01", "instruction.02"]);
    expect(instructionPage.items[0]).not.toHaveProperty("inlineBody");
    expect(instructionPage.items[0]).not.toHaveProperty("bodyObjectId");
    expect(instructionPage.items[0]?.scope).toMatchObject({ scopeKind: "flow", projectId: "project.summary-pages", flowId: "flow.main" });
    const searchedInstructions = await repository.listInstructionSummariesPage({ flowId: "flow.main", requirement: "required", search: "Needle", limit: 10, offset: 0 });
    expect(searchedInstructions.items.map((item) => item.instructionId)).toEqual(["instruction.04"]);
    await repository.close();
    await pool.closeAll();
  });

  it("keyset-paginates searchable Router targets and routes beyond 100 rows", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.router-scale" });
    await repository.upsertFlow(baseFlow("flow.main", "Main", 1));
    const lease = await pool.acquire("project.router-scale");
    await lease.database.transaction(async (sql) => {
      for (let index = 0; index < 125; index += 1) {
        const suffix = String(index).padStart(4, "0");
        await sql.run("insert into flows (flow_id, parent_flow_id, owning_subflow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, 'flow.main', null, ?, 'project', 'project', 'user', 'visual', 'draft', ?, ?)", [`flow.graph.${suffix}`, `Worker ${suffix} graph`, index + 2, index + 2]);
        await sql.run("insert into subflows (subflow_id, parent_flow_id, graph_flow_id, name, description, role, status, input_mapping_json, output_mapping_json, revision, created_at_ms, updated_at_ms) values (?, 'flow.main', ?, ?, '', ?, 'active', '[]', '[]', 1, ?, ?)", [`subflow.${suffix}`, `flow.graph.${suffix}`, `Worker ${suffix}`, index === 124 ? "recovery" : "utility", index + 2, index + 2]);
      }
    });
    await lease.release();

    const firstTargets = await repository.listSubflowTargetsPage({ flowId: "flow.main", limit: 100 });
    const secondTargets = await repository.listSubflowTargetsPage({ flowId: "flow.main", limit: 100, cursor: firstTargets.nextCursor });
    expect(firstTargets).toMatchObject({ total: 125, limit: 100, hasMore: true });
    expect(firstTargets.items).toHaveLength(100);
    expect(secondTargets.items).toHaveLength(25);
    expect(new Set([...firstTargets.items, ...secondTargets.items].map((item) => item.subflowId)).size).toBe(125);
    await expect(repository.listSubflowTargetsPage({ flowId: "flow.main", search: "worker 0124", role: "recovery", limit: 10 })).resolves.toMatchObject({ total: 1, items: [{ subflowId: "subflow.0124" }] });
    await expect(repository.listSubflowTargetsPage({ flowId: "flow.main", search: "changed", cursor: firstTargets.nextCursor })).rejects.toThrow(/does not match/);

    await repository.replaceRouterProjection({
      routerId: "router.main",
      flowId: "flow.main",
      fallbackKind: "subflow",
      fallbackSubflowId: "subflow.0000",
      revision: 4,
      createdAt: 10,
      updatedAt: 20,
      groups: [
        { groupId: "group.primary", routerId: "router.main", name: "Primary", description: "High-priority traffic", order: 30, status: "disabled", collapsed: true, sortKey: "000000000001.group.primary", revision: 2, createdAt: 11, updatedAt: 19, metadata: { color: "red" } },
        { groupId: "group.secondary", routerId: "router.main", name: "Secondary", description: "", order: 10, status: "active", collapsed: false, sortKey: "000000000999.group.secondary", revision: 1, createdAt: 12, updatedAt: 18, metadata: {} }
      ],
      routes: Array.from({ length: 125 }, (_, index) => ({
        routeId: `route.${String(index).padStart(4, "0")}`,
        routerId: "router.main",
        groupId: index % 2 === 0 ? "group.primary" : null,
        name: `Route ${String(index).padStart(4, "0")}`,
        priority: index,
        enabled: index % 2 === 0,
        conditionKind: "always",
        condition: { kind: "always" },
        targetKind: "subflow",
        targetSubflowId: `subflow.${String(index).padStart(4, "0")}`,
        revision: 1,
        createdAt: 30 + index,
        updatedAt: 30 + index
      }))
    });

    const summary = await repository.getRouterSummaryForFlow("flow.main");
    expect(summary?.groups.map((group) => group.groupId)).toEqual(["group.secondary", "group.primary"]);
    expect(summary?.groups[1]).toMatchObject({ description: "High-priority traffic", order: 30, status: "disabled", collapsed: true, createdAt: 11, updatedAt: 19, metadata: { color: "red" } });
    const firstRoutes = await repository.listRouterRoutesPage({ flowId: "flow.main", limit: 100 });
    const secondRoutes = await repository.listRouterRoutesPage({ flowId: "flow.main", limit: 100, cursor: firstRoutes.nextCursor });
    expect(firstRoutes).toMatchObject({ counts: { total: 125, active: 63, disabled: 62 }, hasMore: true });
    expect(firstRoutes.items).toHaveLength(100);
    expect(secondRoutes.items).toHaveLength(25);
    expect([...firstRoutes.items, ...secondRoutes.items].map((item) => item.priority)).toEqual(Array.from({ length: 125 }, (_, index) => index));
    const activeGroupRoutes = await repository.listRouterRoutesPage({ flowId: "flow.main", groupId: "group.primary", status: "active", limit: 200 });
    expect(activeGroupRoutes.counts.total).toBe(63);
    expect(activeGroupRoutes.items.some((item) => item.routeId === "route.0000")).toBe(true);
    await expect(repository.listRouterRoutesPage({ flowId: "flow.main", search: "route 0124", limit: 10 })).resolves.toMatchObject({ counts: { total: 1 }, items: [{ routeId: "route.0124" }] });
    await expect(repository.listRouterRoutesPage({ flowId: "flow.main", status: "disabled", cursor: firstRoutes.nextCursor })).rejects.toThrow(/does not match/);
    await expect(repository.listRouterRoutesPage({ flowId: "flow.main", status: "invalid" as any })).rejects.toThrow(/Invalid Router route status filter/);
    await repository.upsertRouterRoute({ routeId: "route.extra", routerId: "router.main", groupId: null, name: "Extra target", priority: 126, enabled: true, conditionKind: "always", condition: { kind: "always" }, targetKind: "subflow", targetSubflowId: "subflow.0000" });
    const references = await repository.listRouterTargetReferences({ flowId: "flow.main", subflowIds: ["subflow.0000", "subflow.0001", "subflow.missing"], perTargetLimit: 1 });
    expect(references).toMatchObject({
      perTargetLimit: 1,
      targets: [
        { subflowId: "subflow.0000", routeCount: 2, fallback: true, total: 3, hasMore: true },
        { subflowId: "subflow.0001", routeCount: 1, fallback: false, total: 1, hasMore: false },
        { subflowId: "subflow.missing", routeCount: 0, fallback: false, total: 0, hasMore: false }
      ]
    });
    expect(references.targets[0]?.routes).toHaveLength(1);
    await expect(repository.listRouterTargetReferences({ flowId: "flow.main", subflowIds: Array.from({ length: 51 }, (_, index) => `subflow.${index}`) })).rejects.toThrow(/limited to 50/);
    await repository.close();
    await pool.closeAll();
  }, 30_000);

  it("stores Routers, routes, instructions, effective cache, and adaptation policies without JSON indexes", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.detail" });
    await repository.upsertFlow(baseFlow("flow.main", "Main", 1));
    await repository.upsertFlow(baseFlow("flow.graph", "Graph", 2));
    await repository.upsertSubflow({ subflowId: "subflow.a", parentFlowId: "flow.main", graphFlowId: "flow.graph", parentCategoryId: null, name: "Sub A", description: "", role: "utility", status: "active", inputMapping: [], outputMapping: [], approvalOverride: null });
    await repository.upsertRouter({ routerId: "router.main", flowId: "flow.main", fallbackKind: "subflow", fallbackSubflowId: "subflow.a" });
    await repository.upsertRouterGroup({ groupId: "group.primary", routerId: "router.main", name: "Primary", sortKey: "0" });
    await repository.upsertRouterRoute({ routeId: "route.first", routerId: "router.main", groupId: "group.primary", name: "First", priority: 10, enabled: true, conditionKind: "always", condition: { kind: "always" }, targetKind: "subflow", targetSubflowId: "subflow.a" });
    await repository.upsertInstruction({ instructionId: "instruction.flow", title: "Flow Rules", inlineBody: "Always be deterministic.", bodyObjectId: null, requirement: "required", status: "active", priority: 100, scopes: [{ scopeKind: "flow", projectId: "project.detail", flowId: "flow.main", routerId: null, subflowId: null, nodeId: null, errorCode: null }], tags: ["runtime"] });
    await repository.upsertInstructionBinding({ bindingId: "binding.router", ownerKind: "router", ownerId: "router.main", instructionId: "instruction.flow", sortKey: "0", enabled: true });
    const firstResolution = await repository.resolveEffectiveInstructions({ projectId: "project.detail", flowId: "flow.main" });
    const secondResolution = await repository.resolveEffectiveInstructions({ projectId: "project.detail", flowId: "flow.main" });
    await repository.upsertAdaptationPolicy({ policyId: "policy.flow", projectId: "project.detail", flowId: "flow.main", subflowId: null, preset: "adaptive", proposalMode: "auto", settings: { allowModifyRouter: true } });
    await expect(repository.getRouterForFlow("flow.main")).resolves.toMatchObject({ fallbackSubflowId: "subflow.a", groups: [{ groupId: "group.primary" }], routes: [{ routeId: "route.first" }] });
    expect(firstResolution.cached).toBe(false);
    expect(secondResolution.cached).toBe(true);
    await expect(repository.listInstructionBindings({ ownerKind: "router", ownerId: "router.main", enabledOnly: true })).resolves.toMatchObject([{ bindingId: "binding.router", instructionId: "instruction.flow" }]);
    await expect(repository.listInstructionsPage({ flowId: "flow.main", search: "Flow" })).resolves.toMatchObject({ items: [{ instructionId: "instruction.flow" }] });
    await expect(readFile(path.join(rootDir, "projects", "project.detail", "indexes", "instructions.json"), "utf8")).rejects.toThrow();
    await repository.close();
    await pool.closeAll();
  });

  it("records transactional mutation deltas for resource changes and deletion", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const mutations = await AutomationStudioProjectFlowResourceMutations.open({ pool, projectId: "project.mutations" });
    await mutations.createFlow({ mutationId: "mutation.flow", flowId: "flow.main", name: "Main", changedAt: 1 });
    await expect(mutations.createFlow({ mutationId: "mutation.flow", flowId: "flow.main", name: "Main", changedAt: 2 })).resolves.toMatchObject({ replayed: true, response: { flowId: "flow.main" } });
    const settings = await mutations.updateFlowSettings({ mutationId: "mutation.settings", flowId: "flow.main", expectedRevision: 1, interventionMode: "manual_approval", adaptation: { preset: "adaptive" }, changedAt: 3 });
    await mutations.saveInstruction({ mutationId: "mutation.instruction", instructionId: "instruction.one", title: "One", body: "Do one thing", scopes: [{ scopeKind: "flow", projectId: "project.mutations", flowId: "flow.main", routerId: null, subflowId: null, nodeId: null, errorCode: null }], changedAt: 4 });
    const deleted = await mutations.deleteResource({ mutationId: "mutation.delete", entityKind: "instruction", entityId: "instruction.one", expectedRevision: 1, changedAt: 5 });
    expect(settings.response.revision).toBe(2);
    expect(deleted.response.deleted).toBe(true);
    const lease = await pool.acquire("project.mutations");
    await expect(lease.database.get("select intervention_mode, intervention_mode_version from flow_settings where flow_id = 'flow.main'")).resolves.toEqual({ intervention_mode: "manual_approval", intervention_mode_version: 1 });
    await lease.release();
    await mutations.close();
    await pool.closeAll();
  });
});

function baseFlow(flowId: string, name: string, updatedAt: number) {
  return { flowId, parentFlowId: null, owningSubflowId: null, name, description: "", scopeKind: "global" as const, scopeId: null, visibility: "private" as const, origin: "user" as const, sourceMode: "visual" as const, status: "draft" as const, compiledRevision: null, updatedAt };
}
