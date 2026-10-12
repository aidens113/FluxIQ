// The one overlay every runtime patch is applied through (state-aware recovery
// plan, C6 step 8 and C12): pure, naming the unit it changed, held to that unit
// by digest, and refused when it leaves the graph invalid.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { automationStudioGraphHandlerRegistrations } from "../../executor/lifecycle/index.ts";
import type { AutomationStudioRuntimePatch } from "../../llm/index.ts";
import { applyAutomationStudioInsertedSteps, automationStudioGraphUnits, automationStudioUnitDigestRefusal, overlayAutomationStudioRuntimePatch } from "../index.ts";

const RUN = "run.overlay";

function flow(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.overlay",
    ownerKind: "policy",
    ownerId: "flow.overlay",
    name: "Overlay",
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { id: "open", definitionId: "builtin.data.constant", parameterValues: { value: "open" }, position: { x: 0, y: 0 } },
      { id: "read", definitionId: "builtin.data.constant", parameterValues: { value: "read" }, position: { x: 320, y: 0 }, metadata: { "fluxiq.checkpoint": { id: "cp.read" } } },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" }, position: { x: 640, y: 0 } },
      { id: "handler.notice", definitionId: "builtin.control.handler", parameterValues: { event: "fail", scope: { kind: "nodes", nodeIds: ["read"] }, when: [], completionCheck: [] } },
      { id: "handler.notice.step", definitionId: "builtin.data.constant", parameterValues: { value: "dismiss" } },
      { id: "handler.notice.end", definitionId: "builtin.control.handler-end", parameterValues: { disposition: "unhandled" } }
    ],
    edges: [
      { id: "open.read", sourceNodeId: "open", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" },
      { id: "read.end", sourceNodeId: "read", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" },
      { id: "handler.body", sourceNodeId: "handler.notice", sourcePortId: "body", targetNodeId: "handler.notice.step", targetPortId: "in" },
      { id: "handler.done", sourceNodeId: "handler.notice.step", sourcePortId: "success", targetNodeId: "handler.notice.end", targetPortId: "in" }
    ]
  };
}

function overlay(patch: AutomationStudioRuntimePatch, input: { graph?: AutomationStudioFlowDocument; subflowGraphs?: Record<string, AutomationStudioFlowDocument> } = {}) {
  return overlayAutomationStudioRuntimePatch({ flow: input.graph ?? flow(), patch, failedNodeId: "read", runId: RUN, ...(input.subflowGraphs ? { subflowGraphs: input.subflowGraphs } : {}) });
}

function registrations(graph: AutomationStudioFlowDocument) {
  return automationStudioGraphHandlerRegistrations({ graphFlowId: graph.flowId, subflowId: null, nodes: graph.nodes, edges: graph.edges });
}

const notice = { fact: "dialog.visible", op: "visible" as const };
const cleared = { fact: "dialog.visible", op: "absent" as const };

