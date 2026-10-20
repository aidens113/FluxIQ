// The answer a waiting episode consumes is recorded into that episode's trace
// (traces and offline trials, P2; D1). `awaitAnswer` runs in the waiting
// episode's own async context, so the ambient episode takes it: exactly the
// answer the run goes on with, or none when the wait ended unanswered. Nothing
// is recorded outside every episode or with no episodes installed, and a wait
// that failed records nothing.

import { afterEach, describe, expect, it } from "vitest";

import type { ClientGatewayTraceEvent } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioConversationAsk } from "../../conversations/index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../../gateway-trace/index.ts";
import { episode, newEpisodes, storedEvents, type EpisodesHarness } from "../../gateway-trace/tests/episode-builders.ts";
import type { AutomationStudioAsk } from "../ask.ts";
import { automationStudioConversationParkingPort, type AutomationStudioConversationParkingHost } from "../conversation-port.ts";

const ASK: AutomationStudioAsk = {
  askId: "ask.trace",
  kind: "confirm",
  parks: true,
  status: "pending",
  text: "Publish the draft?",
  routes: { granted: "approved", denied: "rejected", timedOut: "rejected" },
  raisedBy: { stage: "execution", nodeId: "approve", definitionId: "builtin.routine.approval" }
};

function storedAsk(overrides: Partial<AutomationStudioConversationAsk>): AutomationStudioConversationAsk {
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

const ANSWER = { askId: ASK.askId, answeredAt: 5, kind: "grant" as const, value: null, actorId: "user.person" };

function port(read: () => Promise<AutomationStudioConversationAsk | null>) {
  const host: AutomationStudioConversationParkingHost = {
    writerFor: () => {
      throw new Error("not used");
    },
    getAsk: read,
    expireAsk: async () => storedAsk({ status: "expired" })
  };
  const parking = automationStudioConversationParkingPort({ host, projectId: "project-1", subject: { kind: "run", id: "run-1" }, pollIntervalMs: 1 });
  const awaitAnswer = parking.awaitAnswer;
  if (awaitAnswer === undefined) throw new Error("the conversation port waits in place");
  return awaitAnswer;
}

function answerEvents(events: readonly ClientGatewayTraceEvent[]): unknown[] {
  return events.filter((event) => event.messageType === "control.ask_answer").map((event) => (event.payload.encoding === "json" ? event.payload.value : undefined));
}

const uninstalls: Array<() => void> = [];

function installed(): EpisodesHarness {
  const harness = newEpisodes();
  uninstalls.push(AutomationStudioGatewayTraceInstallation.install(harness.episodes));
  return harness;
}

afterEach(() => {
  for (const uninstall of uninstalls.splice(0)) uninstall();
});

describe("the answer a traced episode consumes", () => {
  it("is recorded into the waiting episode, exactly as the run receives it", async () => {
    const { episodes, stores } = installed();
    const awaitAnswer = port(async () => storedAsk({ status: "answered", answer: ANSWER }));

    const received = await episodes.run(episode(), () => awaitAnswer(ASK, {}));

    expect(received).toEqual(ANSWER);
    expect(answerEvents(await storedEvents(stores.get("project-1"), "trace-1"))).toEqual([{ askId: ASK.askId, answered: true, answer: ANSWER }]);
  });

  it("is recorded as unanswered when the ask expired", async () => {
    const { episodes, stores } = installed();
    const awaitAnswer = port(async () => storedAsk({ status: "expired" }));

    const received = await episodes.run(episode(), () => awaitAnswer(ASK, {}));

    expect(received).toBeUndefined();
    expect(answerEvents(await storedEvents(stores.get("project-1"), "trace-1"))).toEqual([{ askId: ASK.askId, answered: false, answer: null }]);
  });

  it("records nothing when the wait fails, and the failure reaches the run", async () => {
    const { episodes, stores } = installed();
    const awaitAnswer = port(async () => null);

    await expect(episodes.run(episode(), () => awaitAnswer(ASK, {}))).rejects.toThrow(/no longer in its thread/);
    expect(answerEvents(await storedEvents(stores.get("project-1"), "trace-1"))).toEqual([]);
  });

  it("records nothing outside every episode, or with no episodes installed", async () => {
    const { stores } = installed();
    const awaitAnswer = port(async () => storedAsk({ status: "answered", answer: ANSWER }));

    expect(await awaitAnswer(ASK, {})).toEqual(ANSWER);
    expect(stores.size).toBe(0);
    for (const uninstall of uninstalls.splice(0)) uninstall();
    expect(await awaitAnswer(ASK, {})).toEqual(ANSWER);
  });
});
