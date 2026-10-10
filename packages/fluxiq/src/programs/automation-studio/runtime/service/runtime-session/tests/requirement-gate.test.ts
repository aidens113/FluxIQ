import { describe, expect, it } from "vitest";
import type { FluxIQRuntimeClient } from "../../../../../../runtime/index.ts";
import {
  AUTOMATION_STUDIO_EXECUTOR_GRANTED_REQUIREMENTS,
  AUTOMATION_STUDIO_REQUIREMENT_IDS,
  AutomationStudioRunRequirementError,
  assertAutomationStudioRunRequirements,
  automationStudioDeclaredRequirements
} from "../requirement-gate.ts";

const ids = AUTOMATION_STUDIO_REQUIREMENT_IDS;

function client(capabilityIds: string[], fields: Partial<FluxIQRuntimeClient> = {}): FluxIQRuntimeClient {
  return { clientId: "synthetic.client", label: "Synthetic Client", transport: "websocket", status: "ready", capabilities: capabilityIds.map((id) => ({ id, kind: "custom" as const })), ...fields };
}

function runtime(...clients: FluxIQRuntimeClient[]) {
  let reads = 0;
  return { clients: () => { reads += 1; return clients; }, reads: () => reads };
}

function refusal(run: () => void): AutomationStudioRunRequirementError {
  try { run(); } catch (error) { if (error instanceof AutomationStudioRunRequirementError) return error; throw error; }
  throw new Error("expected the run to be refused");
}

describe("the run requirement gate", () => {
  it("lets a run through when the executor and the ready client grant every declared id", () => {
    const service = runtime(client([ids.webFacts, ids.webActionsReconcile]));
    expect(() => assertAutomationStudioRunRequirements({
      flows: [{ metadata: { requires: [ids.webFacts, ids.flowHandlers] } }, { metadata: { requires: [ids.webActionsReconcile] } }],
      graphOptions: {}, runtimeService: service, executorGranted: [ids.flowHandlers]
    })).not.toThrow();
  });

  it("refuses a run whose connected client lacks a host capability, naming it plainly", () => {
    const error = refusal(() => assertAutomationStudioRunRequirements({
      flows: [{ metadata: { requires: [ids.webFacts] } }],
      graphOptions: {}, runtimeService: runtime(client([ids.webActionsReconcile]))
    }));
    expect(error.code).toBe("run.requirement_missing");
    expect(error.missing).toEqual({ id: ids.webFacts, side: "host", plainName: "page facts" });
    expect(error.message).toBe("This automation needs page facts, which Synthetic Client doesn't offer yet. Update Synthetic Client and run it again.");
  });

  it("refuses a host requirement when no ready client of the run's domain is connected", () => {
    const error = refusal(() => assertAutomationStudioRunRequirements({
      flows: [{ metadata: { requires: [ids.webFacts] } }],
      graphOptions: {}, domainId: "domain.synthetic",
      runtimeService: runtime(client([ids.webFacts], { status: "pairing_required" }), client([ids.webFacts], { domainId: "domain.other" }))
    }));
    expect(error.message).toContain("no connected client offers it");
  });

  it("refuses a run that needs an executor id this executor does not grant", () => {
    const error = refusal(() => assertAutomationStudioRunRequirements({
      flows: [{ metadata: {} }, { metadata: { requires: [ids.flowSubflowCalls] } }],
      graphOptions: { runtimeCapabilities: ["policy-output", "io"] }, runtimeService: runtime(client([ids.flowSubflowCalls])), executorGranted: []
    }));
    expect(error.missing).toEqual({ id: ids.flowSubflowCalls, side: "executor", plainName: "calls to reusable parts" });
    expect(error.message).toContain("which this version of FluxIQ doesn't offer yet");
  });

  it("grants calls to reusable parts by default, since this executor runs Call Subflow", () => {
    expect(AUTOMATION_STUDIO_EXECUTOR_GRANTED_REQUIREMENTS).toContain(ids.flowSubflowCalls);
    expect(() => assertAutomationStudioRunRequirements({
      flows: [{ metadata: { requires: [ids.flowSubflowCalls] } }],
      graphOptions: {}, runtimeService: runtime()
    })).not.toThrow();
  });

  it("grants situation handlers by default, since this executor dispatches them", () => {
    expect(AUTOMATION_STUDIO_EXECUTOR_GRANTED_REQUIREMENTS).toContain(ids.flowHandlers);
    expect(() => assertAutomationStudioRunRequirements({
      flows: [{ metadata: { requires: [ids.flowHandlers, ids.flowSubflowCalls] } }],
      graphOptions: {}, runtimeService: runtime()
    })).not.toThrow();
  });

  it("grants an executor id the run's executor options carry", () => {
    expect(() => assertAutomationStudioRunRequirements({
      flows: [{ metadata: { requires: [ids.flowHandlers] } }],
      graphOptions: { runtimeCapabilities: [ids.flowHandlers] }, executorGranted: []
    })).not.toThrow();
  });

  it("runs a Flow without requires exactly as before, without reading any session", () => {
    const service = runtime();
    expect(() => assertAutomationStudioRunRequirements({ flows: [{}, { metadata: { title: "x" } }, undefined], graphOptions: {}, runtimeService: service })).not.toThrow();
    expect(service.reads()).toBe(0);
  });

  it("reads declared ids from every graph, deduplicated, ignoring what is not a string", () => {
    expect(automationStudioDeclaredRequirements([{ metadata: { requires: [ids.webFacts, " web.facts@1 ", 3, ""] } }, null, { metadata: { requires: "web.facts@1" } }, { metadata: { requires: [ids.flowHandlers] } }]))
      .toEqual([ids.webFacts, ids.flowHandlers]);
  });
});
