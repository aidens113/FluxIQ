// `run.execute` on a task's Flow in answer-first mode (t885): the task asked for again, started as
// explore starts one on the Flow's saved goal, from where the task starts, and told in create-here's
// words. A Flow no task lives under, any other mode, and a lookup that fails all run the Flow as before.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_EXPLORE } from "../explore.ts";
import { AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW } from "../run-flow.ts";

const attempt = {
  taskId: "task.1", attemptId: "attempt.2", ordinal: 2, projectId: "project.1", flowId: "flow.1", path: "run_flow", status: "achieved",
  spend: { calls: 1, inputTokens: 10, outputTokens: 5, usd: 0.01, ms: 100 }, budget: { usd: 5 }, liveSteps: 0, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1, endedAtMs: 2
};
const ANSWERED: AutomationStudioConversationCommandCallResult = { ok: true, payload: { answered: { attempt } } };
const TASK_PAGE = "https://library.example/account";

function contextFor(known: AutomationStudioConversationCommandCallResult | Error, generated: AutomationStudioConversationCommandCallResult = ANSWERED, extra: Partial<AutomationStudioConversationCommandContext> = {}) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const port: AutomationStudioConversationCommandContext["port"] = {
    async call(endpoint, payload) {
      calls.push({ endpoint, payload });
      if (endpoint === "get-task-known-flow") {
        if (known instanceof Error) throw known;
        return known;
      }
      if (endpoint === "generate-flow-bootstrap-adaptation") return generated;
      if (endpoint === "run-runtime-session") return { ok: true, payload: { runtimeSession: { runId: "run.1", status: "succeeded" }, terminalReason: "succeeded" } };
      if (endpoint === "get-flow") return { ok: true, payload: { flow: { flowId: "flow.1", name: "Loans" } } };
      return { ok: false, error: `No fake for ${endpoint}.` };
    }
  };
  const host: AutomationStudioConversationCommandContext["host"] = {
    async appendAutomationTurn() { throw new Error("The thread is not used here."); },
    async pendingAsks() { return []; },
    async getAsk() { return null; }
  };
  const context: AutomationStudioConversationCommandContext = { port, host, projectId: "project.1", conversationId: "conversation.1", sessionId: "session.person", keyLocked: false, paired: false, startLocation: "https://elsewhere.example/news", ...extra };
  return { context, calls };
}

const endpoints = (calls: Array<{ endpoint: string }>) => calls.map((call) => call.endpoint);

describe("run.execute on a task's Flow in answer-first mode", () => {
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("asks for one attempt on the Flow, from where the task starts, and never runs it on the project path", async () => {
    const { context, calls } = contextFor({ ok: true, payload: { flowId: "flow.1", startLocation: TASK_PAGE } });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.1" });
    expect(calls[0]).toEqual({ endpoint: "get-task-known-flow", payload: { projectId: "project.1", flowId: "flow.1" } });
    expect(calls.find((call) => call.endpoint === "generate-flow-bootstrap-adaptation")?.payload).toMatchObject({ projectId: "project.1", flowId: "flow.1", conversationId: "conversation.1", authoringMode: "configured", evidenceGuided: true, startLocation: TASK_PAGE });
    expect(endpoints(calls)).not.toContain("run-runtime-session");
    expect(outcome).toMatchObject({ status: "done", flowId: "flow.1", answered: { attempt: { attemptId: "attempt.2", status: "achieved" } } });
  });

  it("tells each ending in the words explore uses for the same answer", async () => {
    const ran = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(contextFor({ ok: true, payload: { flowId: "flow.1" } }).context, { flowId: "flow.1" });
    const explored = await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(contextFor({ ok: true, payload: {} }).context, { flowId: "flow.1" });
    expect(ran.summary).toBe(explored.summary);
  });

  it("starts from the page on screen where the task kept no start place", async () => {
    const { context, calls } = contextFor({ ok: true, payload: { flowId: "flow.1" } });
    await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.1" });
    expect(calls.find((call) => call.endpoint === "generate-flow-bootstrap-adaptation")?.payload).toMatchObject({ startLocation: "https://elsewhere.example/news" });
  });

  it("says the key's setup step and starts nothing when the key cannot be opened", async () => {
    let told = 0;
    const { context, calls } = contextFor({ ok: true, payload: { flowId: "flow.1" } }, ANSWERED, { keyNeedsUnlock: true, keyLockReason: "first_unlock", noteKeySetupStepTold: () => { told += 1; } });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.1" });
    expect(outcome.status).toBe("done");
    expect(outcome.summary).toContain("Nothing has started and nothing was spent.");
    expect(told).toBe(1);
    expect(endpoints(calls)).toEqual(["get-task-known-flow"]);
  });

  it("fails only where the attempt's call did, never on the project path", async () => {
    const { context, calls } = contextFor({ ok: true, payload: { flowId: "flow.1" } }, { ok: false, error: "The model went away." });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.1" });
    expect(outcome.status).toBe("failed");
    expect(endpoints(calls)).not.toContain("run-runtime-session");
  });

  it("runs a Flow no task lives under, or one the lookup could not answer for, as any other Flow", async () => {
    for (const known of [{ ok: true, payload: {} }, { ok: true, payload: { flowId: "flow.other" } }, { ok: false, error: "no" }, new Error("gone")]) {
      const { context, calls } = contextFor(known);
      const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.1" });
      expect(endpoints(calls)).toContain("run-runtime-session");
      expect(endpoints(calls)).not.toContain("generate-flow-bootstrap-adaptation");
      expect(outcome.status).toBe("done");
    }
  });
});

describe("run.execute outside answer-first mode", () => {
  it("never asks whether a task lives under the Flow", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "project");
    try {
      const { context, calls } = contextFor({ ok: true, payload: { flowId: "flow.1" } });
      await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.1" });
      expect(endpoints(calls)).not.toContain("get-task-known-flow");
      expect(endpoints(calls)).toContain("run-runtime-session");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
