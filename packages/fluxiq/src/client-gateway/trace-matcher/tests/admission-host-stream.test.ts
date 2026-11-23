// A trace may carry content a host recorded on its own stream (Automation
// Studio's control artifacts: a capture's start receipt, a control event's
// content). Such an event belongs to no session, so admission neither refuses
// the trace as "partly named" nor counts it as a second session when it looks
// for the trace's one session. A gateway event that lacks its reference is
// still refused.

import { describe, expect, it } from "vitest";
import { admitClientGatewayTraceForMatching, type ClientGatewayTraceEvent } from "../../index.ts";
import { copiedTraceStore, recordedTraceEvents, renumberedEvents } from "../../trace-replay/tests/trace-copy.ts";
import { recordEpisode, stateUpdate, succeeded, type Script } from "./episode-recording.ts";
import { PROTOCOL } from "./trial-gateway.ts";

const PLAIN: Script = (command) => [{ delayMs: 1, act: (client, commandId) => client.say(succeeded(commandId, { answered: command.actionType })) }];

/** An artifact as a host records it on its own stream: no session reference. */
function hostArtifact(after: ClientGatewayTraceEvent): ClientGatewayTraceEvent {
  const { session: _session, ...rest } = after;
  return { ...rest, eventId: `${after.eventId}.host`, sequence: after.sequence + 1, stream: "control", kind: "artifact", messageType: "recorded.start", payload: { encoding: "json", value: {} }, artifactIds: [], referencedDigests: [], redactions: [] };
}

/** The recording's events, with only its unsolicited state update kept beside its session records, then `extra` appended. */
async function storeWith(events: readonly ClientGatewayTraceEvent[], recorded: Awaited<ReturnType<typeof recordEpisode>>) {
  const kept = renumberedEvents(events);
  const store = await copiedTraceStore(recorded.trace, kept);
  const manifest = await store.readManifest(recorded.trace.traceId);
  if (manifest === undefined) throw new Error("the copy has no manifest");
  // A host that records on its own stream declares it, as Automation Studio's episodes declare `control`.
  await store.writeManifest({ ...manifest, streams: [...manifest.streams, "control"], completeness: { ...manifest.completeness, lastSequence: kept.length } });
  return store;
}

async function recordUpdateOnly() {
  const recorded = await recordEpisode({ traceId: `trace.host-stream.${Math.random().toString(36).slice(2)}`, script: PLAIN, drive: async (episode) => {
    await episode.execute({ actionType: "example.search", parameters: { query: "lamps" } });
    await episode.say(stateUpdate({ step: "after" }));
  } });
  const events = await recordedTraceEvents(recorded.trace);
  // No operation is left, so admission must find the trace's session from its session-bound events alone.
  const operationFree = events.filter((event) => !(event.kind === "outbound" && event.messageType === "server.execute_action") && event.messageType !== "client.action_result");
  return { recorded, operationFree };
}

describe("admitting a trace that carries a host's own artifact", () => {
  it("finds the trace's one session, never counting the host's artifact as a second", async () => {
    const { recorded, operationFree } = await recordUpdateOnly();
    const sessions = new Set(operationFree.filter((event) => event.stream === "gateway").map((event) => event.session));
    expect(sessions.size).toBe(1);
    const [session] = sessions;
    expect(session).toBeDefined();
    const last = operationFree[operationFree.length - 1]!;
    const store = await storeWith([...operationFree, hostArtifact(last)], recorded);
    const admission = await admitClientGatewayTraceForMatching({ store, traceId: recorded.trace.traceId, contractVersions: PROTOCOL });
    expect(admission.refusal).toBeNull();
    expect(admission.sessionRef).toBe(session);
  });

  it("still refuses a gateway event that lacks its session reference", async () => {
    const { recorded, operationFree } = await recordUpdateOnly();
    const lastGateway = [...operationFree].reverse().find((event) => event.stream === "gateway" && event.session !== undefined)!;
    const unnamed = operationFree.map((event) => {
      if (event !== lastGateway) return event;
      const { session: _session, ...rest } = event;
      return rest;
    });
    const admission = await admitClientGatewayTraceForMatching({ store: await storeWith(unnamed, recorded), traceId: recorded.trace.traceId, contractVersions: PROTOCOL });
    expect(admission.refusal).toEqual({ reason: "incomplete_capture", detail: "the trace's events do not say which session they belong to: some of its events name their session and others do not" });
  });
});
