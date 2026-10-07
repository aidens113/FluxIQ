import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAutomationStudioFlowFromConversation } from "../build.ts";
import type { AutomationStudioConversationCommandContext } from "../command.ts";

const CANDIDATE = { status: "draft", projectId: "project", flowId: "flow", candidateId: "candidate", revision: 1, digest: "a".repeat(64), sourceInstructionIds: ["instruction"], baseDependencyDigest: "base", baseSettingsRevision: 0, verification: "not_performed", promotionAllowed: false, accounting: { requestId: "request", estimatedInputTokens: 1 } };

function recording(answer: unknown) {
  const requests: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const context = { projectId: "project", sessionId: "session", port: { call: async (endpoint: string, payload: Record<string, unknown>) => { requests.push({ endpoint, payload }); return answer; } } } as unknown as AutomationStudioConversationCommandContext;
  return { requests, context };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("legacy authoring mode (the default)", () => {
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", ""); });

  it("asks for a proposed adaptation and answers with it", async () => {
    const { requests, context } = recording({ ok: true, payload: { adaptation: { status: "proposed", adaptationId: "adaptation" } } });
    expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toEqual({ ok: true, status: "proposed", adaptationId: "adaptation", awaitingPermission: false });
    expect(requests).toEqual([{ endpoint: "generate-flow-bootstrap-adaptation", payload: { projectId: "project", flowId: "flow", authSessionId: "session", evidenceGuided: true } }]);
  });

  it("renders an unexpected candidate as a saved unverified draft without issuing an apply call", async () => {
    const { requests, context } = recording({ ok: true, payload: { candidate: { status: "draft", candidateId: "candidate", verification: "not_performed", promotionAllowed: false } } });
    expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: false, kept: true, ending: expect.stringContaining("independent execution and verification") });
    expect(requests.map((request) => request.endpoint)).toEqual(["generate-flow-bootstrap-adaptation"]);
  });

  it.each(["draft", "applied", undefined])("refuses unexpected adaptation status %s despite an adaptation id", async (status) => {
    const { context } = recording({ ok: true, payload: { adaptation: { status, adaptationId: "adaptation" } } });
    expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: false });
  });
});

describe("candidate authoring mode", () => {
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "candidate"); });

  it("refuses an answer that is not a valid candidate for this Flow", async () => {
    const { requests, context } = recording({ ok: true, payload: { candidate: { status: "draft", candidateId: "candidate", verification: "not_performed", promotionAllowed: false } } });
    expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: false, kept: false });
    expect(requests.map((request) => request.endpoint)).toEqual(["generate-flow-bootstrap-adaptation"]);
    const proposal = recording({ ok: true, payload: { adaptation: { status: "proposed", adaptationId: "adaptation" } } });
    expect(await buildAutomationStudioFlowFromConversation(proposal.context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: false, kept: false });
  });

  it("requests a candidate and treats the saved draft as successful authoring", async () => {
    const { requests, context } = recording({ ok: true, payload: { candidate: CANDIDATE } });
    expect(await buildAutomationStudioFlowFromConversation(context, { flowId: "flow", mode: "create" })).toMatchObject({ ok: true, status: "draft", candidate: { candidateId: "candidate", verification: "not_performed" } });
    expect(requests.map((request) => request.payload)).toEqual([expect.objectContaining({ evidenceGuided: true, authoringMode: "candidate", authSessionId: "session" })]);
  });
});
