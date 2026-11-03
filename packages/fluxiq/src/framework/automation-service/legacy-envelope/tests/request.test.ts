import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../flows/authoring/model/index.ts";
import type { ExecutableGraph } from "../../../../flows/executable/graph/index.ts";
import { runAutomationStudioGraph } from "../../../../engine/automation/index.ts";
import { automationStudioHasFlowDocumentEnvelope, automationStudioLegacyGraphRequest } from "../index.ts";

const envelope: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.context", ownerKind: "routine", ownerId: "routine.existing", name: "Existing context", description: "Recorded context", nodes: [], edges: [], createdAt: 17, updatedAt: 33, metadata: { actualContext: "preserved" } };

describe("Studio execution request envelope", () => {
  it("retains the actual graph identity and all carried request/context fields", () => {
    const graph = { ...envelope, interface: { inputs: [], outputs: [] } };
    const request = { graph, subflowId: "part", framePath: ["root", "child"], attempts: ["existing-attempt"] };
    const adapted = automationStudioLegacyGraphRequest(request);
    expect(adapted?.graph).toBe(graph);
    expect(adapted).toEqual(request);
    expect(adapted?.graph.ownerId).toBe("routine.existing");
    expect(adapted?.graph.createdAt).toBe(17);
    expect(adapted?.graph.interface).toBe(graph.interface);
  });
  it("does not invent Studio context for a project-free graph", () => {
    const graph: ExecutableGraph = { flowId: "flow.neutral", nodes: [], edges: [] };
    expect(automationStudioLegacyGraphRequest({ graph })).toBeUndefined();
    expect(graph).toEqual({ flowId: "flow.neutral", nodes: [], edges: [] });
  });
  it("refuses incomplete or wrong envelope fields", () => {
    const { ownerId: _ownerId, ...missingOwner } = envelope;
    expect(automationStudioHasFlowDocumentEnvelope(missingOwner)).toBe(false);
    for (const malformed of [{ ...envelope, schemaVersion: "other" }, { ...envelope, ownerKind: "invented" }, { ...envelope, name: 1 }, { ...envelope, createdAt: "yesterday" }, { ...envelope, description: 1 }]) expect(automationStudioHasFlowDocumentEnvelope(malformed)).toBe(false);
  });
  it("lets the generic engine execute without a Studio envelope", async () => {
    const graph: ExecutableGraph = { flowId: "flow.neutral", nodes: [{ id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } }], edges: [] };
    const trace = await runAutomationStudioGraph(graph);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.nodeId).toBe("value");
    expect(automationStudioHasFlowDocumentEnvelope(graph)).toBe(false);
  });
  it("preserves the real Studio envelope when the engine requests a repair", async () => {
    const graph: AutomationStudioFlowDocument = { ...envelope, nodes: [{ id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.action" } }], edges: [] };
    let requested = false;
    const trace = await runAutomationStudioGraph(graph, {
      effectDispatcher: async () => ({ status: "failed", route: "failed", failure: { category: "unexpected_state", code: "synthetic.refused", retryable: false, stage: "execution", effect: "unacted" } }),
      repairIncident: async request => {
        requested = true;
        const adapted = automationStudioLegacyGraphRequest(request);
        expect(adapted?.graph).toBe(graph);
        expect(adapted?.graph).toMatchObject({ ownerId: "routine.existing", name: "Existing context", createdAt: 17, updatedAt: 33, metadata: { actualContext: "preserved" } });
        return { kind: "none", reason: "Context inspected" };
      }
    });
    expect(requested).toBe(true);
    expect(trace.status).toBe("failed");
  });
});
