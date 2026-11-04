// `flow.createHere` in answer-first mode (t861): it asks Core for its configured mode, reads the
// attempt back through the contract, and says one plain line; the answer's own turn is the Answer
// lane's. A candidate build's request, for a caller that wants a Flow's steps in, is unchanged.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import { automationStudioConversationAnswerFirstAttempt, buildAutomationStudioFlowFromConversation } from "../build.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../create-here.ts";

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

describe("flow.createHere in answer-first mode", () => {
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("asks for Core's configured mode, and says one plain line of a result", async () => {
    const { context, calls } = contextFor({ ok: true, payload: { answered: { status: "answered", attempt: attempt("achieved") } } });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(context, { instruction: "List my loans", name: "Loans" });
    expect(calls.find((call) => call.endpoint === "generate-flow-bootstrap-adaptation")?.payload).toMatchObject({ authoringMode: "configured", evidenceGuided: true, startLocation: "https://library.example/account" });
    expect(outcome).toMatchObject({ status: "done", flowId: "flow.1" });
    expect(outcome.summary).toBe("I got what you asked for, and it was checked once against what you asked.");
    // Applying is for a change to a Flow, and this made none.
    expect(calls.map((call) => call.endpoint)).not.toContain("review-flow-adaptation");
  });

  it("says a budget-out and a person's Stop plainly, and neither as a failure", async () => {
    for (const [status, words] of [["budget_out", /budget for this ran out/u], ["stopped_by_person", /Stopped, as you asked/u]] as const) {
      const { context } = contextFor({ ok: true, payload: { answered: { status: "answered", attempt: attempt(status) } } });
      const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(context, { instruction: "List my loans", name: "Loans" });
      expect(outcome.status).toBe("done");
      expect(outcome.summary).toMatch(words);
    }
  });

  it("reads an attempt the contract refuses as a call that failed, and never guesses", async () => {
    const { context } = contextFor({ ok: true, payload: { answered: { status: "answered", attempt: { ...attempt("achieved"), status: "failed" } } } });
    await expect(automationStudioConversationAnswerFirstAttempt(context, { flowId: "flow.1" })).resolves.toMatchObject({ ok: false, cause: "the task's answer could not be read" });
  });

  it("tells the person what it will do in this mode's words, and nothing of a test run", () => {
    expect(AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability.summary).not.toMatch(/test-run/u);
    expect(AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.announce?.({ place: "this page" } as unknown as Parameters<NonNullable<typeof AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.announce>>[0])).toBe("I'll do this on this page and show you the result here. I'll save how I did it, so next time is quicker.");
  });

  it("says what a person must do before it can start, as a setup step and not a failure", async () => {
    const { context } = contextFor({ ok: true, payload: { setupNeeded: { status: "setup_needed", code: "flow_bootstrap.provider_resolver_unavailable", say: "Add a model key in settings." } } });
    await expect(automationStudioConversationAnswerFirstAttempt(context, { flowId: "flow.1" })).resolves.toEqual({ ok: true, status: "setup_needed", say: "Add a model key in settings." });
  });

  it("keeps a caller that wants a Flow's steps in on a candidate build", async () => {
    const { context, calls } = contextFor({ ok: false, error: "No." });
    await buildAutomationStudioFlowFromConversation(context, { flowId: "flow.1", mode: "create" });
    expect(calls[0]?.payload.authoringMode).toBe("candidate");
  });
});
