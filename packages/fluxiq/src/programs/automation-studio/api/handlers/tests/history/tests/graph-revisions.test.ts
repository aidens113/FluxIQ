// @fluxiq-test-group real-sql
// Covers handlers/graph-revisions.ts and the step-label edit: a Flow's saved
// versions are listed with who made them, a version can be put back as a new
// version, and a stale edit to a changed step is refused with the conflict.

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { createCacheApiTestService } from "../../test-service.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { assistantTestActor, expectExampleAccepted } from "../../assistant/assistant-example.ts";

const actor: ProgramApiActor = assistantTestActor;

function node(flowId: string, nodeId: string, label: string, x: number) {
  return { nodeId, flowId, definitionId: "builtin.step", definitionVersion: "1.0.0", label, description: "", x, y: 0, width: 320, height: 180, zIndex: 0, disabled: false, parameterValues: {}, metadata: {} };
}

describe("Flow version history API", () => {
  it("lists, keeps and restores versions, and edits a step's label with an undo", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "History" });
      const flow = await service.createFlow({ projectId: project.id, name: "Versioned" });
      const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
      const flowId = subflow.graphFlowId as string;
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const ids = { projectId: project.id, flowId };
      const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor, payload: { ...ids, authSessionId: actor.sessionId, ...payload } });
      const patch = (mutationId: string, baseRevision: number, operations: unknown[], extra: Record<string, unknown> = {}) => call(E.applyGraphPatch, { mutationId, baseRevision, operations, ...extra });

      // Revision 2: two steps. Revision 3: a label edit made by the assistant. Revision 4: another, by a person.
      const first = await patch("m.add", 1, [{ op: "add_node", node: node(flowId, "n.a", "Open the page", 0) }, { op: "add_node", node: node(flowId, "n.b", "", 400) }], { message: "Add two steps" });
      expect(first.ok, first.error).toBe(true);
      const relabel = await patch("m.label", 2, [{ op: "set_node_label", nodeId: "n.a", label: "Open the start page" }], { madeBy: "assistant", message: "Reword step 1" });
      expect(relabel).toMatchObject({ ok: true, payload: { result: { status: "applied", revisionNumber: 3, inverseOperations: [{ op: "set_node_label", nodeId: "n.a", label: "Open the page" }] } } });
      const relabelTwo = await patch("m.label2", 3, [{ op: "set_node_label", nodeId: "n.b", label: "Second step" }]);
      expect(relabelTwo).toMatchObject({ ok: true, payload: { result: { revisionNumber: 4, inverseOperations: [{ op: "set_node_label", nodeId: "n.b", label: "n.b" }] } } });

      // The inverse of a label edit restores the old label, including a step that had none.
      const undo = await patch("m.undo", 4, (relabelTwo.payload as any).result.inverseOperations);
      expect(undo).toMatchObject({ ok: true, payload: { result: { revisionNumber: 5 } } });
      const afterUndo = await service.getFlow(project.id, flowId);
      // A step added with no label is shown by its id, so the undo puts the id back.
      expect(afterUndo.nodes.find((entry) => entry.id === "n.b")?.label).toBe("n.b");
      expect(afterUndo.nodes.find((entry) => entry.id === "n.a")?.label).toBe("Open the start page");

      // Refusals with plain reasons.
      const empty = await patch("m.empty", 5, [{ op: "set_node_label", nodeId: "n.a", label: "   " }]);
      expect(empty.ok).toBe(false);
      expect(empty.error).toMatch(/cannot be empty/);
      const unknown = await patch("m.unknown", 5, [{ op: "set_node_label", nodeId: "n.missing", label: "x" }]);
      expect(unknown.ok).toBe(false);

      // A stale base revision on a step changed since gives the conflict result.
      const stale = await patch("m.stale", 2, [{ op: "set_node_label", nodeId: "n.a", label: "Out of date edit" }]);
      expect(stale).toMatchObject({ ok: true, payload: { result: { status: "conflict", baseRevision: 2, currentRevision: 5, conflictingEntityIds: ["n.a"] } } });
      expect((await service.getFlow(project.id, flowId)).nodes.find((entry) => entry.id === "n.a")?.label).toBe("Open the start page");

      // The list: newest first, who made each change, and a restore point on every version that was replaced.
      const listed = await call(E.listGraphRevisions, {});
      expect(listed.ok, listed.error).toBe(true);
      const entries = (listed.payload as any).revisions as Array<{ revisionNumber: number; madeBy: string; madeByLabel: string; message: string; snapshotSha256: string | null }>;
      expect(entries.map((entry) => entry.revisionNumber)).toEqual([5, 4, 3, 2, 1]);
      expect(entries.find((entry) => entry.revisionNumber === 3)).toMatchObject({ madeBy: "assistant", madeByLabel: "The assistant", message: "Reword step 1" });
      expect(entries.find((entry) => entry.revisionNumber === 2)).toMatchObject({ madeBy: "person", madeByLabel: "A person", message: "Add two steps" });
      expect(entries.find((entry) => entry.revisionNumber === 1)).toMatchObject({ madeBy: "system", message: "First saved version" });
      expect(entries.find((entry) => entry.revisionNumber === 2)?.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
      // Version 5 has a restore point too: the refused and conflicting edits above each kept it before trying.
      expect(entries.find((entry) => entry.revisionNumber === 5)?.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);

      // Restoring version 2 (before any label edit) is a new version 6; the history keeps all that went before.
      const restorePoint = entries.find((entry) => entry.revisionNumber === 2)!.snapshotSha256!;
      const restored = await call(E.restoreGraphSnapshot, { snapshotSha256: restorePoint, mutationId: "m.restore" });
      expect(restored, restored.error).toMatchObject({ ok: true, payload: { result: { status: "applied", revisionNumber: 6 }, flow: { graphRevision: 6 } } });
      const afterRestore = await service.getFlow(project.id, flowId);
      expect(afterRestore.nodes.find((entry) => entry.id === "n.a")?.label).toBe("Open the page");
      const relisted = (await call(E.listGraphRevisions, { limit: 2 })).payload as any;
      expect(relisted.revisions.map((entry: any) => entry.revisionNumber)).toEqual([6, 5]);
      expect(relisted).toMatchObject({ hasMore: true });
      expect(relisted.revisions[0]).toMatchObject({ madeBy: "person", message: "Restored an earlier version" });
      // The newest version is the one on screen, so it has no restore point until something replaces it.
      expect(relisted.revisions[0].snapshotSha256).toBeNull();

      // A restore point of the Flow as it is now; any other version number is refused in plain words.
      const kept = await call(E.createGraphSnapshot, {});
      expect(kept).toMatchObject({ ok: true, payload: { revisionNumber: 6, snapshotSha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
      const past = await call(E.createGraphSnapshot, { revisionNumber: 3 });
      expect(past.ok).toBe(false);
      expect(past.error).toMatch(/as it is now/);
    } finally {
      await cleanup();
    }
  });

  it("takes the minimal example of each exposed input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "History examples" });
      const flow = await service.createFlow({ projectId: project.id, name: "Examples" });
      const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
      const ids = { projectId: project.id, flowId: subflow.graphFlowId as string };
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      await expectExampleAccepted(registry, E.listGraphRevisions, ids);
      const kept = await expectExampleAccepted(registry, E.createGraphSnapshot, ids) as { snapshotSha256: string };
      await expectExampleAccepted(registry, E.restoreGraphSnapshot, { ...ids, snapshotSha256: kept.snapshotSha256, mutationId: "m.example" });
    } finally {
      await cleanup();
    }
  });
});
