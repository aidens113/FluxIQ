// "Run it" from the chat: what the run asks for, and what the thread is told
// the run learned.
//
// The run asks for the model with `explore_and_adapt`, so a step that breaks
// can be repaired, and every chat's run -- paired or the web panel's -- pays
// only for the result checks that judge a repair (MVP item 23), as the
// extension's own Run button does. A run that ended without failing says in
// plain words what ran and how far (MVP item 24): the Flow's name, never a run
// id, a status word or the trace's message. If it recorded changes it says
// what it learned, from Core's closed change kinds only: never the model's
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

/** The Flow's own record, as `get-flow` answers it. */
const named: Handler = () => ({ ok: true, payload: { flow: { flowId: "flow.kettle", name: "Kettle prices" } } });

/** What the thread is told before anything it learned. */
const RAN = '"Kettle prices" ran all the way through.';

/** Words of the old ending a person must not be shown. */
const NEVER_IN_ENDING = ["run.7", "succeeded", "ended", "waiting", "trace"];

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
  it("asks a web-panel conversation's run, too, to pay only for the result checks that judge a repair", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("succeeded"), "get-flow": named });

    await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(calls[0]).toEqual({ endpoint: "run-runtime-session", payload: { projectId: "project.run", flowId: "flow.kettle", runIntent: "explore_and_adapt", resultCheckCallerPays: "repair_checks" } });
  });

  it("asks a paired client's run to pay only for the result checks that judge a repair", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("succeeded") }, { paired: true, sessionId: "session.unlocked" });

    await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(calls[0]?.payload).toEqual({ projectId: "project.run", flowId: "flow.kettle", runIntent: "explore_and_adapt", resultCheckCallerPays: "repair_checks" });
  });

  it("says by name that the Flow ran all the way through, with no run id, status word or trace text, and reads no change", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("succeeded", { createdAdaptationIds: [], durableBehaviorChanged: false, terminalReason: "Run reached trace node end.success." }), "get-flow": named });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome).toMatchObject({ status: "done", summary: RAN, runId: "run.7", flowId: "flow.kettle" });
    expect(calls.map((call) => call.endpoint)).toEqual(["run-runtime-session", "get-flow"]);
    expect(calls[1]?.payload).toEqual({ projectId: "project.run", flowId: "flow.kettle" });
    for (const word of [...NEVER_IN_ENDING, "end.success", "Run reached"]) expect(outcome.summary).not.toContain(word);
  });

  it("falls back to the Flow when its name cannot be read", async () => {
    const failed = contextWith({ "run-runtime-session": ended("succeeded"), "get-flow": () => ({ ok: false, error: "Flow not found: flow.kettle" }) });
    const nameless = contextWith({ "run-runtime-session": ended("succeeded"), "get-flow": () => ({ ok: true, payload: { flow: { flowId: "flow.kettle" } } }) });

    for (const { context } of [failed, nameless]) {
      const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });
      expect(outcome.status).toBe("done");
      expect(outcome.summary).toBe("The Flow ran all the way through.");
    }
  });

  it("says a run that stopped to wait for the person, with a plain cause and no code", async () => {
    const { context } = contextWith({ "run-runtime-session": ended("waiting", { terminalReason: "It needs you to sign in (core.runtime.waiting_for_user)." }), "get-flow": named });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe('"Kettle prices" stopped to wait for you: It needs you to sign in.');
    for (const word of [...NEVER_IN_ENDING, "core.runtime"]) expect(outcome.summary).not.toContain(word);
  });

  it("says a run that ended any other unfinished way stopped before the end", async () => {
    const { context } = contextWith({ "run-runtime-session": ended("paused", { terminalReason: "Run paused at trace node node.buy." }), "get-flow": named });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe('"Kettle prices" stopped before the end.');
    for (const word of [...NEVER_IN_ENDING, "paused", "node.buy"]) expect(outcome.summary).not.toContain(word);
  });

  it("says plainly what an applied change taught it, and that the next run starts with it", async () => {
    const { context, calls } = contextWith({
      "get-flow": named,
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.1"], durableBehaviorChanged: true }),
      "get-flow-adaptation": () => ({ ok: true, payload: { adaptation: adaptation("adaptation.1", "applied", "edit_action_target", [{ kind: "action_target", id: "node.buy" }]) } })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(calls[2]).toEqual({ endpoint: "get-flow-adaptation", payload: { projectId: "project.run", flowId: "flow.kettle", adaptationId: "adaptation.1" } });
    expect(outcome.status).toBe("done");
    expect(outcome.summary).toBe("\"Kettle prices\" ran all the way through. It learned something from this run: it now finds the control it presses a different way. The next run starts with it.");
    for (const word of NEVER_SHOWN) expect(outcome.summary).not.toContain(word);
  });

  // A re-author (t267 S4) is kept only once a whole re-run with it was judged
  // to answer; it is no flow adaptation, so the run's answer says it apart.
  it("says a re-authored Flow it kept, and that the next run starts with it, reading no adaptation", async () => {
    const { context, calls } = contextWith({ "get-flow": named, "run-runtime-session": ended("succeeded", { createdAdaptationIds: [], durableBehaviorChanged: false, reauthored: "applied" }) });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(calls.map((call) => call.endpoint)).toEqual(["run-runtime-session", "get-flow"]);
    expect(outcome.summary).toBe("\"Kettle prices\" ran all the way through. It learned something from this run: it re-wrote some of its steps, and a whole run with them was judged to do what you asked. The next run starts with it.");
  });

  it("says a re-author that was not kept left the Flow as it was", async () => {
    const { context } = contextWith({ "get-flow": named, "run-runtime-session": ended("succeeded", { createdAdaptationIds: [], reauthored: "not_applied" }) });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("\"Kettle prices\" ran all the way through. It tried re-writing some of its steps, but a run with them was not judged to do what you asked, so the Flow stays as it was.");
  });

  it("says a change that was not applied waits for the person's review", async () => {
    const { context } = contextWith({
      "get-flow": named,
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.2"], durableBehaviorChanged: false }),
      "get-flow-adaptation": () => ({ ok: true, payload: { adaptation: adaptation("adaptation.2", "proposed", "edit_subflow") } })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("\"Kettle prices\" ran all the way through. It learned something from this run: it re-wrote some of its steps. That waits for your review before a run uses it.");
    for (const word of NEVER_SHOWN) expect(outcome.summary).not.toContain(word);
  });

  it("names each change it learned, applied and pending alike", async () => {
    const stored: Record<string, unknown> = {
      "adaptation.1": adaptation("adaptation.1", "applied", "edit_action_target"),
      "adaptation.2": adaptation("adaptation.2", "validated", "edit_expectation")
    };
    const { context } = contextWith({
      "get-flow": named,
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.1", "adaptation.2"], durableBehaviorChanged: true }),
      "get-flow-adaptation": (payload) => ({ ok: true, payload: { adaptation: stored[String(payload.adaptationId)] } })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("\"Kettle prices\" ran all the way through. It learned 2 things from this run. It now finds the control it presses a different way, and the next run starts with it. It changed what it waits to see after a step, which waits for your review before a run uses it.");
  });

  it("still says it learned something when a change cannot be read, without guessing what", async () => {
    const { context } = contextWith({
      "get-flow": named,
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.gone"], durableBehaviorChanged: true }),
      "get-flow-adaptation": () => ({ ok: false, error: "Adaptation not found: adaptation.gone" })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("\"Kettle prices\" ran all the way through. It learned something from this run: it changed how it runs. The next run starts with it.");
  });

  // `durableBehaviorChanged` also counts a kept re-author, so beside one it no
  // longer says the unread runtime change was applied.
  it("does not call a change it cannot read applied when the run's only sure durable change was a kept re-author", async () => {
    const { context } = contextWith({
      "get-flow": named,
      "run-runtime-session": ended("succeeded", { createdAdaptationIds: ["adaptation.gone"], durableBehaviorChanged: true, reauthored: "applied" }),
      "get-flow-adaptation": () => ({ ok: false, error: "Adaptation not found: adaptation.gone" })
    });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.summary).toBe("\"Kettle prices\" ran all the way through. It learned 2 things from this run. It re-wrote some of its steps, and a whole run with them was judged to do what you asked, and the next run starts with it. It changed how it runs, which waits for your review before a run uses it.");
  });

  it("reads no change after a run that failed", async () => {
    const { context, calls } = contextWith({ "run-runtime-session": ended("failed", { createdAdaptationIds: ["adaptation.1"], terminalReason: "The price never appeared." }) });

    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: "flow.kettle" });

    expect(outcome.status).toBe("failed");
    expect(calls.map((call) => call.endpoint)).toEqual(["run-runtime-session"]);
  });
});
