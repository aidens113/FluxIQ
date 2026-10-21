// P4 honest outcomes: a recorded event or artifact the trace matcher cannot
// read or feed is a structured evidence gap at the operation it was delivered
// after (or at none, before the first), never a free-text note and never a
// silent skip; from then on every command is answered as after any other gap.

import { describe, expect, it } from "vitest";
import { ClientGatewayTraceMemoryStore, type ClientGatewayActionResult, type ClientGatewayTraceEvent } from "../../index.ts";
import { copiedTraceStore, recordedTraceEvents, renumberedEvents } from "../../trace-replay/tests/trace-copy.ts";
import type { OpenTrace } from "../../tests/trace-tap-support.ts";
import { message, recordEpisode, stateUpdate, succeeded, type Script } from "./episode-recording.ts";
import { openTrial } from "./trial-gateway.ts";

const SEARCH = { actionType: "example.search", parameters: { query: "lamps", page: 1 }, target: { ref: "search-box" } };
const OPEN = { actionType: "example.open", parameters: { index: 0 } };

/** Search answers with rows and an uploaded artifact; open answers with an item. */
const SCRIPT: Script = (command) => {
  if (command.actionType === "example.search") {
    return [{
      delayMs: 2,
      act: (client, commandId) => {
        const sha256 = client.upload(new TextEncoder().encode("<rows/>"), "text/plain");
        const references = { artifacts: [{ sha256, mediaType: "text/plain", byteLength: 7, role: "primary" }], unavailable: 0 };
        client.say(message("client.action_result", { commandId, status: "succeeded", payload: { rows: [1, 2, 3] }, metadata: { trace: references } }));
      }
    }];
  }
  return [{ delayMs: 3, act: (client, commandId) => client.say(succeeded(commandId, { item: "lamp-1" })) }];
};

/** Answers every command with a plain success, uploading nothing. */
const PLAIN: Script = (command) => [{ delayMs: 1, act: (client, commandId) => client.say(succeeded(commandId, { answered: command.actionType })) }];

/** Search, a state event, open. */
async function recordSearchThenOpen(traceId: string, script: Script = SCRIPT) {
  return recordEpisode({
    traceId,
    script,
    drive: async (episode) => {
      await episode.execute(SEARCH);
      await episode.say(stateUpdate({ step: "between" }));
      await episode.execute(OPEN);
    }
  });
}

/**
 * The recorded events with the state event and its disposition moved before
 * the first operation (a trace claims a session only at its first command, so
 * a recording cannot put one there itself), the state event's message
 * unreadable: written down as not serializable at capture.
 */
function unreadableOpening(events: readonly ClientGatewayTraceEvent[]): { events: ClientGatewayTraceEvent[]; opening: ClientGatewayTraceEvent } {
  const state = events.find((event) => event.kind === "inbound" && event.messageType === "client.state_update");
  const disposition = events.find((event) => event.kind === "disposition" && event.correlation.causationEventId === state?.eventId);
  const first = events.find((event) => event.kind === "outbound" && event.messageType === "server.execute_action");
  if (state === undefined || disposition === undefined || first === undefined) throw new Error("the recording holds no state event between its operations");
  const at = { ...state.time, logicalMs: first.time.logicalMs };
  const moved = [
    { ...state, time: at, payload: { encoding: "json" as const, value: { unserializable: true } } },
    { ...disposition, time: { ...disposition.time, logicalMs: first.time.logicalMs } }
  ];
  const rest = events.filter((event) => event !== state && event !== disposition);
  const index = rest.indexOf(first);
  const renumbered = renumberedEvents([...rest.slice(0, index), ...moved, ...rest.slice(index)]);
  return { events: renumbered, opening: renumbered[index]! };
}

/** A memory store that lists every artifact it holds and then cannot read one back, as a store failing between admission and delivery. */
class UnreadableArtifactStore extends ClientGatewayTraceMemoryStore {
  override async readArtifact(_traceId: string, _artifactId: string): Promise<Uint8Array | undefined> {
    return undefined;
  }
}

