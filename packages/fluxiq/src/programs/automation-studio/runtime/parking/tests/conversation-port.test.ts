// The conversation as a parking port, on its own.
//
// `tests/conversation-parking.test.ts` proves the whole loop against a real
// service and a real database; this proves the four decisions inside the
// adapter that a whole-loop test cannot isolate: that an ask reaches the thread
// as the store's own ask and nothing more, that an answer given in this process
// wakes the run without waiting out a poll, that the deadline closes the
// question instead of leaving it pending, and that an answer landing at the
// deadline beats the timeout rather than racing it.

import { describe, expect, it, vi } from "vitest";

import type { AutomationStudioConversationAsk, AutomationStudioConversationAskInput } from "../../conversations/index.ts";
import { automationStudioConversationParkingPort, type AutomationStudioConversationParkingHost } from "../conversation-port.ts";
import type { AutomationStudioAsk } from "../ask.ts";

const SUBJECT = { kind: "run", id: "run.7" } as const;
const PROJECT_ID = "project.one";

const ASK: AutomationStudioAsk = {
  askId: "approve.attempt.1",
  kind: "confirm",
  parks: true,
  status: "pending",
  text: "Publish the draft?",
  routes: { granted: "approved", denied: "rejected", timedOut: "rejected" },
  raisedBy: { stage: "execution", nodeId: "approve", definitionId: "builtin.routine.approval" }
};

/** The ask as the store would have it: pending until something settles it. */
function storedAsk(overrides: Partial<AutomationStudioConversationAsk> = {}): AutomationStudioConversationAsk {
  return {
    askId: ASK.askId,
    conversationId: "conversation.1",
    turnId: "turn.1",
    kind: "confirm",
    status: "pending",
    parks: true,
    timeoutMs: null,
    onTimeout: null,
    options: null,
    routes: { granted: "approved", denied: "rejected", timedOut: "rejected" },
    consequences: null,
    missing: null,
    control: null,
    permissionRequest: null,
    createdAt: 1,
    answer: null,
    ...overrides
  };
}

function answered(): AutomationStudioConversationAsk {
  return storedAsk({ status: "answered", answer: { askId: ASK.askId, answeredAt: 5, kind: "grant", value: null, actorId: "user.person" } });
}

/** A thread that holds one ask, with the store's own settling behaviour faked around it. */
function threadHost(input: { ask: () => AutomationStudioConversationAsk | null; expire?: () => AutomationStudioConversationAsk }) {
  const posted: Array<{ text: string; ask: AutomationStudioConversationAskInput | null }> = [];
  const listeners = new Set<() => void>();
  const expireAsk = vi.fn(async () => (input.expire ?? input.ask)() ?? storedAsk({ status: "expired" }));
  const host: AutomationStudioConversationParkingHost = {
    writerFor: () => ({
      projectId: PROJECT_ID,
      subject: SUBJECT,
      conversationId: async () => "conversation.1",
      say: async () => { throw new Error("not used"); },
      ask: async (request) => {
        posted.push({ text: request.text, ask: request.ask });
        return { turnId: "turn.1" } as never;
      },
      askPermission: async () => { throw new Error("not used"); }
    }),
    getAsk: async () => input.ask(),
    expireAsk,
    onAskSettled: (_askId, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  return { host, posted, expireAsk, settle: () => { for (const listener of [...listeners]) listener(); } };
}

describe("the conversation as a parking port", () => {
  it("posts the question as a turn carrying exactly the ask the store accepts", async () => {
    const thread = threadHost({ ask: storedAsk });
    const port = automationStudioConversationParkingPort({ host: thread.host, projectId: PROJECT_ID, subject: SUBJECT });

    await port.open(ASK);

    expect(thread.posted).toHaveLength(1);
    expect(thread.posted[0]?.text).toBe("Publish the draft?");
    // The words are the turn's, and the three things only a live run knows do not travel into the thread.
    expect(thread.posted[0]?.ask).toEqual({
      askId: "approve.attempt.1",
      kind: "confirm",
      parks: true,
      routes: { granted: "approved", denied: "rejected", timedOut: "rejected" }
    });
  });

  it("wakes the moment the answer is written here, rather than waiting out a poll", async () => {
    let ask = storedAsk();
    const thread = threadHost({ ask: () => ask });
    const port = automationStudioConversationParkingPort({ host: thread.host, projectId: PROJECT_ID, subject: SUBJECT, pollIntervalMs: 600_000 });

    const waiting = port.awaitAnswer!(ASK, {});
    await Promise.resolve();
    ask = answered();
    thread.settle();

    expect(await waiting).toMatchObject({ askId: ASK.askId, kind: "grant", actorId: "user.person" });
    expect(thread.expireAsk).not.toHaveBeenCalled();
  });

  it("closes the question at the deadline, so nobody is left a pending ask for a run that has gone on", async () => {
    const thread = threadHost({ ask: storedAsk, expire: () => storedAsk({ status: "expired" }) });
    const port = automationStudioConversationParkingPort({ host: thread.host, projectId: PROJECT_ID, subject: SUBJECT, pollIntervalMs: 5 });

    expect(await port.awaitAnswer!(ASK, { expiresAtMs: Date.now() - 1 })).toBeUndefined();
    expect(thread.expireAsk).toHaveBeenCalledWith({ projectId: PROJECT_ID, askId: ASK.askId });
  });

  it("takes the answer that beat the deadline instead of the timeout it was about to declare", async () => {
    // The store is the arbiter: it refuses to expire an ask that was answered
    // first and hands the answer back, which is the only way an ask cannot end
    // up both answered and timed out.
    const thread = threadHost({ ask: storedAsk, expire: answered });
    const port = automationStudioConversationParkingPort({ host: thread.host, projectId: PROJECT_ID, subject: SUBJECT, pollIntervalMs: 5 });

    expect(await port.awaitAnswer!(ASK, { expiresAtMs: Date.now() - 1 })).toMatchObject({ kind: "grant" });
  });

  it("fails rather than waiting forever when the question is no longer in the thread", async () => {
    const thread = threadHost({ ask: () => null });
    const port = automationStudioConversationParkingPort({ host: thread.host, projectId: PROJECT_ID, subject: SUBJECT, pollIntervalMs: 5 });

    await expect(port.awaitAnswer!(ASK, {})).rejects.toThrow("no longer in its thread");
  });

  it("stops waiting when the run is cancelled, and does not close the question to do it", async () => {
    const thread = threadHost({ ask: storedAsk });
    const port = automationStudioConversationParkingPort({ host: thread.host, projectId: PROJECT_ID, subject: SUBJECT, pollIntervalMs: 600_000 });
    const controller = new AbortController();

    const waiting = port.awaitAnswer!(ASK, { signal: controller.signal });
    await Promise.resolve();
    controller.abort("Cancelled by user.");

    expect(await waiting).toBeUndefined();
    expect(thread.expireAsk).not.toHaveBeenCalled();
  });
});
