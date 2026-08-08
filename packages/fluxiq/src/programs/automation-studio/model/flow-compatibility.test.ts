import { describe, expect, it } from "vitest";
import {
  adaptLegacyTaskToAutomationStudioFlow,
  createBlankAutomationStudioFlow,
  createBlankAutomationStudioFlowArtifact,
  resolveAutomationStudioFlowCatalog,
  type AutomationStudioProjectArtifacts,
  type AutomationStudioRoutineArtifact,
  type AutomationStudioTaskArtifact
} from "./index.ts";

describe("legacy Task/Routine Flow compatibility", () => {
  it("adapts a task into a read-only migrated Flow with recordings and graph provenance", () => {
    const task: AutomationStudioTaskArtifact = {
      schemaVersion: "0.1",
      taskId: "task.checkout",
      name: "Checkout",
      graphId: "flow.checkout",
      signalRegistryId: "signals.checkout",
      recordingIds: ["recording.1"],
      createdAt: 10,
      updatedAt: 20,
      metadata: { source: "legacy" }
    };
    const sourceFlow = createBlankAutomationStudioFlow({
      flowId: "flow.checkout",
      ownerKind: "task",
      ownerId: task.taskId,
      name: task.name,
      now: 15,
      metadata: { policyId: "policy.checkout" }
    });
    sourceFlow.nodes.push({ id: "submit", definitionId: "builtin.policy.action", metadata: { marker: "source" } });

    const adapted = adaptLegacyTaskToAutomationStudioFlow({
      projectId: "project.checkout",
      scope: { kind: "domain", domainId: "shop" },
      task,
      sourceFlow
    });

    expect(adapted).toMatchObject({
      flowId: "legacy.task.task.checkout",
      projectId: "project.checkout",
      scope: { kind: "domain", domainId: "shop" },
      origin: "migrated",
      visibility: "private",
      legacyProvenance: { kind: "task", artifactId: "task.checkout", flowId: "flow.checkout" },
      evidenceReferences: [{ layer: "raw_recording", artifactId: "recording.1" }],
      metadata: { legacy: true, legacyKind: "task", signalRegistryId: "signals.checkout" }
    });
    expect(adapted.updatedAt).toBe(20);
    adapted.nodes[0]!.metadata!.marker = "changed";
    expect(sourceFlow.nodes[0]!.metadata!.marker).toBe("source");
  });

  it("resolves canonical and legacy artifacts into unique, read-only catalog entries", () => {
    const task: AutomationStudioTaskArtifact = {
      schemaVersion: "0.1", taskId: "task.orders", name: "Orders", recordingIds: [], createdAt: 1, updatedAt: 2
    };
    const routine: AutomationStudioRoutineArtifact = {
      schemaVersion: "0.1", routineId: "routine.orders", name: "Order routine", flowId: "flow.routine.orders", taskIds: [task.taskId], createdAt: 3, updatedAt: 4
    };
    const artifacts: AutomationStudioProjectArtifacts = {
      tasks: [task],
      routines: [routine],
      configs: [],
      flows: [createBlankAutomationStudioFlow({ flowId: "flow.routine.orders", ownerKind: "routine", ownerId: routine.routineId, name: routine.name, now: 3 })]
    };
    const canonical = createBlankAutomationStudioFlowArtifact({ flowId: "legacy.task.task.orders", projectId: "project.orders", name: "New orders", now: 5 });

    const entries = resolveAutomationStudioFlowCatalog({
      projectId: "project.orders",
      scope: { kind: "global" },
      canonicalFlows: [canonical, createBlankAutomationStudioFlowArtifact({ flowId: "other.project", projectId: "other", name: "Other", now: 5 })],
      legacyArtifacts: artifacts
    });

    expect(entries.map((entry) => [entry.flow.flowId, entry.source, entry.readOnly])).toEqual([
      ["legacy.task.task.orders", "canonical", false],
      ["legacy.task.task.orders.2", "legacy_task", true],
      ["legacy.routine.routine.orders", "legacy_routine", true]
    ]);
    expect(entries[2]!.flow).toMatchObject({ nodes: [], legacyProvenance: { flowId: "flow.routine.orders" } });
  });
});
