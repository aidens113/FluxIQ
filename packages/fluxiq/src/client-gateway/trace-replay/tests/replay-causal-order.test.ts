// P3 D22: parity checks order per causal chain. Live intake handles one
// socket's frames concurrently, so two state updates taken in together may
// finish in either order; the replay feeds them one at a time and still
// matches. The inputs' own order, and each disposition's content, stay
// compared: a changed or missing disposition is still a divergence.

import { describe, expect, it } from "vitest";
import { ClientGatewayService, replayClientGatewayTrace, type ClientGatewayTraceEvent, type ClientGatewayTraceParityReport } from "../../index.ts";
import { clientMessage, openTrace, pairClient, traceScope, waitFor, type OpenTrace } from "../../tests/trace-tap-support.ts";
import { copiedTraceStore, isClaimRecord, recordedTraceEvents } from "./trace-copy.ts";

const OWNER = { projectId: "project.order", runId: "run.order" };

/** An action under the trace (which claims the session), two state updates received together, then the action's result. */
async function recordConcurrentUpdates(traceId: string): Promise<OpenTrace> {
  const scope = traceScope();
  const trace = openTrace(traceId);
  const gateway = new ClientGatewayService({ commandTimeoutMs: 60_000, trace: scope.source, commandOwner: () => OWNER });
  const client = await pairClient(gateway, "client.order");
  const press = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press", timeoutMs: 60_000 }));
  await waitFor(() => client.sent.some((item) => item.type === "server.execute_action"));
  const first = JSON.stringify(clientMessage("client.state_update", { state: { step: "first" } }));
  const second = JSON.stringify(clientMessage("client.state_update", { state: { step: "second" } }));
  await Promise.all([gateway.receiveRaw(client.sessionId, first), gateway.receiveRaw(client.sessionId, second)]);
  await gateway.receiveRaw(client.sessionId, JSON.stringify(clientMessage("client.action_result", { commandId: press.commandId, status: "succeeded" })));
  await expect(press.result).resolves.toMatchObject({ status: "succeeded" });
  await trace.recorder.close({ terminationReason: "completed", terminationDetail: null });
  await gateway.close();
  return trace;
}

/** The kinds and types in order, leaving out a session's claim record (D23), which this test is not about. */
function shape(events: readonly ClientGatewayTraceEvent[]): string[] {
  return events.filter((event) => !isClaimRecord(event)).map((event) => `${event.kind}:${event.messageType ?? ""}`);
}

/** The sequences of the two state updates' dispositions, in recorded order. */
function updateDispositions(events: readonly ClientGatewayTraceEvent[]): [number, number] {
  const found = events.filter((event) => event.kind === "disposition" && event.messageType === "client.state_update").map((event) => event.sequence);
  const first = found[0];
  const second = found[1];
  if (first === undefined || second === undefined) throw new Error("the recording lacks the two state updates' dispositions");
  return [first, second];
}

function summary(report: ClientGatewayTraceParityReport): unknown {
  return report.divergences.map((divergence) => ({ sequence: divergence.sequence, class: divergence.class, fields: divergence.fields, detail: divergence.detail }));
}

/** The recorded events with the sequences of the two state-update dispositions swapped: the second input finished first. */
function secondFinishedFirst(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceEvent[] {
  const [first, second] = updateDispositions(events);
  return events.map((event) => {
    if (event.sequence === first) return { ...event, sequence: second };
    if (event.sequence === second) return { ...event, sequence: first };
    return event;
  });
}

const RECORDED_SHAPE = [
  "outbound:server.execute_action",
  "inbound:client.state_update",
  "inbound:client.state_update",
  "disposition:client.state_update",
  "disposition:client.state_update",
  "inbound:client.action_result",
  "disposition:client.action_result"
];

describe("parity compares order per causal chain", () => {
  it("matches two concurrently handled state updates the replay finishes one at a time", async () => {
    const trace = await recordConcurrentUpdates("trace.order.concurrent");
    const events = await recordedTraceEvents(trace);
    expect(shape(events)).toEqual(RECORDED_SHAPE);

    const report = await replayClientGatewayTrace({ store: trace.store, traceId: trace.traceId });

    expect(summary(report)).toEqual([]);
    expect(report.verdict).toBe("matched");
    expect(shape(report.replayEvents)).toEqual([
      "outbound:server.execute_action",
      "inbound:client.state_update",
      "disposition:client.state_update",
      "inbound:client.state_update",
      "disposition:client.state_update",
      "inbound:client.action_result",
      "disposition:client.action_result"
    ]);
    expect(report.declaredDifferences).toEqual(expect.arrayContaining([expect.stringContaining("order is compared per causal chain")]));
  });

  it("matches them when the second input's handling finished first live", async () => {
    const trace = await recordConcurrentUpdates("trace.order.reversed");
    const events = secondFinishedFirst(await recordedTraceEvents(trace));
    const reversed = await copiedTraceStore(trace, events);

    const report = await replayClientGatewayTrace({ store: reversed, traceId: trace.traceId });

    expect(summary(report)).toEqual([]);
    expect(report.verdict).toBe("matched");
  });

  it("still diverges when a disposition differs, even where the order may vary", async () => {
    const trace = await recordConcurrentUpdates("trace.order.changed");
    const recorded = await recordedTraceEvents(trace);
    const later = updateDispositions(recorded)[1];
    const events = secondFinishedFirst(recorded).map((event) => {
      if (event.sequence !== later || event.payload.encoding !== "json") return event;
      const value: unknown = event.payload.value;
      if (typeof value !== "object" || value === null) return event;
      return { ...event, payload: { encoding: "json" as const, value: { ...value, disposition: "ignored" } } };
    });
    const changed = await copiedTraceStore(trace, events);

    const report = await replayClientGatewayTrace({ store: changed, traceId: trace.traceId });

    expect(summary(report)).toEqual([
      { sequence: later, class: "intake_defect", fields: ["payload.value.disposition"], detail: expect.stringContaining("the same input, a different derivation") }
    ]);
  });

  it("still diverges when a disposition is missing, and the replay's own is extra", async () => {
    const trace = await recordConcurrentUpdates("trace.order.missing");
    const recorded = await recordedTraceEvents(trace);
    const removed = updateDispositions(recorded)[0];
    const events = recorded.filter((event) => event.sequence !== removed);
    const missing = await copiedTraceStore(trace, events);

    const report = await replayClientGatewayTrace({ store: missing, traceId: trace.traceId });

    expect(summary(report)).toEqual([
      { sequence: removed, class: "capture_gap", fields: ["event"], detail: `sequence ${removed} is missing from the trace` },
      { sequence: null, class: "intake_defect", fields: ["event"], detail: "the replay derived an event the recording does not have" }
    ]);
  });
});
