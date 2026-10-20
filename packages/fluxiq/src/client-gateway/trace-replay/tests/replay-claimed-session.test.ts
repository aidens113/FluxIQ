// P3 D23: a session that declared it answers reconcile questions, and was
// paired before the trace began, replays with that capability when the trace
// recorded its public view as it first claimed it: Core asks the same
// question and settles the same way, and parity matches. A trace without that
// record (older traces) keeps today's behaviour: the reconcile path it cannot
// reproduce is a capture gap, and nothing else is.
//
// When the gateway this test records through does not hand its tap session
// records, the claim record is written by the tap itself (from the session's
// public view) and placed where the tap puts it: before the message that
// first claimed the session. The older trace is the recording without it.

import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  replayClientGatewayTrace,
  type ClientGatewayCapability,
  type ClientGatewayClientMessage,
  type ClientGatewayServerMessage,
  type ClientGatewayTraceEvent,
  type ClientGatewayTraceParityReport
} from "../../index.ts";
import { ClientGatewayTraceTap } from "../../service/index.ts";
import { openTrace, traceScope, waitFor, type OpenTrace } from "../../tests/trace-tap-support.ts";
import { copiedTraceStore, isClaimRecord, recordedTraceEvents, renumberedEvents } from "./trace-copy.ts";

const ANSWERS: ClientGatewayCapability = { id: "example.reconcile", kind: "action", metadata: { answersReconcile: true } };
const CLIENT_ID = "client.claimed";

type Recorded = { trace: OpenTrace; claim: ClientGatewayTraceEvent; token: string };

function message<TType extends ClientGatewayClientMessage["type"]>(type: TType, id: string, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): string {
  return JSON.stringify({ id, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1_700_000_000_000, payload });
}

/** A reconcile-answering client paired before the trace; one command whose answer never came, asked about and answered `not_seen`. */
async function recordReconcile(traceId: string): Promise<Recorded> {
  const scope = traceScope();
  const trace = openTrace(traceId);
  const gateway = new ClientGatewayService({ commandTimeoutMs: 20, reconcileAnswerMs: 5_000, trace: scope.source });
  const sent: ClientGatewayServerMessage[] = [];
  let sessionId = "";
  const socket = {
    send: (raw: string) => {
      const outgoing = JSON.parse(raw) as ClientGatewayServerMessage;
      sent.push(outgoing);
      if (outgoing.type !== "server.reconcile_command") return;
      const answer = message("client.reconcile_result", "answer-1", { commandId: outgoing.payload.commandId, state: "not_seen" });
      setTimeout(() => void gateway.receiveRaw(sessionId, answer), 1);
    }
  };
  sessionId = gateway.connect({ socket }).sessionId;
  await gateway.receiveRaw(sessionId, message("client.hello", "hello-1", { clientId: CLIENT_ID, clientType: "extension", name: CLIENT_ID, version: "2.0.0", capabilities: [ANSWERS], metadata: { domainId: "example.domain" } }));
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId);
  if (pairing) await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.claimed" });
  const ready = sent.find((item) => item.type === "server.session_ready");
  const token = ready?.type === "server.session_ready" ? ready.payload.token : "";
  const view = gateway.snapshot().sessions.find((session) => session.sessionId === sessionId);
  if (view === undefined) throw new Error("the paired session is not in the gateway's snapshot");

  const press = scope.within(trace.recorder, () => gateway.executeAction(sessionId, { actionType: "example.press" }));
  await expect(press.result).resolves.toMatchObject({ status: "failed", metadata: { reconciled: "not_seen" } });
  await waitFor(() => trace.recorder.status().lastSequence >= 5);
  await trace.recorder.close({ terminationReason: "completed", terminationDetail: null });
  await gateway.close();

  // The claim record the tap writes for this session, taken from its public view.
  const scratch = openTrace(traceId);
  const tap = new ClientGatewayTraceTap({ source: scope.source, clientIdOf: () => CLIENT_ID, sessionViewOf: () => view });
  const first = sent.find((item) => item.type === "server.execute_action");
  if (first === undefined) throw new Error("the command was never sent");
  scope.within(scratch.recorder, () => tap.outboundMessage(sessionId, first));
  const claim = (await scratch.events())[0];
  if (claim === undefined || claim.messageType !== "session.claimed") throw new Error("the tap recorded no claim");
  return { trace, claim, token };
}

/** The recording with the claim record before the message that first claimed the session. */
async function withClaim(recorded: Recorded): Promise<readonly ClientGatewayTraceEvent[]> {
  const events = await recordedTraceEvents(recorded.trace);
  if (events.some(isClaimRecord)) return events;
  const claim: ClientGatewayTraceEvent = { ...recorded.claim, eventId: `${recorded.claim.eventId}.claim` };
  return renumberedEvents([claim, ...events]);
}

/** The recording as a trace from before claim records: without any. */
async function withoutClaim(recorded: Recorded): Promise<readonly ClientGatewayTraceEvent[]> {
  return renumberedEvents((await recordedTraceEvents(recorded.trace)).filter((event) => !isClaimRecord(event)));
}

function shape(events: readonly ClientGatewayTraceEvent[]): string[] {
  return events.map((event) => `${event.kind}:${event.messageType ?? ""}`);
}

function summary(report: ClientGatewayTraceParityReport): unknown {
  return report.divergences.map((divergence) => ({ sequence: divergence.sequence, class: divergence.class, detail: divergence.detail }));
}

describe("a session the trace claimed, replayed with the view it had", () => {
  it("answers the reconcile question again and matches the recording", async () => {
    const recorded = await recordReconcile("trace.claimed.view");
    const events = await withClaim(recorded);
    expect(shape(events)).toEqual([
      "lifecycle:session.claimed",
      "outbound:server.execute_action",
      "outbound:server.reconcile_command",
      "inbound:client.reconcile_result",
      "disposition:client.reconcile_result",
      "synthesized:server.execute_action"
    ]);
    expect(JSON.stringify(events)).not.toContain(recorded.token);
    const store = await copiedTraceStore(recorded.trace, events);

    const report = await replayClientGatewayTrace({ store, traceId: recorded.trace.traceId });

    expect(summary(report)).toEqual([]);
    expect(report.verdict).toBe("matched");
    expect(report.entries.map((entry) => entry.status)).toEqual(["matched", "matched", "matched", "matched", "matched", "matched"]);
    expect(shape(report.replayEvents)).toContain("outbound:server.reconcile_command");
    expect(report.normalizations.map((normalization) => normalization.field)).toContain("session.claimed lifecycle events");
  });

  it("without the claim record (an older trace), reports the reconcile path it cannot reproduce as a capture gap only", async () => {
    const recorded = await recordReconcile("trace.claimed.older");
    const store = await copiedTraceStore(recorded.trace, await withoutClaim(recorded));

    const report = await replayClientGatewayTrace({ store, traceId: recorded.trace.traceId });

    expect(report.verdict).toBe("diverged");
    expect(report.divergences.length).toBeGreaterThan(0);
    expect(report.divergences.every((divergence) => divergence.class === "capture_gap")).toBe(true);
    expect(report.divergences.map((divergence) => divergence.detail)).toContain("the trace does not say what the session's capabilities were, so the replay cannot know it answers reconcile questions");
  });
});
