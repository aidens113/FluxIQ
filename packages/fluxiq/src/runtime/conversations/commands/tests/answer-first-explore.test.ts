// `flow.explore` in answer-first mode (t869): the same few lines as create-here (`./answer-first-create-here.test.ts`).
// It asks for Core's configured mode, and an attempt's answer is told in the same words. It applies nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../create-here.ts";
import { AUTOMATION_STUDIO_CONVERSATION_EXPLORE } from "../explore.ts";

const attempt = (status: "achieved" | "budget_out" | "stopped_by_person") => ({
  taskId: "task.1", attemptId: "attempt.1", ordinal: 1, projectId: "project.1", flowId: "flow.1", path: "explore", status,
  spend: { calls: 3, inputTokens: 10, outputTokens: 5, usd: 0.01, ms: 100 }, budget: { usd: 5 }, liveSteps: 2, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1, endedAtMs: 2
});

function contextFor(answer: AutomationStudioConversationCommandCallResult) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const port: AutomationStudioConversationCommandContext["port"] = {
    async call(endpoint, payload) {
      calls.push({ endpoint, payload });
      if (endpoint === "create-flow") return { ok: true, payload: { flow: { flowId: "flow.1" } } };
      if (endpoint === "save-flow-generation-instruction") return { ok: true };
      return answer;
    }
  };
  const host: AutomationStudioConversationCommandContext["host"] = {
    async appendAutomationTurn() { throw new Error("The thread is not used here."); },
    async pendingAsks() { return []; },
    async getAsk() { return null; }
  };
  const context: AutomationStudioConversationCommandContext = { port, host, projectId: "project.1", conversationId: "conversation.1", sessionId: "session.person", keyLocked: false, paired: false, startLocation: "https://library.example/account" };
  return { context, calls };
}

describe("flow.explore in answer-first mode", () => {
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("asks for Core's configured mode for the Flow named, from the page on screen, naming its thread", async () => {
    const { context, calls } = contextFor({ ok: true, payload: { answered: { attempt: attempt("achieved") } } });
    await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: "flow.1" });
    expect(calls.find((call) => call.endpoint === "generate-flow-bootstrap-adaptation")?.payload).toMatchObject({ projectId: "project.1", flowId: "flow.1", conversationId: "conversation.1", authoringMode: "configured", evidenceGuided: true, startLocation: "https://library.example/account" });
  });

  it("says each ending in create-here's words, none as a failure, and applies nothing", async () => {
    for (const status of ["achieved", "budget_out", "stopped_by_person"] as const) {
      const answer = { ok: true, payload: { answered: { attempt: attempt(status) } } };
      const { context, calls } = contextFor(answer);
      const explored = await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: "flow.1" });
      const created = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(contextFor(answer).context, { instruction: "List my loans", name: "Loans" });
      expect(explored.status).toBe("done");
      expect(explored.summary).toBe(created.summary);
      expect(explored.flowId).toBe("flow.1");
      expect(calls.map((call) => call.endpoint)).not.toContain("review-flow-adaptation");
    }
  });

  it("carries what the attempt answered", async () => {
    const { context } = contextFor({ ok: true, payload: { answered: { attempt: attempt("budget_out"), candidateId: "candidate.1" } } });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: "flow.1" });
    expect(outcome.answered).toMatchObject({ attempt: { attemptId: "attempt.1", status: "budget_out" }, candidateId: "candidate.1" });
  });

  it("says where the result is when the thread could not be noted, and that it is no failure", async () => {
    const { context } = contextFor({ ok: true, payload: { answered: { attempt: attempt("achieved") }, threadNotNoted: true } });
    await expect(AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: "flow.1" })).resolves.toMatchObject({ status: "done", summary: "I got what you asked for, and it was checked once against what you asked. I could not tie this to this chat, so the result may not show here. It is kept with the Flow." });
  });

  it("says a setup step in Core's words, as no failure", async () => {
    const { context } = contextFor({ ok: true, payload: { setupNeeded: { status: "setup_needed", say: "Add a model key in settings." } } });
    await expect(AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: "flow.1" })).resolves.toMatchObject({ status: "done", summary: "Add a model key in settings." });
  });

  it("reads a record the contract refuses as a call that failed, and never guesses", async () => {
    const { context } = contextFor({ ok: true, payload: { answered: { attempt: { ...attempt("achieved"), status: "failed" } } } });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: "flow.1" });
    expect(outcome.status).toBe("failed");
    expect(outcome.answered).toBeUndefined();
  });

  it("promises the result, as create-here does, and says nothing of a test run", () => {
    const view = { args: {}, flowName: "Loans", place: "this page" };
    expect(AUTOMATION_STUDIO_CONVERSATION_EXPLORE.announce?.(view)).toBe(AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.announce?.(view));
    expect(AUTOMATION_STUDIO_CONVERSATION_EXPLORE.capability.summary).toBe(AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability.summary);
    expect(AUTOMATION_STUDIO_CONVERSATION_EXPLORE.capability.summary).not.toMatch(/test-run/u);
  });

  it("stays a candidate build in another mode", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "candidate");
    const { context, calls } = contextFor({ ok: false, error: "No." });
    await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: "flow.1" });
    expect(calls[0]?.payload.authoringMode).toBe("candidate");
    expect(calls[0]?.payload.conversationId).toBeUndefined();
  });
});
