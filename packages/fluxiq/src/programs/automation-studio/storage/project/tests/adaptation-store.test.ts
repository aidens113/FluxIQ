import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../model/index.ts";
import { AutomationStudioProjectAdaptationStore } from "../adaptation-store.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectGraphRepository } from "../graph-store.ts";

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
    await expect(store.getAdaptation("adaptation.metadata-only")).rejects.toThrow(/adaptation object|ENOENT/i);
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

  it("keeps parent API scope while applying and revision-checking an owned Subflow graph", async () => {
    const pool = createPool();
    const projectId = "project.subflow-apply";
    await seedFlow(pool, projectId, "flow.parent");
    await seedFlow(pool, projectId, "flow.child");
    const lease = await pool.acquire(projectId);
    await lease.database.run("insert into subflows (subflow_id, parent_flow_id, graph_flow_id, name, description, role, status, input_mapping_json, output_mapping_json, revision, created_at_ms, updated_at_ms) values ('subflow.primary', 'flow.parent', 'flow.child', 'Primary', '', 'primary', 'active', '[]', '[]', 1, 2, 2)");
    await lease.release();
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId });
    await graph.applyPatch({ pool, projectId, flowId: "flow.child", baseRevision: 1, mutationId: "child.prepare", operations: [{ op: "move_node", nodeId: "node.other", x: 250, y: 0 }], changedAt: 5 });
    await graph.close();
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId });
    const adaptation = subflowAdaptationFixture({ projectId, adaptationId: "adaptation.subflow", createdAt: 10 });

    await expect(store.putAdaptation({ adaptation, approvalMode: "manual_approval", changedAt: 10 })).resolves.toMatchObject({
      flowId: "flow.parent",
      subflowId: "subflow.primary",
      baseRevision: 2,
      revisions: { flowRevision: 2 },
      adaptation: { metadata: { graphRevisionTargetFlowId: "flow.child" } }
    });
    const legacyLease = await pool.acquire(projectId);
    const legacyRow = await legacyLease.database.get<{ status_detail_json: string }>("select status_detail_json from adaptations where adaptation_id = ?", [adaptation.adaptationId]);
    const legacyStatusDetail = JSON.parse(legacyRow?.status_detail_json ?? "{}") as { metadata?: Record<string, unknown> };
    if (legacyStatusDetail.metadata) {
      delete legacyStatusDetail.metadata.graphRevisionTargetFlowId;
      delete legacyStatusDetail.metadata.baseRevision;
    }
    await legacyLease.database.run("update adaptations set base_revision = 1, base_flow_revision = 1, status_detail_json = ? where adaptation_id = ?", [JSON.stringify(legacyStatusDetail), adaptation.adaptationId]);
    await legacyLease.release();
    const oldApplyGraph = await AutomationStudioProjectGraphRepository.open({ pool, projectId });
    await expect(oldApplyGraph.applyPatch({
      pool,
      projectId,
      flowId: "flow.parent",
      baseRevision: 1,
      mutationId: `adaptation.apply.${adaptation.adaptationId}`,
      operations: [{ op: "set_node_parameters", nodeId: "node.action", values: { target: { selector: "#subflow-new" } } }],
      changedAt: 15
    })).rejects.toThrow(/Unknown node/);
    await oldApplyGraph.close();
    const committedApplyGraph = await AutomationStudioProjectGraphRepository.open({ pool, projectId });
    const targetDigest = createHash("sha256").update("flow.child").digest("hex").slice(0, 12);
    await expect(committedApplyGraph.applyPatch({
      pool,
      projectId,
      flowId: "flow.child",
      baseRevision: 2,
      mutationId: `adaptation.apply.${adaptation.adaptationId}.graph-${targetDigest}`,
      operations: [{ op: "set_node_parameters", nodeId: "node.action", values: { target: { selector: "#subflow-new" } } }],
      authorId: "reviewer",
      message: `Apply adaptation ${adaptation.adaptationId}`,
      changedAt: 18
    })).resolves.toMatchObject({ response: { status: "applied", flowId: "flow.child", revisionNumber: 3 } });
    await committedApplyGraph.close();
    await expect(store.applyApprovedAdaptation({ adaptationId: adaptation.adaptationId, actorId: "reviewer", changedAt: 20, compile: false })).resolves.toMatchObject({
      adaptation: { flowId: "flow.parent", subflowId: "subflow.primary", status: "applied", appliedRevision: 3 },
      patch: { flowId: "flow.child", revisionNumber: 3 }
    });
    await expect(readNodeParameters(pool, projectId, "node.action")).resolves.toMatchObject({ target: { selector: "#subflow-new" } });
    await expect(readFlowRevision(pool, projectId, "flow.parent")).resolves.toBe(1);
    await expect(store.rollbackAdaptation({ adaptationId: adaptation.adaptationId, actorId: "reviewer", changedAt: 25 })).resolves.toMatchObject({ patch: { flowId: "flow.child", revisionNumber: 4 } });
    await expect(readNodeParameters(pool, projectId, "node.action")).resolves.toMatchObject({ target: "#old" });

    const stale = subflowAdaptationFixture({ projectId, adaptationId: "adaptation.subflow.stale", createdAt: 30 });
    await store.putAdaptation({ adaptation: stale, approvalMode: "manual_approval", changedAt: 30 });
    const laterGraph = await AutomationStudioProjectGraphRepository.open({ pool, projectId });
    await laterGraph.applyPatch({ pool, projectId, flowId: "flow.child", baseRevision: 4, mutationId: "child.changed", operations: [{ op: "move_node", nodeId: "node.other", x: 300, y: 0 }], changedAt: 31 });
    await laterGraph.close();
    await expect(store.applyApprovedAdaptation({ adaptationId: stale.adaptationId, actorId: "reviewer", changedAt: 32, compile: false })).rejects.toThrow(/stale base/);
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

  // Fix 2: a `validated` status is a claim; only an executed validation is
  // evidence. The store used to accept the claim on its own.
  it("refuses to apply an adaptation whose validated status rests on no executed validation", async () => {
    const pool = createPool();
    await seedFlow(pool, "project.adaptations", "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: "project.adaptations" });
    const claimed = adaptationFixture({ adaptationId: "adaptation.claimed", status: "validated", updatedAt: 20 });
    delete claimed.validationResults;
    await store.putAdaptation({ adaptation: claimed, changedAt: 20 });

    await expect(store.applyApprovedAdaptation({ adaptationId: "adaptation.claimed", actorId: "reviewer", changedAt: 21, compile: false }))
      .rejects.toThrow(/must pass validation/);
    await expect(store.listAuditEvents({ adaptationId: "adaptation.claimed", limit: 10 }))
      .resolves.toMatchObject({ events: expect.arrayContaining([expect.objectContaining({ eventType: "policy_blocked" })]) });
    await store.close();
  });

  // An `edit_recovery` patch used to be applied by writing a `recovery` key into
  // the target node's parameters. No node definition declares that parameter and
  // nothing in the executor reads it, so the Flow ran exactly as before while the
  // adaptation was recorded as `applied` — a repair that never happened, and
  // indistinguishable from one that did.
  it("refuses to apply an edit_recovery adaptation rather than writing a parameter nothing reads", async () => {
    const pool = createPool();
    await seedFlow(pool, "project.recovery", "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: "project.recovery" });
    await store.putAdaptation({ adaptation: recoveryAdaptationFixture(), changedAt: 20 });

    await expect(store.applyApprovedAdaptation({ adaptationId: "adaptation.recovery", actorId: "reviewer", changedAt: 21, compile: false }))
      .rejects.toThrow(/edit_recovery/);
    await expect(readNodeParameters(pool, "project.recovery", "node.action")).resolves.toEqual({ target: "#old" });
    await expect(readFlowRevision(pool, "project.recovery", "flow.main")).resolves.toBe(1);
    await expect(store.mustGetAdaptation("adaptation.recovery")).resolves.toMatchObject({ status: "validated", appliedRevision: null });
    await expect(store.listAuditEvents({ adaptationId: "adaptation.recovery", limit: 10 }))
      .resolves.toMatchObject({ events: expect.arrayContaining([expect.objectContaining({ eventType: "apply_failed" })]) });
    await store.close();
  });

  it("stamps the adaptation id once onto each node the applied change wrote, and its rollback removes the stamp", async () => {
    const pool = createPool();
    const projectId = "project.stamp";
    await seedFlow(pool, projectId, "flow.main");
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId });
    await graph.applyPatch({ pool, projectId, flowId: "flow.main", baseRevision: 1, mutationId: "seed.metadata", operations: [{ op: "set_node_metadata", nodeId: "node.action", metadata: { adaptationIds: ["adaptation.earlier"], note: "kept" } }], changedAt: 5 });
    await graph.close();
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId });
    const adaptation: AutomationStudioFlowAdaptation = { ...adaptationFixture({ adaptationId: "adaptation.stamp", patchCount: 2, updatedAt: 20 }), metadata: { baseRevision: 2, proposalModeOverride: "auto" } };
    await store.putAdaptation({ adaptation, changedAt: 20 });

    const applied = await store.applyApprovedAdaptation({ adaptationId: "adaptation.stamp", actorId: "reviewer", changedAt: 30, compile: false });
    expect(applied.patch).toMatchObject({ status: "applied", revisionNumber: 3 });
    await expect(readNodeMetadata(pool, projectId, "node.action")).resolves.toEqual({ adaptationIds: ["adaptation.earlier", "adaptation.stamp"], note: "kept" });
    await expect(readNodeMetadata(pool, projectId, "node.other")).resolves.toEqual({});
    await expect(readNodeParameters(pool, projectId, "node.action")).resolves.toEqual({ target: { selector: "#submit-1" } });
    expect(applied.adaptation.adaptation.appliedTo).toEqual([{ kind: "action_target", id: "node.action" }]);
    const history = await AutomationStudioProjectGraphRepository.open({ pool, projectId });
    const operations = await history.operations("flow.main:revision:3");
    await history.close();
    expect(operations.map((operation) => `${operation.operationKind}:${operation.entityId}`)).toEqual(["set_node_parameters:node.action", "set_node_parameters:node.action", "set_node_metadata:node.action"]);
    // Retrying the apply replays the committed, stamped request instead of stamping twice.
    await expect(store.applyApprovedAdaptation({ adaptationId: "adaptation.stamp", actorId: "reviewer", changedAt: 35, compile: false })).resolves.toMatchObject({ patch: { status: "applied", revisionNumber: 3 } });
    await expect(readFlowRevision(pool, projectId, "flow.main")).resolves.toBe(3);

    await expect(store.rollbackAdaptation({ adaptationId: "adaptation.stamp", actorId: "reviewer", changedAt: 40 })).resolves.toMatchObject({ patch: { status: "applied", revisionNumber: 4 } });
    await expect(readNodeMetadata(pool, projectId, "node.action")).resolves.toEqual({ adaptationIds: ["adaptation.earlier"], note: "kept" });
    await expect(readNodeParameters(pool, projectId, "node.action")).resolves.toEqual({ target: "#old" });
    await store.close();
  });

  // A route-only change writes an edge, not a node. Stamping the edge's source
  // would make every later run of that node claim the route was exercised,
  // including runs that never took it.
  it("stamps no node for a change that only adds a route, whose edge already names the adaptation", async () => {
    const pool = createPool();
    await seedFlow(pool, "project.route", "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId: "project.route" });
    const adaptation: AutomationStudioFlowAdaptation = { ...adaptationFixture({ adaptationId: "adaptation.route", updatedAt: 20 }), patch: [{ kind: "edit_router", targetId: "node.action", summary: "Route failures to the other step.", after: { toNodeId: "node.other" } }] };
    await store.putAdaptation({ adaptation, changedAt: 20 });

    await store.applyApprovedAdaptation({ adaptationId: "adaptation.route", actorId: "reviewer", changedAt: 30, compile: false });
    await expect(readNodeMetadata(pool, "project.route", "node.action")).resolves.toEqual({});
    await expect(readNodeMetadata(pool, "project.route", "node.other")).resolves.toEqual({});
    const lease = await pool.acquire("project.route");
    const edge = await lease.database.get<{ metadata_json: string }>("select metadata_json from graph_edges where source_node_id = 'node.action' and deleted_at_ms is null");
    await lease.release();
    expect(JSON.parse(edge?.metadata_json ?? "{}")).toEqual({ adaptationId: "adaptation.route" });
    await store.close();
  });

  it("writes the failure signature, confidence tier and entry point to typed columns on every write, and filters by them", async () => {
    const pool = createPool();
    const projectId = "project.matching";
    await seedFlow(pool, projectId, "flow.main");
    const store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId });
    const origin = { entryPoint: "run_failure", runId: "run.failed", failedNodeId: "node.action", failureSignature: "target_not_found:node.action" };
    const repair: AutomationStudioFlowAdaptation = { ...adaptationFixture({ adaptationId: "adaptation.repair", status: "testing", updatedAt: 20 }), metadata: { baseRevision: 1, origin } };
    await expect(store.putAdaptation({ adaptation: repair, changedAt: 20 })).resolves.toMatchObject({ failureSignature: "target_not_found:node.action", confidenceTier: "provisional", originEntryPoint: "run_failure" });
    await expect(readMatchingColumns(pool, projectId, "adaptation.repair")).resolves.toEqual({ failure_signature: "target_not_found:node.action", confidence_tier: "provisional", origin_entry_point: "run_failure" });

    // Two replays establish a low-risk change; a failed replay after them undoes that.
    const replayed: AutomationStudioFlowAdaptation = { ...repair, updatedAt: 30, validationResults: [...repair.validationResults!, { runId: "run.replay.1", status: "succeeded", checkedAt: 25, kind: "replay" }, { runId: "run.replay.2", status: "succeeded", checkedAt: 30, kind: "replay" }] };
    await expect(store.putAdaptation({ adaptation: replayed, changedAt: 30 })).resolves.toMatchObject({ confidenceTier: "established" });
    const failedReplay: AutomationStudioFlowAdaptation = { ...replayed, updatedAt: 40, validationResults: [...replayed.validationResults!, { runId: "run.replay.3", status: "failed", checkedAt: 40, kind: "replay" }] };
    await expect(store.putAdaptation({ adaptation: failedReplay, changedAt: 40 })).resolves.toMatchObject({ confidenceTier: "unverified" });

    const instruction: AutomationStudioFlowAdaptation = { ...adaptationFixture({ adaptationId: "adaptation.instruction", updatedAt: 50 }), riskLevel: "high", validationResults: [], metadata: { baseRevision: 1, origin: { entryPoint: "instruction", instructionIds: ["instruction.flow.main"] } } };
    await expect(store.putAdaptation({ adaptation: instruction, changedAt: 50 })).resolves.toMatchObject({ failureSignature: null, confidenceTier: "unverified", originEntryPoint: "instruction" });
    // Live patches still record a run failure's signature at metadata.failureSignature, and the known-adaptation gate matches on it.
    const livePatch: AutomationStudioFlowAdaptation = { ...adaptationFixture({ adaptationId: "adaptation.live-patch", updatedAt: 60 }), metadata: { baseRevision: 1, failureSignature: "target_not_found:node.action" } };
    await expect(store.putAdaptation({ adaptation: livePatch, changedAt: 60 })).resolves.toMatchObject({ failureSignature: "target_not_found:node.action", confidenceTier: "provisional", originEntryPoint: null });

    await store.setAdaptationStatus({ adaptationId: "adaptation.instruction", status: "rejected", actorId: "reviewer", metadata: { origin: { entryPoint: "edge_case", instructionIds: [], runId: "run.edge", failureSignature: "timeout:node.other" } }, changedAt: 70 });
    await expect(readMatchingColumns(pool, projectId, "adaptation.instruction")).resolves.toEqual({ failure_signature: "timeout:node.other", confidence_tier: "unverified", origin_entry_point: "edge_case" });
    await store.rebaseAdaptation({ adaptationId: "adaptation.repair", actorId: "reviewer", changedAt: 80 });
    await expect(readMatchingColumns(pool, projectId, "adaptation.repair")).resolves.toEqual({ failure_signature: "target_not_found:node.action", confidence_tier: "unverified", origin_entry_point: "run_failure" });

    const bySignature = await store.listAdaptationsPage({ flowId: "flow.main", failureSignature: "target_not_found:node.action" });
    expect(bySignature.adaptations.map((summary) => summary.adaptationId).sort()).toEqual(["adaptation.live-patch", "adaptation.repair"]);
    const provisional = await store.listAdaptationsPage({ confidenceTier: "provisional" });
    expect(provisional.adaptations.map((summary) => summary.adaptationId)).toEqual(["adaptation.live-patch"]);
    await expect(store.listAdaptationsPage({ confidenceTier: "high" as never })).rejects.toThrow(/confidence tier/);
    await store.close();
  });

  it("fills the matching columns of rows written before migration 0020 when the store opens", async () => {
    const pool = createPool();
    const projectId = "project.backfill";
    await seedFlow(pool, projectId, "flow.main");
    let store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId });
    const replays = [{ runId: "run.replay.1", status: "succeeded" as const, checkedAt: 21, kind: "replay" as const }, { runId: "run.replay.2", status: "succeeded" as const, checkedAt: 22, kind: "replay" as const }];
    const risky = adaptationFixture({ adaptationId: "adaptation.risky", updatedAt: 22 });
    await store.putAdaptation({ adaptation: { ...risky, riskLevel: "high", validationResults: [...risky.validationResults!, ...replays], metadata: { baseRevision: 1, failureSignature: "target_not_found:node.action" } }, changedAt: 22 });
    await store.putAdaptation({ adaptation: adaptationFixture({ adaptationId: "adaptation.corrupt", updatedAt: 23 }), changedAt: 23 });
    await store.close();
    const lease = await pool.acquire(projectId);
    await lease.database.run("update adaptations set failure_signature = null, confidence_tier = null, origin_entry_point = null");
    await lease.database.run("update adaptations set status_detail_json = 'not json' where adaptation_id = 'adaptation.corrupt'");
    await lease.release();

    store = await AutomationStudioProjectAdaptationStore.open({ pool, projectId });
    // A high-risk change needs a third replay, so two leave it provisional.
    await expect(readMatchingColumns(pool, projectId, "adaptation.risky")).resolves.toEqual({ failure_signature: "target_not_found:node.action", confidence_tier: "provisional", origin_entry_point: null });
    await expect(readMatchingColumns(pool, projectId, "adaptation.corrupt")).resolves.toEqual({ failure_signature: null, confidence_tier: "unverified", origin_entry_point: null });
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
    const suffix = flowId.replace(/[^A-Za-z0-9._:-]/g, ".");
    const routerId = `router.${suffix}`;
    const instructionId = `instruction.${suffix}`;
    await sql.run("insert into routers (router_id, flow_id, fallback_kind, revision, created_at_ms, updated_at_ms) values (?, ?, 'none', 3, 1, 1)", [routerId, flowId]);
    await sql.run("insert into instructions (instruction_id, title, inline_body, requirement, status, priority, content_digest, revision, created_at_ms, updated_at_ms) values (?, 'Instruction', 'Use precise selectors.', 'required', 'active', 10, 'digest.instruction', 7, 1, 1)", [instructionId]);
    await sql.run("insert into instruction_scopes (instruction_id, scope_kind, project_id, flow_id) values (?, 'flow', ?, ?)", [instructionId, projectId, flowId]);
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

