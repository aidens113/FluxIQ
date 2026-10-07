import { expect, it } from "vitest";
import { buildAutomationStudioFlowFromConversation } from "../build.ts";
import type { AutomationStudioConversationCommandContext } from "../command.ts";

it("renders an unexpected candidate as a saved unverified draft without issuing an apply call", async () => {
  const calls: string[] = [];
  const context = { projectId: "project", sessionId: "session", port: { call: async (endpoint: string) => { calls.push(endpoint); return { ok: true, payload: { candidate: { status: "draft", candidateId: "candidate", verification: "not_performed", promotionAllowed: false } } }; } } } as unknown as AutomationStudioConversationCommandContext;
  expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: false, kept: false });
  expect(calls).toEqual(["generate-flow-bootstrap-adaptation"]);
});

it.each(["draft", "applied", undefined])("refuses unexpected adaptation status %s despite an adaptation id", async (status) => {
  const context = { projectId: "project", sessionId: "session", port: { call: async () => ({ ok: true, payload: { adaptation: { status, adaptationId: "adaptation" } } }) } } as unknown as AutomationStudioConversationCommandContext;
  expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: false });
});

it("requests a candidate and treats the saved draft as successful authoring", async () => {
  const request: Record<string, unknown>[] = [];
  const candidate = { status: "draft", projectId: "project", flowId: "flow", candidateId: "candidate", revision: 1, digest: "a".repeat(64), sourceInstructionIds: ["instruction"], baseDependencyDigest: "base", baseSettingsRevision: 0, verification: "not_performed", promotionAllowed: false, accounting: { requestId: "request", estimatedInputTokens: 1 } };
  const context = { projectId: "project", sessionId: "session", port: { call: async (_endpoint: string, payload: Record<string, unknown>) => { request.push(payload); return { ok: true, payload: { candidate } }; } } } as unknown as AutomationStudioConversationCommandContext;
  expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: true, status: "draft", candidate: { candidateId: "candidate", verification: "not_performed" } });
  expect(request).toEqual([expect.objectContaining({ evidenceGuided: true, authoringMode: "candidate", authSessionId: "session" })]);
});
