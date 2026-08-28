import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../model/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../model/index.ts";
import { AutomationStudioProjectAdaptationStore } from "./project-adaptation-store.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectGraphRepository } from "./project-graph-store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-adaptation-store-test");

describe("AutomationStudioProjectAdaptationStore", () => {
  let pools: AutomationStudioProjectDatabasePool[] = [];

  beforeEach(async () => { await rm(rootDir, { recursive: true, force: true }); await mkdir(rootDir, { recursive: true }); pools = []; });
  afterEach(async () => { await Promise.all(pools.map((pool) => pool.closeAll())); await rm(rootDir, { recursive: true, force: true }); });

  it("stores typed metadata plus patch, prompt, response, and evidence as objects", async () => {
    const pool = createPool();
    await seedFlow(pool, "project.adaptations", "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: "project.adaptations" });

    const detail = await store.putAdaptation({
      adaptation: adaptationFixture({ adaptationId: "adaptation.one", status: "validated", updatedAt: 20 }),
      prompt: { messages: [{ role: "system", content: "Fix the action target." }] },
      response: { patchCount: 1, model: "test-llm" },
      evidence: { observedState: { selector: "#old" }, expectedState: { selector: "#submit" }, failedAction: { nodeId: "node.action" } },
      changedAt: 20
    });

    expect(detail).toMatchObject({
      adaptationId: "adaptation.one",
      status: "validated",
      approvalMode: "adaptive",
      patchCount: 1,
      evidenceCount: 1,
      revisions: { flowRevision: 1, routerRevision: 3, settingsRevision: 1, instructionRevision: 7 }
    });
    expect(detail.promptObjectId).toEqual(expect.stringContaining("object:"));
    expect(detail.responseObjectId).toEqual(expect.stringContaining("object:"));
    expect(detail.patchObjectId).toEqual(expect.stringContaining("object:"));
    expect(detail.adaptation.observedState).toEqual({ selector: "#old" });

    const artifacts = await store.listArtifacts({ adaptationId: "adaptation.one", limit: 10 });
    expect(artifacts.artifacts.map((artifact) => artifact.artifactKind).sort()).toEqual(["evidence", "patch", "prompt", "response"]);
    const evidence = await store.getDetailSection({ adaptationId: "adaptation.one", section: "evidence", limit: 2, offset: 0 });
    expect(evidence).toMatchObject({ total: 3, limit: 2, offset: 0 });

    const lease = await pool.acquire("project.adaptations");
    await expect(lease.database.get<{ status: string; prompt_object_id: string; response_object_id: string; patch_digest: string }>("select status, prompt_object_id, response_object_id, patch_digest from adaptations where adaptation_id = 'adaptation.one'")).resolves.toMatchObject({ status: "approved", prompt_object_id: detail.promptObjectId, response_object_id: detail.responseObjectId, patch_digest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    await lease.release();
    await store.close();
  });

  it("lists adaptation metadata and artifact catalog rows without reading stored object payloads", async () => {
    const pool = createPool();
    await seedFlow(pool, "project.metadata-only", "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: "project.metadata-only" });
    await store.putAdaptation({
      adaptation: adaptationFixture({ adaptationId: "adaptation.metadata-only", status: "validated", updatedAt: 25 }),
      prompt: { messages: [{ role: "system", content: "large prompt payload" }] },
      response: { model: "test-llm", text: "large response payload" },
      evidence: { observedState: { selector: "#old" } },
      changedAt: 25
    });

    await rm(path.join(rootDir, "projects", "project.metadata-only", "objects"), { recursive: true, force: true });

    await expect(store.listAdaptationsPage({ flowId: "flow.main", limit: 10, offset: 0 })).resolves.toMatchObject({
      total: 1,
      adaptations: [expect.objectContaining({ adaptationId: "adaptation.metadata-only", patchCount: 1, promptObjectId: expect.stringContaining("object:") })]
    });
    await expect(store.listArtifacts({ adaptationId: "adaptation.metadata-only", limit: 10, offset: 0 })).resolves.toMatchObject({
      total: 4,
      artifacts: expect.arrayContaining([expect.objectContaining({ artifactKind: "patch" }), expect.objectContaining({ artifactKind: "prompt" }), expect.objectContaining({ artifactKind: "response" }), expect.objectContaining({ artifactKind: "evidence" })])
    });
    await store.close();
  });
  it("pages adaptation lists and detail sections without loading every detail item", async () => {
    const pool = createPool();
    await seedFlow(pool, "project.pages", "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: "project.pages" });
    for (let index = 0; index < 35; index++) await store.putAdaptation({ adaptation: adaptationFixture({ adaptationId: `adaptation.page.${index.toString().padStart(2, "0")}`, trigger: `Trigger ${index}`, updatedAt: 100 + index }), changedAt: 100 + index });

    const page = await store.listAdaptationsPage({ flowId: "flow.main", limit: 10, offset: 20 });
    expect(page).toMatchObject({ total: 35, limit: 10, offset: 20 });
    expect(page.adaptations).toHaveLength(10);
    expect(page.adaptations[0]?.adaptationId).toBe("adaptation.page.14");

    const changed = await store.putAdaptation({ adaptation: adaptationFixture({ adaptationId: "adaptation.long", patchCount: 12, updatedAt: 200 }), changedAt: 200 });
    const firstChanges = await store.getDetailSection({ adaptationId: changed.adaptationId, section: "changes", limit: 5, offset: 0 });
    const secondChanges = await store.getDetailSection({ adaptationId: changed.adaptationId, section: "changes", limit: 5, offset: 5 });
    expect(firstChanges.items).toHaveLength(5);
    expect(secondChanges.items).toHaveLength(5);
    expect(firstChanges.total).toBe(12);
    await store.close();
  });

  it("applies approved adaptations through graph patch transactions and rolls them back", async () => {
    const pool = createPool();
    await seedFlow(pool, "project.apply", "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: "project.apply" });
    await store.putAdaptation({ adaptation: adaptationFixture({ adaptationId: "adaptation.apply", status: "validated", updatedAt: 20 }), changedAt: 20 });

    const applied = await store.applyApprovedAdaptation({ adaptationId: "adaptation.apply", actorId: "reviewer", changedAt: 30, compile: false });
    expect(applied.patch).toMatchObject({ status: "applied", revisionNumber: 2 });
    expect(applied.adaptation).toMatchObject({ status: "applied", appliedRevision: 2 });
    await expect(readNodeParameters(pool, "project.apply", "node.action")).resolves.toMatchObject({ target: { selector: "#submit" } });

    const rolledBack = await store.rollbackAdaptation({ adaptationId: "adaptation.apply", actorId: "reviewer", changedAt: 40 });
    expect(rolledBack.patch).toMatchObject({ status: "applied", revisionNumber: 3 });
    expect(rolledBack.adaptation.status).toBe("reverted");
    await expect(readNodeParameters(pool, "project.apply", "node.action")).resolves.toMatchObject({ target: "#old" });
    await expect(store.listAuditEvents({ adaptationId: "adaptation.apply", limit: 10 })).resolves.toMatchObject({ total: 3, events: expect.arrayContaining([expect.objectContaining({ eventType: "applied" }), expect.objectContaining({ eventType: "rollback" })]) });
    await store.close();
  });

  it("enforces automatic, manual, disabled, stale-base, rebase, and supersede lifecycle gates", async () => {
    const pool = createPool();
    await seedFlow(pool, "project.policy", "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: "project.policy" });
    await store.putAdaptation({ adaptation: adaptationFixture({ adaptationId: "adaptation.manual", status: "validated", updatedAt: 20 }), approvalMode: "manual_approval", changedAt: 20 });

    await expect(store.applyApprovedAdaptation({ adaptationId: "adaptation.manual", actorId: "runtime", changedAt: 21, compile: false })).rejects.toThrow(/Manual approval policy/);
    expect(store.decidePolicy({ approvalMode: "disabled", validated: true, action: "create" })).toMatchObject({ ok: false, compileRequired: false });

    await store.putAdaptation({ adaptation: adaptationFixture({ adaptationId: "adaptation.stale", status: "validated", updatedAt: 30 }), changedAt: 30 });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.policy" });
    await graph.applyPatch({ pool, projectId: "project.policy", flowId: "flow.main", baseRevision: 1, mutationId: "external.move", operations: [{ op: "move_node", nodeId: "node.other", x: 300, y: 40 }], changedAt: 31 });
    await graph.close();

    await expect(store.applyApprovedAdaptation({ adaptationId: "adaptation.stale", actorId: "reviewer", changedAt: 32, compile: false })).rejects.toThrow(/stale base/);
    await expect(store.listAuditEvents({ adaptationId: "adaptation.stale", limit: 10 })).resolves.toMatchObject({ events: expect.arrayContaining([expect.objectContaining({ eventType: "stale_base" })]) });
    await expect(store.rebaseAdaptation({ adaptationId: "adaptation.stale", actorId: "reviewer", changedAt: 33 })).resolves.toMatchObject({ baseRevision: 2, revisions: { flowRevision: 2 } });

    await store.putAdaptation({ adaptation: adaptationFixture({ adaptationId: "adaptation.newer", status: "validated", updatedAt: 34 }), changedAt: 34 });
    await expect(store.supersedeAdaptation({ adaptationId: "adaptation.manual", supersededByAdaptationId: "adaptation.newer", actorId: "reviewer", changedAt: 35 })).resolves.toMatchObject({ status: "superseded", supersededByAdaptationId: "adaptation.newer" });
    await store.close();
  });

  function createPool(): AutomationStudioProjectDatabasePool {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(pool);
    return pool;
  }
});

async function seedFlow(pool: AutomationStudioProjectDatabasePool, projectId: string, flowId: string): Promise<void> {
  const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId });
  const flow = createBlankAutomationStudioFlowArtifact({ flowId, projectId, name: "Main", now: 1 });
  flow.nodes = [
    { id: "node.action", definitionId: "builtin.step", label: "Action", position: { x: 0, y: 0 }, parameterValues: { target: "#old" } },
    { id: "node.other", definitionId: "builtin.step", label: "Other", position: { x: 200, y: 0 }, parameterValues: { ok: true } }
  ];
  await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
  await graph.close();
  const lease = await pool.acquire(projectId);
  await lease.database.transaction(async (sql) => {
    await sql.run("insert into routers (router_id, flow_id, fallback_kind, revision, created_at_ms, updated_at_ms) values ('router.main', ?, 'none', 3, 1, 1)", [flowId]);
    await sql.run("insert into instructions (instruction_id, title, inline_body, requirement, status, priority, content_digest, revision, created_at_ms, updated_at_ms) values ('instruction.main', 'Instruction', 'Use precise selectors.', 'required', 'active', 10, 'digest.instruction', 7, 1, 1)");
    await sql.run("insert into instruction_scopes (instruction_id, scope_kind, project_id, flow_id) values ('instruction.main', 'flow', ?, ?)", [projectId, flowId]);
  });
  await lease.release();
}

function adaptationFixture(input: { adaptationId: string; status?: AutomationStudioFlowAdaptation["status"]; trigger?: string; patchCount?: number; updatedAt?: number }): AutomationStudioFlowAdaptation {
  const patchCount = input.patchCount ?? 1;
  return {
    schemaVersion: "0.1",
    adaptationId: input.adaptationId,
    flowId: "flow.main",
    projectId: input.adaptationId.includes("policy") ? "project.policy" : "project.adaptations",
    trigger: input.trigger ?? "Action target failed validation.",
    patch: Array.from({ length: patchCount }, (_, index) => ({ kind: "edit_action_target" as const, targetId: "node.action", summary: `Change action target ${index + 1}`, before: "#old", after: { selector: `#submit${index ? `-${index}` : ""}` } })),
    validationResults: [{ runId: "run.validation.1", status: "succeeded", checkedAt: input.updatedAt ?? 10 }],
    status: input.status ?? "validated",
    author: "llm",
    riskLevel: "low",
    createdAt: 10,
    updatedAt: input.updatedAt ?? 10,
    metadata: { baseRevision: 1, proposalModeOverride: "auto" }
  };
}

async function readNodeParameters(pool: AutomationStudioProjectDatabasePool, projectId: string, nodeId: string): Promise<Record<string, unknown>> {
  const lease = await pool.acquire(projectId);
  try {
    const row = await lease.database.get<{ parameter_values_json: string }>("select parameter_values_json from graph_nodes where node_id = ?", [nodeId]);
    return JSON.parse(row?.parameter_values_json ?? "{}") as Record<string, unknown>;
  } finally {
    await lease.release();
  }
}