function recoveryAdaptationFixture(): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.recovery",
    flowId: "flow.main",
    projectId: "project.recovery",
    trigger: "Action failed; run a confirmation sequence before retrying.",
    patch: [{ kind: "edit_recovery", targetId: "node.action", summary: "Recover by clicking the confirmation control.", after: { actionDefinitionIds: ["builtin.action.click"] } }],
    validationResults: [{ runId: "run.validation.recovery", status: "succeeded", checkedAt: 20 }],
    status: "validated",
    author: "llm",
    riskLevel: "medium",
    createdAt: 10,
    updatedAt: 20,
    metadata: { baseRevision: 1, proposalModeOverride: "auto" }
  };
}

function subflowAdaptationFixture(input: { projectId: string; adaptationId: string; createdAt: number }): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: input.adaptationId,
    flowId: "flow.parent",
    subflowId: "subflow.primary",
    projectId: input.projectId,
    trigger: "Subflow action target changed.",
    patch: [{ kind: "edit_action_target", targetId: "node.action", summary: "Use the new Subflow target.", before: "#old", after: { selector: "#subflow-new" } }],
    validationResults: [{ runId: "run.validation.subflow", status: "succeeded", checkedAt: input.createdAt }],
    status: "validated",
    author: "runtime",
    riskLevel: "high",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: { proposalModeOverride: "manual" }
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

