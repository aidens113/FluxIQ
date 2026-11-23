// A host's event on its own stream belongs to no session and never passed through
// the gateway, so the parity report classes it `outside`, and the artifact it
// carries is no divergence for a replay that never takes it. A client upload on
// the tap's own `artifact` stream the replay lacks is still one.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ClientGatewayService, replayClientGatewayTrace, type ClientGatewayTraceEvent } from "../../../index.ts";
import { clientMessage, openTrace, pairClient, traceScope, type OpenTrace } from "../../../tests/trace-tap-support.ts";
import { copiedTraceStore, recordedTraceEvents, renumberedEvents } from "../../tests/trace-copy.ts";

async function recordUpload(traceId: string): Promise<OpenTrace> {
  const scope = traceScope();
  const trace = openTrace(traceId);
  const gateway = new ClientGatewayService({ commandTimeoutMs: 60_000, trace: scope.source });
  const client = await pairClient(gateway, "client.host-parity");
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

const EXTRA_ID = "artifact.extra";

/** The recording plus one more artifact event on `stream`, listed in the manifest with its own id and bytes. */
async function withExtraArtifact(trace: OpenTrace, stream: "control" | "artifact") {
  const events = await recordedTraceEvents(trace);
  const upload = events.find((event) => event.kind === "artifact" && event.stream === "artifact");
  if (upload === undefined) throw new Error("the recording has no client upload");
  const { session: _session, ...unreferenced } = upload;
  const extra: ClientGatewayTraceEvent = stream === "control"
    ? { ...unreferenced, eventId: `${upload.eventId}.extra`, stream, messageType: "recorded.start", artifactIds: [EXTRA_ID] }
    : { ...upload, eventId: `${upload.eventId}.extra`, artifactIds: [EXTRA_ID] };
  const kept = renumberedEvents([...events, extra]);
  const store = await copiedTraceStore(trace, kept);
  const manifest = await store.readManifest(trace.traceId);
  const first = manifest?.artifacts[0];
  if (manifest === undefined || first === undefined) throw new Error("the copy has no manifest or artifact");
  const bytes = new TextEncoder().encode("<doc>extra</doc>");
  // A client's upload the trace holds no bytes for is one the replay cannot take.
  if (stream === "control") await store.writeArtifact(trace.traceId, EXTRA_ID, bytes);
  const entry = { ...first, id: EXTRA_ID, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength, sequence: kept.length };
  await store.writeManifest({
    ...manifest,
    streams: stream === "control" ? [...manifest.streams, "control"] : manifest.streams,
    artifacts: [...manifest.artifacts, entry],
    completeness: { ...manifest.completeness, lastSequence: kept.length }
  });
  return { store, sequence: kept.length };
}

describe("parity of a host's own artifact", () => {
  it("classes a sessionless control-stream artifact as outside, and the verdict stays matched", async () => {
    const trace = await recordUpload("trace.host-parity.outside");
    const { store, sequence } = await withExtraArtifact(trace, "control");
    const report = await replayClientGatewayTrace({ store, traceId: trace.traceId });
    expect(report.entries.find((entry) => entry.sequence === sequence)).toMatchObject({ kind: "artifact", status: "outside", replaySequence: null });
    expect(report.divergences).toEqual([]);
    expect(report.verdict).toBe("matched");
  });

  it("still diverges for a client upload on the tap's artifact stream that the replay lacks", async () => {
    const trace = await recordUpload("trace.host-parity.upload");
    const { store, sequence } = await withExtraArtifact(trace, "artifact");
    const report = await replayClientGatewayTrace({ store, traceId: trace.traceId });
    expect(report.entries.find((entry) => entry.sequence === sequence)?.status).not.toBe("outside");
    expect(report.verdict).toBe("diverged");
  });
});
