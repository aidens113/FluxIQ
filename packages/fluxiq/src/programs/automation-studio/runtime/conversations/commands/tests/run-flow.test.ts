// "Run it" from the chat: what the run asks for, and what the thread is told
// the run learned.
//
// The run asks for the model with `explore_and_adapt`, so a step that breaks
// can be repaired, and a paired client's run pays only for the result checks
// that judge a repair (MVP item 23), as the extension's own Run button does.
// A run that ended without failing and recorded changes says what it learned
// in plain words, from Core's closed change kinds only: never the model's
// diagnosis, page text or a selector.

import { describe, expect, it } from "vitest";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW } from "../run-flow.ts";

type Handler = (payload: Record<string, unknown>) => AutomationStudioConversationCommandCallResult;

function contextWith(handlers: Record<string, Handler>, extra: Partial<AutomationStudioConversationCommandContext> = {}) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const context: AutomationStudioConversationCommandContext = {
    port: {
      async call(endpoint, payload) {
        calls.push({ endpoint, payload });
        const handler = handlers[endpoint];
        return handler ? handler(payload) : { ok: false, error: `No fake for ${endpoint}.` };
      }
    },
    host: {
      async appendAutomationTurn() { throw new Error("Run it writes no turn of its own"); },
      async pendingAsks() { return []; },
      async getAsk() { return null; }
    },
    projectId: "project.run",
    conversationId: "conversation.run",
    sessionId: "session.person",
    keyLocked: false,
    paired: false,
    startLocation: null,
    ...extra
  };
  return { context, calls };
}

const ended = (status: string, extra: Record<string, unknown> = {}): Handler => () => ({ ok: true, payload: { runtimeSession: { runId: "run.7", status }, terminalReason: status, ...extra } });

/** A stored change, with the words a person must never be shown in it. */
const adaptation = (adaptationId: string, status: string, kind: string, appliedTo: Array<{ kind: string; id: string }> = []) => ({
  adaptationId,
  status,
  diagnosis: "The button with text SECRET-PAGE-TEXT moved to #buy-now-2",
  patch: [{ kind, targetId: "node.buy", summary: "Use selector #buy-now-2", after: { selector: "#buy-now-2" } }],
  appliedTo
});

const NEVER_SHOWN = ["SECRET-PAGE-TEXT", "#buy-now-2", "selector", "node.buy"];

describe("Run it", () => {
  it("asks for a run the model can repair, under the person's own session paying for its checks as before", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("succeeded") });

    await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(calls).toEqual([{ endpoint: "run-runtime-session", payload: { projectId: "project.run", flowId: "flow.kettle", runIntent: "explore_and_adapt" } }]);
  });

  it("asks a paired client's run to pay only for the result checks that judge a repair", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("succeeded") }, { paired: true, sessionId: "session.unlocked" });

    await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(calls[0]?.payload).toEqual({ projectId: "project.run", flowId: "flow.kettle", runIntent: "explore_and_adapt", resultCheckCallerPays: "repair_checks" });
  });

  it("keeps today's words when the run learned nothing, and reads no change", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("succeeded", { createdAdaptationIds: [], durableBehaviorChanged: false }) });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome).toMatchObject({ status: "done", summary: "The run run.7 ended succeeded.", runId: "run.7", flowId: "flow.kettle" });
    expect(calls.map((call) => call.endpoint)).toEqual(["run-runtime-session"]);
  });

  it("says plainly what an applied change taught it, and that the next run starts with it", async () => {
    const { context, calls } = contextWith({
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.1"], durableBehaviorChanged: true }),
      "get-flow-adaptation": () => ({ ok: true, payload: { adaptation: adaptation("adaptation.1", "applied", "edit_action_target", [{ kind: "action_target", id: "node.buy" }]) } })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(calls[1]).toEqual({ endpoint: "get-flow-adaptation", payload: { projectId: "project.run", flowId: "flow.kettle", adaptationId: "adaptation.1" } });
    expect(outcome.status).toBe("done");
    expect(outcome.summary).toBe("The run run.7 ended succeeded. It learned something from this run: it now finds the control it presses a different way. The next run starts with it.");
    for (const word of NEVER_SHOWN) expect(outcome.summary).not.toContain(word);
  });

  // A re-author (t267 S4) is kept only once a whole re-run with it was judged
  // to answer; it is no flow adaptation, so the run's answer says it apart.
  it("says a re-authored Flow it kept, and that the next run starts with it, reading no adaptation", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("succeeded", { createdAdaptationIds: [], durableBehaviorChanged: false, reauthored: "applied" }) });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(calls.map((call) => call.endpoint)).toEqual(["run-runtime-session"]);
    expect(outcome.summary).toBe("The run run.7 ended succeeded. It learned something from this run: it re-wrote some of its steps, and a whole run with them was judged to do what you asked. The next run starts with it.");
  });

  it("says a re-author that was not kept left the Flow as it was", async () => {
    const { context } = contextWith({ "run-runtime-session": ended("succeeded", { createdAdaptationIds: [], reauthored: "not_applied" }) });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("The run run.7 ended succeeded. It tried re-writing some of its steps, but a run with them was not judged to do what you asked, so the Flow stays as it was.");
  });

  it("says a change that was not applied waits for the person's review", async () => {
    const { context } = contextWith({
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.2"], durableBehaviorChanged: false }),
      "get-flow-adaptation": () => ({ ok: true, payload: { adaptation: adaptation("adaptation.2", "proposed", "edit_subflow") } })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("The run run.7 ended succeeded. It learned something from this run: it re-wrote some of its steps. That waits for your review before a run uses it.");
    for (const word of NEVER_SHOWN) expect(outcome.summary).not.toContain(word);
  });

  it("names each change it learned, applied and pending alike", async () => {
    const stored: Record<string, unknown> = {
      "adaptation.1": adaptation("adaptation.1", "applied", "edit_action_target"),
      "adaptation.2": adaptation("adaptation.2", "validated", "edit_expectation")
    };
    const { context } = contextWith({
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.1", "adaptation.2"], durableBehaviorChanged: true }),
      "get-flow-adaptation": (payload) => ({ ok: true, payload: { adaptation: stored[String(payload.adaptationId)] } })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("The run run.7 ended succeeded. It learned 2 things from this run. It now finds the control it presses a different way, and the next run starts with it. It changed what it waits to see after a step, which waits for your review before a run uses it.");
  });

  it("still says it learned something when a change cannot be read, without guessing what", async () => {
    const { context } = contextWith({
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.gone"], durableBehaviorChanged: true }),
      "get-flow-adaptation": () => ({ ok: false, error: "Adaptation not found: adaptation.gone" })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("The run run.7 ended succeeded. It learned something from this run: it changed how it runs. The next run starts with it.");
  });

  it("reads no change after a run that failed", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("failed", { createdAdaptationIds: ["adaptation.1"], terminalReason: "The price never appeared." }) });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.status).toBe("failed");
    expect(calls.map((call) => call.endpoint)).toEqual(["run-runtime-session"]);
  });
});