describe("overlayAutomationStudioRuntimePatch", () => {
  describe("add_handler", () => {
    it("adds a handler the registration reader reads back with its scope, event, when and disposition", () => {
      const input = flow();
      const original = structuredClone(input);
      const result = overlay({
        kind: "add_handler",
        reason: "A notice covers the list.",
        event: "before",
        scope: { kind: "nodes", nodeIds: ["read"] },
        when: [notice],
        completionCheck: [cleared],
        steps: [{ definitionId: "builtin.data.constant", label: "Close it", parameters: { value: "close" } }, { definitionId: "builtin.data.constant" }],
        then: { kind: "resume" }
      }, { graph: input });

      expect(result.applied).toBe(true);
      if (!result.applied) return;
      const id = `node.runtime-patch.${RUN}.handler-read`;
      expect(result.changedUnit).toEqual({ kind: "handler", nodeId: id });
      const read = registrations(result.flow);
      expect(read.problems).toEqual([]);
      const added = read.registrations.find((registration) => registration.handlerId === `flow.overlay/${id}`);
      expect(added).toMatchObject({ event: "before", scope: { kind: "nodes", nodeIds: ["read"] }, when: [notice], completionCheck: [cleared], source: { kind: "handler_node", nodeId: id, bodyNodeId: `${id}.step-1` } });
      expect(result.flow.nodes.find((node) => node.id === `${id}.end`)?.parameterValues).toEqual({ disposition: "resume" });
      expect(result.flow.edges.filter((edge) => edge.id.startsWith(id)).map((edge) => [edge.sourceNodeId, edge.sourcePortId, edge.targetNodeId])).toEqual([
        [id, "body", `${id}.step-1`],
        [`${id}.step-1`, "success", `${id}.step-2`],
        [`${id}.step-2`, "success", `${id}.end`]
      ]);
      expect(input).toEqual(original);
    });

    it("stores route and give_up as the dispositions C5 names", () => {
      const routed = overlay({ kind: "add_handler", reason: "Go back to the list.", event: "fail", scope: { kind: "subflow" }, when: [], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "route", checkpointId: "cp.read" } });
      const gaveUp = overlay({ kind: "add_handler", reason: "Nothing to do.", event: "fail", scope: { kind: "subflow", inherit: false }, when: [], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "give_up" } });

      expect(routed.applied && routed.flow.nodes.find((node) => node.id.endsWith(".end") && node.id.includes("handler-read"))?.parameterValues).toEqual({ disposition: "route", checkpointId: "cp.read" });
      expect(gaveUp.applied && gaveUp.flow.nodes.find((node) => node.id.endsWith(".end") && node.id.includes("handler-read"))?.parameterValues).toEqual({ disposition: "unhandled" });
      expect(gaveUp.applied && registrations(gaveUp.flow).registrations.find((registration) => registration.handlerId.includes("handler-read"))?.scope).toEqual({ kind: "subflow", inherit: false });
    });

    it("takes a fresh id for a second handler at the same step", () => {
      const patch: AutomationStudioRuntimePatch = { kind: "add_handler", reason: "Again.", event: "fail", scope: { kind: "subflow" }, when: [], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "give_up" } };
      const first = overlay(patch);
      const second = first.applied ? overlay(patch, { graph: first.flow }) : first;

      expect(second.applied && second.changedUnit).toEqual({ kind: "handler", nodeId: `node.runtime-patch.${RUN}.handler-read-2` });
    });

    it("is refused when the graph it builds is invalid, in the validator's words", () => {
      const unknownCheckpoint = overlay({ kind: "add_handler", reason: "r", event: "fail", scope: { kind: "subflow" }, when: [], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "route", checkpointId: "cp.nowhere" } });
      const unchecked = overlay({ kind: "add_handler", reason: "r", event: "retry", scope: { kind: "subflow" }, when: [notice], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "resume" } });

      expect(unknownCheckpoint).toMatchObject({ applied: false, reason: "overlay_invalid:flow.handler_unknown_checkpoint", message: expect.stringContaining("cp.nowhere") });
      expect(unchecked).toMatchObject({ applied: false, reason: "overlay_invalid:flow.handler_missing_completion_check" });
    });

    it("is refused when it names a node the graph does not have", () => {
      expect(overlay({ kind: "add_handler", reason: "r", event: "fail", scope: { kind: "nodes", nodeIds: ["absent"] }, when: [], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "give_up" } }))
        .toMatchObject({ applied: false, reason: "handler_scope_node_absent:absent" });
    });
  });

  describe("replace_unit", () => {
    it("replaces a node under its own id, chains the rest, and sends its failure where the repair says", () => {
      const input = flow();
      const original = structuredClone(input);
      const result = overlay({ kind: "replace_unit", reason: "The step changed.", unit: { kind: "node", nodeId: "read" }, steps: [{ definitionId: "builtin.data.constant", parameters: { value: "first" } }, { definitionId: "builtin.data.constant", parameters: { value: "second" } }], failedEdgeTo: "end" }, { graph: input });

      expect(result.applied).toBe(true);
      if (!result.applied) return;
      const second = `node.runtime-patch.${RUN}.unit-read.step-2`;
      expect(result.changedUnit).toEqual({ kind: "node", nodeId: "read" });
      expect(result.flow.nodes.find((node) => node.id === "read")).toMatchObject({ parameterValues: { value: "first" }, metadata: { "fluxiq.checkpoint": { id: "cp.read" }, runtimePatchReplacedDefinitionId: "builtin.data.constant" } });
      expect(result.flow.edges.map((edge) => [edge.sourceNodeId, edge.sourcePortId, edge.targetNodeId])).toEqual(expect.arrayContaining([
        ["open", "success", "read"],
        ["read", "success", second],
        [second, "success", "end"],
        [second, "failed", "end"]
      ]));
      expect(input).toEqual(original);
    });

    it("replaces a handler's body and end under the same registration", () => {
      const result = overlay({
        kind: "replace_unit",
        reason: "The handler missed a case.",
        unit: { kind: "handler", nodeId: "handler.notice" },
        handler: { event: "retry", scope: { kind: "nodes", nodeIds: ["read"] }, when: [notice], completionCheck: [cleared], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "resume" } }
      });

      expect(result.applied).toBe(true);
      if (!result.applied) return;
      expect(result.changedUnit).toEqual({ kind: "handler", nodeId: "handler.notice" });
      expect(result.flow.nodes.map((node) => node.id)).not.toContain("handler.notice.step");
      expect(result.flow.nodes.map((node) => node.id)).not.toContain("handler.notice.end");
      expect(registrations(result.flow).registrations.find((registration) => registration.handlerId === "flow.overlay/handler.notice")).toMatchObject({ event: "retry", when: [notice] });
    });

    it("replaces a part's graph, keeps its Start, and leaves the calling graph alone", () => {
      const part: AutomationStudioFlowDocument = {
        ...flow(),
        flowId: "subflow.search.graph",
        nodes: [
          { id: "start", definitionId: "builtin.control.start" },
          { id: "old", definitionId: "builtin.data.constant" }
        ],
        edges: [{ id: "start.old", sourceNodeId: "start", sourcePortId: "next", targetNodeId: "old", targetPortId: "in" }]
      };
      const original = structuredClone(part);
      const input = flow();
      const result = overlay({ kind: "replace_unit", reason: "The part changed.", unit: { kind: "part", subflowId: "subflow.search" }, steps: [{ definitionId: "builtin.data.constant" }, { definitionId: "builtin.control.end" }] }, { graph: input, subflowGraphs: { "subflow.search": part } });

      expect(result.applied).toBe(true);
      if (!result.applied) return;
      expect(result.changedUnit).toEqual({ kind: "part", subflowId: "subflow.search" });
      expect(result.flow).toEqual(input);
      expect(result.partGraph?.nodes.map((node) => node.definitionId)).toEqual(["builtin.control.start", "builtin.data.constant", "builtin.control.end"]);
      expect(result.partGraph?.edges.map((edge) => [edge.sourceNodeId, edge.sourcePortId])).toEqual([["start", "next"], [`node.runtime-patch.${RUN}.part-subflow.search.step-1`, "success"]]);
      expect(part).toEqual(original);
    });

    it.each([
      ["a node inside a handler's body", { kind: "node", nodeId: "handler.notice.step" }, "unit_not_a_node:handler.notice.step"],
      ["a node that is not a handler, as a handler", { kind: "handler", nodeId: "read" }, "unit_not_a_handler:read"],
      ["a part whose graph was not given", { kind: "part", subflowId: "subflow.absent" }, "part_graph_absent:subflow.absent"]
    ] as const)("is refused for %s", (_label, unit, reason) => {
      const steps = [{ definitionId: "builtin.data.constant" }];
      const handler = { event: "fail" as const, scope: { kind: "subflow" as const }, when: [], steps, then: { kind: "give_up" as const } };
      expect(overlay({ kind: "replace_unit", reason: "r", unit, ...(unit.kind === "handler" ? { handler } : { steps }) })).toMatchObject({ applied: false, reason });
    });

    it("refuses a failure route into a handler's body", () => {
      expect(overlay({ kind: "replace_unit", reason: "r", unit: { kind: "node", nodeId: "read" }, steps: [{ definitionId: "builtin.data.constant" }], failedEdgeTo: "handler.notice.step" }))
        .toMatchObject({ applied: false, reason: "failed_edge_target_invalid:handler.notice.step" });
    });
  });

  describe("the unit digest guard", () => {
    it("splits a graph into handler units and node units", () => {
      const units = automationStudioGraphUnits(flow());

      expect([...units.members.entries()]).toEqual([
        ["handler:handler.notice", ["handler.notice", "handler.notice.step", "handler.notice.end"]],
        ["node:open", ["open"]],
        ["node:read", ["read"]],
        ["node:end", ["end"]]
      ]);
    });

    it("refuses a change to a unit other than the one named, and allows the named one and layout", () => {
      const before = flow();
      const touchedSecond = structuredClone(before);
      touchedSecond.nodes.find((node) => node.id === "read")!.parameterValues = { value: "changed" };
      touchedSecond.nodes.find((node) => node.id === "open")!.parameterValues = { value: "also changed" };
      const rewiredHandler = structuredClone(before);
      rewiredHandler.edges.find((edge) => edge.id === "handler.done")!.targetNodeId = "end";
      const moved = structuredClone(before);
      moved.nodes.find((node) => node.id === "open")!.position = { x: 999, y: 999 };

      expect(automationStudioUnitDigestRefusal({ before, after: touchedSecond, unit: "node:read" })).toBe("node:open");
      expect(automationStudioUnitDigestRefusal({ before, after: rewiredHandler, unit: "node:read" })).toBe("handler:handler.notice");
      expect(automationStudioUnitDigestRefusal({ before, after: moved, unit: "node:read" })).toBeUndefined();
      expect(automationStudioUnitDigestRefusal({ before, after: touchedSecond, unit: "node:open" })).toBe("node:read");
    });
  });

  describe("the kinds that came before", () => {
    it("applies a wait, a target override, a reroute and an insert as the trial always did", () => {
      const waited = overlay({ kind: "temporary_wait_retry", targetNodeId: "read", timeoutMs: 5_000, retryCount: 2, reason: "Slow." });
      const rerouted = overlay({ kind: "temporary_reroute", fromNodeId: "open", toNodeId: "end", reason: "Skip." });
      const insert = { kind: "temporary_action_sequence" as const, targetNodeId: "read", steps: [{ definitionId: "builtin.data.constant" }], reason: "Missing step." };
      const inserted = overlay(insert);
      const direct = applyAutomationStudioInsertedSteps(flow(), insert, RUN);

      expect(waited.applied && waited.flow.nodes.find((node) => node.id === "read")?.parameterValues).toEqual({ value: "read", timeoutMs: 5_000, retryCount: 2 });
      expect(waited.applied && waited.changedUnit).toEqual({ kind: "node", nodeId: "read" });
      expect(rerouted.applied && rerouted.flow.edges.at(-1)).toEqual({ id: "runtime-patch.open.end", sourceNodeId: "open", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" });
      expect(inserted.applied && direct.applied && inserted.flow).toEqual(direct.applied ? direct.flow : undefined);
      expect(inserted.applied && inserted.changedUnit).toEqual({ kind: "node", nodeId: "read" });
    });

    it("refuses what it always refused, with the same reasons", () => {
      expect(overlay({ kind: "temporary_recovery_subflow_call", subflowId: "subflow.recovery", reason: "r" })).toMatchObject({ applied: false, reason: "unapplied_patch_kind:temporary_recovery_subflow_call" });
      expect(overlay({ kind: "temporary_wait_retry", targetNodeId: "absent", reason: "r" })).toMatchObject({ applied: false, reason: "target_node_absent:absent" });
      expect(overlay({ kind: "temporary_reroute", fromNodeId: "open", toNodeId: "absent", reason: "r" })).toMatchObject({ applied: false, reason: "reroute_node_absent:open->absent" });
    });
  });
});
