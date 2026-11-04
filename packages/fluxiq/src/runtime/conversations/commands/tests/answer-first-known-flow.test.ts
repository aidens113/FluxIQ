// `flow.createHere` reuses the Flow a task already lives under (t869): a repeat of the same task makes no
// blank Flow, another task does, and the other authoring modes never ask.

import { afterEach, describe, expect, it, vi } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import type { AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../create-here.ts";

const attempt = {
  taskId: "task.1", attemptId: "attempt.1", ordinal: 1, projectId: "project.1", flowId: "flow.1", path: "explore", status: "achieved",
  spend: { calls: 3, inputTokens: 10, outputTokens: 5, usd: 0.01, ms: 100 }, budget: { usd: 5 }, liveSteps: 2, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1, endedAtMs: 2
};

/** A Core that makes a new Flow on each `create-flow` and knows a task by its words once it has made a Flow for them. */
function core(options: { knownFails?: boolean } = {}) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const made: string[] = [];
  const flowOf = new Map<string, string>();
  let asked = "";
  const port: AutomationStudioConversationCommandContext["port"] = {
    async call(endpoint, payload) {
      calls.push({ endpoint, payload });
      if (endpoint === "get-task-known-flow") {
        if (options.knownFails) return { ok: false, error: "Core could not read it." };
        const flowId = flowOf.get(String(payload.instructionText));
        return { ok: true, payload: flowId === undefined ? {} : { flowId } };
      }
      if (endpoint === "create-flow") {
        const flowId = `flow.${made.length + 1}`;
        made.push(flowId);
        return { ok: true, payload: { flow: { flowId } } };
      }
      if (endpoint === "save-flow-generation-instruction") return { ok: true };
      return { ok: true, payload: { answered: { status: "answered", attempt: { ...attempt, flowId: String(payload.flowId) } } } };
    }
  };
  const host: AutomationStudioConversationCommandContext["host"] = {
    async appendAutomationTurn() { throw new Error("The thread is not used here."); },
    async pendingAsks() { return []; },
    async getAsk() { return null; }
  };
  const context: AutomationStudioConversationCommandContext = { port, host, projectId: "project.1", conversationId: "conversation.1", sessionId: "session.person", keyLocked: false, paired: false, startLocation: "https://library.example/account" };
  const run = async (instruction: string) => {
    asked = instruction;
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(context, { instruction });
    // The attempt saved its Flow under the task, as the answer-first attempt does.
    const generated = calls.filter((call) => call.endpoint === "generate-flow-bootstrap-adaptation").at(-1);
    flowOf.set(asked, String(generated?.payload.flowId));
    return outcome;
  };
  return { calls, made, run };
}

const creations = (calls: Array<{ endpoint: string }>) => calls.filter((call) => call.endpoint === "create-flow").length;

describe("flow.createHere and a task it has done before", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("makes no new Flow for the second create-here of the same task, and builds on the first one", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first");
    const { calls, made, run } = core();
    await run("List my loans");
    const second = await run("List my loans");
    expect(made).toEqual(["flow.1"]);
    expect(creations(calls)).toBe(1);
    expect(second).toMatchObject({ status: "done", flowId: "flow.1" });
    const generated = calls.filter((call) => call.endpoint === "generate-flow-bootstrap-adaptation");
    expect(generated.map((call) => call.payload.flowId)).toEqual(["flow.1", "flow.1"]);
    // The task's own words and site are what the lookup was asked with.
    expect(calls.find((call) => call.endpoint === "get-task-known-flow")?.payload).toEqual({ projectId: "project.1", instructionText: "List my loans", startLocation: "https://library.example/account" });
  });

  it("makes a new Flow for a different task", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first");
    const { calls, made, run } = core();
    await run("List my loans");
    await run("List my holds");
    expect(made).toEqual(["flow.1", "flow.2"]);
    expect(creations(calls)).toBe(2);
  });

  it("makes a new Flow, and does not fail the task, when Core cannot say which Flow a task has", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first");
    const { calls, run } = core({ knownFails: true });
    await expect(run("List my loans")).resolves.toMatchObject({ status: "done" });
    expect(creations(calls)).toBe(1);
  });

  it("leaves the other modes alone: they never ask, and make a Flow each time", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "candidate");
    const { calls, made, run } = core();
    await run("List my loans").catch(() => undefined);
    await run("List my loans").catch(() => undefined);
    expect(calls.map((call) => call.endpoint)).not.toContain("get-task-known-flow");
    expect(made).toEqual(["flow.1", "flow.2"]);
  });
});
