import { expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../../framework/automation-service/panel-capabilities/index.ts";
import { interpretAutomationStudioConversationTurn } from "../interpret.ts";
import { readAutomationStudioFlowBootstrapGenerationRequest } from "../../../../framework/automation-service/service/flow-bootstrap-commands/generation/request.ts";

const context = { projectId: "project", flows: [], onScreen: {}, capabilities: parseAutomationStudioPanelCapabilities([{ id: "flow.createHere", title: "Create here", summary: "Create the requested Flow.", group: "Flows", phrases: ["create"], consequences: [], arguments: [] }]) };
it("declares data in the existing one interpretation call, including a missing response without bypass", async () => {
  for (const extra of [{ process: { where: [{ field: "Role", contains: "apprentice" }], columns: ["Name", "Role", "Branch"] } }, { process: null }, {}]) {
    let calls = 0;
    const interpretation = await interpretAutomationStudioConversationTurn({ model: { name: "script", decide: async () => { calls += 1; return { intent: "task", do: "flow.createHere", with: {}, acts: [], ...extra }; } }, message: "List the apprentices.", transcript: [], transcriptWithheld: false, context });
    expect(calls).toBe(1);
    expect(interpretation.decision.kind).toBe("invoke");
    expect(interpretation.taskProcessing).toEqual("process" in extra ? extra.process === null ? null : { process: extra.process } : {});
  }
});

it("forwards only the strict direct-API envelope and keeps all three explicit states", () => {
  const request = { projectId: "project", flowId: "flow", caller: { actorUserId: "person", actorSessionId: "session" }, evidenceGuided: true, authoringMode: "answer-first" };
  for (const taskProcessing of [null, {}, { process: {} }, { process: { columns: ["name"] } }]) expect(readAutomationStudioFlowBootstrapGenerationRequest({ ...request, taskProcessing }).taskProcessing).toEqual(taskProcessing);
  for (const taskProcessing of [false, [], { process: {}, source: "model" }, { process: Number.NaN }]) expect(() => readAutomationStudioFlowBootstrapGenerationRequest({ ...request, taskProcessing })).toThrow("task processing is invalid");
});