async function readNodeMetadata(pool: AutomationStudioProjectDatabasePool, projectId: string, nodeId: string): Promise<Record<string, unknown>> {
  const lease = await pool.acquire(projectId);
  try {
    const row = await lease.database.get<{ metadata_json: string }>("select metadata_json from graph_nodes where node_id = ?", [nodeId]);
    return JSON.parse(row?.metadata_json ?? "{}") as Record<string, unknown>;
  } finally {
    await lease.release();
  }
}

async function readMatchingColumns(pool: AutomationStudioProjectDatabasePool, projectId: string, adaptationId: string): Promise<Record<string, unknown> | undefined> {
  const lease = await pool.acquire(projectId);
  try {
    return await lease.database.get<Record<string, unknown>>("select failure_signature, confidence_tier, origin_entry_point from adaptations where adaptation_id = ?", [adaptationId]);
  } finally {
    await lease.release();
  }
}

async function readFlowRevision(pool: AutomationStudioProjectDatabasePool, projectId: string, flowId: string): Promise<number> {
  const lease = await pool.acquire(projectId);
  try {
    const row = await lease.database.get<{ graph_revision: number }>("select graph_revision from flows where flow_id = ?", [flowId]);
    return row?.graph_revision ?? 0;
  } finally {
    await lease.release();
  }
}
