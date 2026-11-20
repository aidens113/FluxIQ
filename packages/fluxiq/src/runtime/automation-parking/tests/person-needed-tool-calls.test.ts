import { expect, it } from "vitest";
import { automationStudioPersonNeededToolCalls } from "../index.ts";
import { automationStudioLlmEvidenceCurrentView } from "../../llm/decision-context/index.ts";

it("a cleared check updates the declared current view with the fresh look, preserving independent row views", async () => {
  const page = "The sorted catalogue: item handle t99";
  const parking = automationStudioPersonNeededToolCalls({
    stage: "authoring", subject: "attempt", newAskId: () => "ask.one",
    tools: [{ toolId: "catalogue.look", effect: "observe", description: "Look", inputSchema: { type: "object" }, initialObservation: { input: {} } }],
    ask: { port: { open: () => {}, awaitAnswer: async (ask) => ({ askId: ask.askId, answeredAt: 1, kind: "choice", value: "person_done", actorId: "person" }) } },
    executeTool: async (call) => call.toolId === "catalogue.look"
      ? { kind: "llm_evidence_tool_execution", evidence: { page, location: "catalogue?sort=price" }, effectApplied: false }
      : { kind: "llm_evidence_tool_execution", evidence: { page: "Check" }, effectApplied: true, personNeeded: true }
  });
  const resolved = await parking.executeTool({ callId: "sort", toolId: "catalogue.sort", value: {} });
  expect(resolved).toMatchObject({ evidence: { personCompletedCheck: true, page } });
  if (resolved === null || typeof resolved !== "object" || Array.isArray(resolved) || resolved.kind !== "llm_evidence_tool_execution") throw new Error("No execution result");
  const view = automationStudioLlmEvidenceCurrentView([
    { callId: "earlier", toolId: "catalogue.look", value: { page: "Earlier page", read: { extracted: [{ title: "Held" }] } } },
    { callId: "sort", toolId: "catalogue.sort", value: resolved.evidence }
  ], ["page", "location", "read.extracted"]);
  expect(view.currentView?.value).toEqual({ groups: [
    { group: "top", callId: "sort", value: { page, location: "catalogue?sort=price" } },
    { group: "holder:read", holder: "read", callId: "earlier", value: { extracted: [{ title: "Held" }] } }
  ] });
  expect(JSON.stringify(view.currentView)).not.toContain("Earlier page");
});
