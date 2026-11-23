// A trace may carry content a host recorded on its own stream (Automation
// Studio's control artifacts). The replay walk neither reports it as an event
// that lost its session nor feeds it to the gateway as a client's upload: it was
// never gateway traffic. A client upload that lost its session is still a gap.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ClientGatewayService, replayClientGatewayTrace, type ClientGatewayTraceEvent } from "../../index.ts";
import { clientMessage, openTrace, pairClient, traceScope, type OpenTrace } from "../../tests/trace-tap-support.ts";
import { copiedTraceStore, recordedTraceEvents, renumberedEvents } from "./trace-copy.ts";

const UNREFERENCED = "the event does not say which session it belongs to";

/** One action answered with a result that references an uploaded artifact, recorded live. */
async function recordUpload(traceId: string): Promise<OpenTrace> {
  const scope = traceScope();
  const trace = openTrace(traceId);
  const gateway = new ClientGatewayService({ commandTimeoutMs: 60_000, trace: scope.source });
  const client = await pairClient(gateway, "client.host-stream");
  const press = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press", parameters: { value: 1 }, timeoutMs: 60_000 }));
  const bytes = new TextEncoder().encode("<doc>upload</doc>");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(gateway.receiveTraceArtifact(client.sessionId, { sha256, mediaType: "text/html", bytes })).toEqual({ status: "accepted", traces: 1 });
  const references = { artifacts: [{ sha256, mediaType: "text/html", byteLength: bytes.byteLength, role: "primary" }], unavailable: 0 };
  await gateway.receiveRaw(client.sessionId, JSON.stringify(clientMessage("client.action_result", { commandId: press.commandId, status: "succeeded", payload: { count: 1 }, metadata: { trace: references } })));
  await expect(press.result).resolves.toMatchObject({ status: "succeeded" });
  await trace.recorder.close({ terminationReason: "completed", terminationDetail: null });
  await gateway.close();
  return trace;
}

/** A copy of the recording holding `events`, its manifest's last sequence matching them. */
async function storeWith(trace: OpenTrace, events: readonly ClientGatewayTraceEvent[]) {
  const kept = renumberedEvents(events);
  const store = await copiedTraceStore(trace, kept);
  const manifest = await store.readManifest(trace.traceId);
  if (manifest === undefined) throw new Error("the copy has no manifest");
  // A host that records on its own stream declares it, as Automation Studio's episodes declare `control`.
  await store.writeManifest({ ...manifest, streams: [...manifest.streams, "control"], completeness: { ...manifest.completeness, lastSequence: kept.length } });
  return { store, kept };
}

/** An artifact as a host records it on its own stream, beside the client's upload: no session reference. */
function hostArtifact(upload: ClientGatewayTraceEvent): ClientGatewayTraceEvent {
  const { session: _session, ...rest } = upload;
  return { ...rest, eventId: `${upload.eventId}.host`, stream: "control", messageType: "recorded.start" };
}

describe("replaying a trace that carries a host's own artifact", () => {
  it("reports no lost session for it and feeds it to no one, while the trace stays recorded", async () => {
    const trace = await recordUpload("trace.host-stream.kept");
    const events = await recordedTraceEvents(trace);
    const upload = events.find((event) => event.kind === "artifact" && event.stream === "artifact");
    if (upload === undefined) throw new Error("the recording has no client upload");
    const plain = await replayClientGatewayTrace({ store: (await storeWith(trace, events)).store, traceId: trace.traceId });
    const withHost = [...events, hostArtifact(upload)];
    const { store, kept } = await storeWith(trace, withHost);
    const report = await replayClientGatewayTrace({ store, traceId: trace.traceId });
    const hostSequence = kept[kept.length - 1]!.sequence;

    expect(report.sessionReferences).toEqual({ status: "recorded" });
    expect(report.divergences.filter((divergence) => divergence.detail.startsWith(UNREFERENCED))).toEqual([]);
    // Nothing was uploaded in its name: every event the replay derived matches the recording without it.
    expect(report.entries.filter((entry) => entry.sequence !== hostSequence)).toEqual(plain.entries);
    expect(report.divergences.filter((divergence) => divergence.sequence !== hostSequence)).toEqual(plain.divergences);
  });

  it("still reports a client upload that lost its session", async () => {
    const trace = await recordUpload("trace.host-stream.lost");
    const events = (await recordedTraceEvents(trace)).map((event) => {
      if (!(event.kind === "artifact" && event.stream === "artifact")) return event;
      const { session: _session, ...rest } = event;
      return rest;
    });
    const report = await replayClientGatewayTrace({ store: (await storeWith(trace, events)).store, traceId: trace.traceId });
    expect(report.sessionReferences).toEqual({ status: "refused", reason: "some of its events name their session and others do not" });
  });
});
