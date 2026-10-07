import { expect, it } from "vitest";
import { buildAutomationStudioFlowFromConversation } from "../build.ts";
import type { AutomationStudioConversationCommandContext } from "../command.ts";

it("renders an unexpected candidate as a saved unverified draft without issuing an apply call", async () => {
  const calls: string[] = [];
  const context = { projectId: "project", sessionId: "session", port: { call: async (endpoint: string) => { calls.push(endpoint); return { ok: true, payload: { candidate: { status: "draft", candidateId: "candidate", verification: "not_performed", promotionAllowed: false } } }; } } } as unknown as AutomationStudioConversationCommandContext;
  expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: false, kept: true, ending: expect.stringContaining("independent execution and verification") });
  expect(calls).toEqual(["generate-flow-bootstrap-adaptation"]);
});

it.each(["draft", "applied", undefined])("refuses unexpected adaptation status %s despite an adaptation id", async (status) => {
  const context = { projectId: "project", sessionId: "session", port: { call: async () => ({ ok: true, payload: { adaptation: { status, adaptationId: "adaptation" } } }) } } as unknown as AutomationStudioConversationCommandContext;
  expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: false });
});