/** A copy of `trace` in a store whose artifacts cannot be read back. */
async function storeLosingArtifacts(trace: OpenTrace): Promise<UnreadableArtifactStore> {
  const copy = new UnreadableArtifactStore();
  for (const artifact of await trace.store.listArtifacts(trace.traceId)) {
    const bytes = await trace.store.readArtifact(trace.traceId, artifact.id);
    if (bytes !== undefined) await copy.writeArtifact(trace.traceId, artifact.id, bytes);
  }
  await copy.appendEvents(trace.traceId, await recordedTraceEvents(trace));
  const manifest = await trace.store.readManifest(trace.traceId);
  if (manifest === undefined) throw new Error("the recorded trace has no manifest");
  await copy.writeManifest(manifest);
  return copy;
}

function failure(result: ClientGatewayActionResult): unknown {
  return { status: result.status, code: result.failure?.code, retryable: result.failure?.retryable, effect: result.failure?.effect };
}

describe("the trace matcher where a recorded delivery fails", () => {
  it("turns an unreadable recorded event before the first operation into a gap at no operation, and gaps every later command", async () => {
    const recorded = await recordSearchThenOpen("trace.delivery.unreadable", PLAIN);
    const { events, opening } = unreadableOpening(await recordedTraceEvents(recorded.trace));
    const store = await copiedTraceStore(recorded.trace, events);
    const trial = await openTrial({ store, traceId: recorded.trace.traceId });

    await trial.matcher.deliverOpening();
    const first = await trial.execute(SEARCH);
    await trial.matcher.settled();
    const report = trial.matcher.report();

    expect(report.refusal).toBeNull();
    expect(report.gaps).toEqual([
      { ordinal: 0, commandId: "", actionType: "", reason: "incomplete_capture", cause: "failed_delivery", fields: [], recordedSequence: opening.sequence },
      { ordinal: 1, commandId: first.commandId, actionType: "example.search", reason: "missing_transition", cause: "after_gap", fields: [], recordedSequence: null }
    ]);
    expect(failure(first)).toEqual({ status: "failed", code: "missing_transition", retryable: false, effect: "unacted" });
    expect(report.deliveredSequences).not.toContain(opening.sequence);
    expect(report.matchedOperations).toEqual([]);
    expect(report.refusedDeliveries).toEqual([]);
    await trial.close();
  });

  it("turns an artifact it cannot read back into a missing-artifact gap at the operation it answered, and gaps every later command", async () => {
    const recorded = await recordSearchThenOpen("trace.delivery.artifact");
    const events = await recordedTraceEvents(recorded.trace);
    const artifact = events.find((event) => event.kind === "artifact");
    if (artifact === undefined) throw new Error("the recording holds no artifact");
    const store = await storeLosingArtifacts(recorded.trace);
    const trial = await openTrial({ store, traceId: recorded.trace.traceId });

    await trial.matcher.deliverOpening();
    const search = await trial.execute(SEARCH);
    const open = await trial.execute(OPEN);
    await trial.matcher.settled();
    const report = trial.matcher.report();

    expect(report.refusal).toBeNull();
    expect(report.matchedOperations.map((operation) => operation.actionType)).toEqual(["example.search"]);
    expect(report.gaps).toEqual([
      { ordinal: 1, commandId: search.commandId, actionType: "example.search", reason: "missing_artifact", cause: "failed_delivery", fields: [], recordedSequence: artifact.sequence },
      { ordinal: 2, commandId: open.commandId, actionType: "example.open", reason: "missing_transition", cause: "after_gap", fields: [], recordedSequence: null }
    ]);
    expect(failure(open)).toEqual({ status: "failed", code: "missing_transition", retryable: false, effect: "unacted" });
    expect(report.deliveredSequences).not.toContain(artifact.sequence);
    expect(report.refusedDeliveries).toEqual([]);
    await trial.close();
  });
});
