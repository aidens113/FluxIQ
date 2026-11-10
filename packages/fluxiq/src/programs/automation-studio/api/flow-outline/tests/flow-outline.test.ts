// @fluxiq-test-group real-sql
// Covers flow-outline/: a stored Flow is read as numbered steps, a step is renamed from the list and the change
// undone, a stale edit gets the conflict with who and which steps, and a refused edit saves nothing.

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../api-contracts/automation.ts";
import { createCacheApiTestService } from "../../handlers/tests/test-service.ts";
import { registerAutomationStudioApi } from "../../index.ts";
import { assistantTestActor, expectExampleAccepted } from "../../handlers/tests/assistant/assistant-example.ts";

const E = AUTOMATION_STUDIO_ENDPOINTS;

function step(flowId: string, nodeId: string, label: string, x: number, definitionId = "builtin.policy.action") {
  return { nodeId, flowId, definitionId, definitionVersion: "1.0.0", label, description: "", x, y: 0, width: 320, height: 180, zIndex: 0, disabled: false, parameterValues: { outputId: "site.output.press", parameters: {} }, metadata: {} };
}

function path(flowId: string, from: string, to: string) {
  return { edgeId: `edge.${from}.${to}`, flowId, sourceNodeId: from, targetNodeId: to, sourcePortId: "success", targetPortId: "in", label: "", metadata: {} };
}

async function setup() {
  const { service, cleanup } = await createCacheApiTestService();
  const project = await service.createProject({ name: "Outline" });
  const flow = await service.createFlow({ projectId: project.id, name: "Three steps" });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const flowId = subflow.graphFlowId as string;
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: assistantTestActor, payload: { projectId: project.id, flowId, authSessionId: assistantTestActor.sessionId, ...payload } });
  const seeded = await call(E.applyGraphPatch, {
    mutationId: "seed",
    baseRevision: 1,
    operations: [
      { op: "add_node", node: step(flowId, "n.1", "Open the shop", 0) },
      { op: "add_node", node: step(flowId, "n.2", "Search for a lamp", 400) },
      { op: "add_node", node: step(flowId, "n.3", "Press Buy", 800) },
      { op: "add_edge", edge: path(flowId, "n.1", "n.2") },
      { op: "add_edge", edge: path(flowId, "n.2", "n.3") }
    ]
  });
  expect(seeded.ok, seeded.error).toBe(true);
  const words = (outline: any): string[] => outline.steps.map((entry: any) => `${entry.number} ${entry.words}`);
  return { service, cleanup, registry, call, flowId, projectId: project.id, words };
}

describe("Flow outline API", () => {
  it("reads numbered steps, renames one, shows it next time, and undoes it", async () => {
    const t = await setup();
    try {
      const read = await t.call(E.getFlowOutline, {});
      expect(read.ok, read.error).toBe(true);
      const first = read.payload as any;
      expect(first.revision).toBe(2);
      expect(first.updatedAt).toEqual(expect.any(Number));
      expect(t.words(first.outline)).toEqual(["1 Open the shop", "2 Search for a lamp", "3 Press Buy"]);

      const edited = await t.call(E.editFlowSteps, { baseRevision: first.revision, edit: { kind: "set-words", step: "2", words: "Search for a desk lamp" }, via: "assistant" });
      expect(edited.ok, edited.error).toBe(true);
      const saved = edited.payload as any;
      expect(saved).toMatchObject({ ok: true, revision: 3, inverseOperations: [{ op: "set_node_label", nodeId: "n.2", label: "Search for a lamp" }] });
      expect(t.words(saved.outline)).toEqual(["1 Open the shop", "2 Search for a desk lamp", "3 Press Buy"]);

      const next = (await t.call(E.getFlowOutline, {})).payload as any;
      expect(next.revision).toBe(3);
      expect(t.words(next.outline)[1]).toBe("2 Search for a desk lamp");
      const history = (await t.call(E.listGraphRevisions, {})).payload as any;
      expect(history.revisions[0]).toMatchObject({ revisionNumber: 3, madeBy: "assistant" });

      const undone = (await t.call(E.undoFlowEdit, { baseRevision: 3, inverseOperations: saved.inverseOperations })).payload as any;
      expect(undone).toMatchObject({ ok: true, revision: 4 });
      expect(t.words(undone.outline)[1]).toBe("2 Search for a lamp");
      expect(t.words(((await t.call(E.getFlowOutline, {})).payload as any).outline)[1]).toBe("2 Search for a lamp");
    } finally {
      await t.cleanup();
    }
  });

  it("answers a stale edit to a changed step with who changed it and which steps, saving nothing", async () => {
    const t = await setup();
    try {
      await t.call(E.editFlowSteps, { baseRevision: 2, edit: { kind: "set-words", step: "2", words: "Search for a desk lamp" }, via: "assistant" });
      const staleCall = await t.call(E.editFlowSteps, { baseRevision: 2, edit: { kind: "set-words", step: "2", words: "Out of date" } });
      expect(staleCall.ok, staleCall.error).toBe(true);
      const stale = staleCall.payload as any;
      expect(stale.ok).toBe(false);
      expect(stale.conflict).toMatchObject({ status: "conflict", baseRevision: 2, currentRevision: 3, steps: ["2"], changedBy: [{ revisionNumber: 3, madeBy: "assistant", madeByLabel: "The assistant" }] });
      expect(t.words(stale.outline)[1]).toBe("2 Search for a desk lamp");
      expect((await t.service.getFlow(t.projectId, t.flowId)).metadata?.graphRevision).toBe(3);

      // A change to a step nobody else touched is saved on top, with the step numbers of the version it was made on.
      const other = (await t.call(E.editFlowSteps, { baseRevision: 2, edit: { kind: "set-words", step: "3", words: "Press Buy now" } })).payload as any;
      expect(other).toMatchObject({ ok: true, revision: 4 });
      expect(t.words(other.outline)).toEqual(["1 Open the shop", "2 Search for a desk lamp", "3 Press Buy now"]);
    } finally {
      await t.cleanup();
    }
  });

  it("refuses an edit it cannot make with the plain reason and saves nothing", async () => {
    const t = await setup();
    try {
      const refused = (await t.call(E.editFlowSteps, { baseRevision: 2, edit: { kind: "set-words", step: "9", words: "Nothing here" } })).payload as any;
      expect(refused.ok).toBe(false);
      expect(refused.reason).toEqual(expect.any(String));
      expect(refused.reason.length).toBeGreaterThan(5);
      expect(refused.conflict).toBeUndefined();
      expect(((await t.call(E.getFlowOutline, {})).payload as any).revision).toBe(2);
      const future = (await t.call(E.editFlowSteps, { baseRevision: 40, edit: { kind: "delete", step: "1" } })).payload as any;
      expect(future).toMatchObject({ ok: false, reason: expect.stringContaining("does not exist") });
    } finally {
      await t.cleanup();
    }
  });

  it("takes the minimal examples its schemas declare, and keeps undo from the assistant", async () => {
    const t = await setup();
    try {
      const ids = { projectId: t.projectId, flowId: t.flowId };
      await expectExampleAccepted(t.registry, E.getFlowOutline, ids);
      await expectExampleAccepted(t.registry, E.editFlowSteps, { ...ids, baseRevision: 2, edit: { kind: "move", step: "3", direction: "up" } });
      const undo = t.registry.endpoints().find((entry) => entry.endpoint === E.undoFlowEdit);
      expect(undo?.assistant).toHaveProperty("hidden");
    } finally {
      await t.cleanup();
    }
  });
});
