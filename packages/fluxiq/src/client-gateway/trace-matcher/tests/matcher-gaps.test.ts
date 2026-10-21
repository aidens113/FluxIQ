// P4b: what the trace matcher answers when the trace cannot support a command.
// Changed arguments, target or order are evidence gaps and never receive the
// recorded success (T07); nothing recorded after the matched point is ever
// delivered (T10); an incomplete or incompatible trace is refused and answers
// every command with its gap (T14); and a command the trace cannot answer is
// answered with a gap, never reaching a live session (T20).

import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActionResult } from "../../index.ts";
import { copiedTraceStore, recordedTraceEvents } from "../../trace-replay/tests/trace-copy.ts";
import { ACTIONS, message, recordEpisode, stateUpdate, succeeded, type Recorded, type Script } from "./episode-recording.ts";
import { openTrial } from "./trial-gateway.ts";

const SEARCH = { actionType: "example.search", parameters: { query: "lamps", page: 1 }, target: { ref: "search-box" } };
const OPEN = { actionType: "example.open", parameters: { index: 0 } };
/** A refused trace yields no recorded session view, so the trial supplies one to send its commands through. */
const SUPPLIED_VIEW = { clientType: "extension" as const, capabilities: [ACTIONS] };
const SCRIPT: Script = (command) => [{ delayMs: 1, act: (client, commandId) => client.say(succeeded(commandId, { answered: command.actionType })) }];

/** Search, a state event, open, another state event. */
async function recordTwoSteps(traceId: string): Promise<Recorded> {
  return recordEpisode({
    traceId,
    script: SCRIPT,
    drive: async (episode) => {
      await episode.execute(SEARCH);
      await episode.say(stateUpdate({ step: "one" }));
      await episode.execute(OPEN);
      await episode.say(stateUpdate({ step: "two" }));
    }
  });
}

function failure(result: ClientGatewayActionResult): unknown {
  return { status: result.status, code: result.failure?.code, retryable: result.failure?.retryable, effect: result.failure?.effect };
}

function gapOf(code: string): unknown {
  return { status: "failed", code, retryable: false, effect: "unacted" };
}

/** Whether every text fed was a gap answer the matcher wrote, never a recorded one. */
function onlyGapAnswers(fed: readonly string[]): boolean {
  return fed.every((text) => (JSON.parse(text) as { id: string }).id.startsWith("trace-gap."));
}

describe("the trace matcher where the trace holds no support", () => {
  it("answers changed arguments with an argument mismatch naming the field, and never the recorded success (T07)", async () => {
    const recorded = await recordTwoSteps("trace.gap.arguments");
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });

    const changed = await trial.execute({ ...SEARCH, parameters: { query: "chairs", page: 1 } });
    const next = await trial.execute(OPEN);
    await trial.matcher.settled();
    const report = trial.matcher.report();

    expect(failure(changed)).toEqual(gapOf("argument_mismatch"));
    expect(failure(next)).toEqual(gapOf("missing_transition"));
    expect(report.gaps).toMatchObject([
      { ordinal: 1, actionType: "example.search", reason: "argument_mismatch", cause: "mismatch", fields: ["parameters.query"] },
      { ordinal: 2, actionType: "example.open", reason: "missing_transition", cause: "after_gap", fields: [] }
    ]);
    expect(JSON.stringify(report.gaps)).not.toContain("chairs");
    expect(report.matchedOperations).toEqual([]);
    expect(onlyGapAnswers(trial.fed)).toBe(true);
    await trial.close();
  });

  it("answers a changed target with an argument mismatch on the target (T07)", async () => {
    const recorded = await recordTwoSteps("trace.gap.target");
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });

    const changed = await trial.execute({ ...SEARCH, target: { ref: "other-box" } });
    await trial.matcher.settled();

    expect(failure(changed)).toEqual(gapOf("argument_mismatch"));
    expect(trial.matcher.report().gaps).toMatchObject([{ reason: "argument_mismatch", fields: ["target.ref"] }]);
    expect(onlyGapAnswers(trial.fed)).toBe(true);
    await trial.close();
  });

  it("answers a changed order as an operation recorded only elsewhere, and consumes no recorded suffix (T07)", async () => {
    const recorded = await recordTwoSteps("trace.gap.order");
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });

    const early = await trial.execute(OPEN);
    const late = await trial.execute(SEARCH);
    await trial.matcher.settled();

    expect(failure(early)).toEqual(gapOf("ambiguous_context"));
    expect(failure(late)).toEqual(gapOf("missing_transition"));
    expect(trial.matcher.report().gaps.map((gap) => gap.cause)).toEqual(["mismatch", "after_gap"]);
    expect(onlyGapAnswers(trial.fed)).toBe(true);
    await trial.close();
  });

  it("answers a new operation, and one past the recorded end, with a missing transition (T07)", async () => {
    const recorded = await recordTwoSteps("trace.gap.new");
    const added = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });
    expect(failure(await added.execute({ actionType: "example.delete" }))).toEqual(gapOf("missing_transition"));

    const beyond = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });
    await beyond.execute(SEARCH);
    await beyond.execute(OPEN);
    expect(failure(await beyond.execute(OPEN))).toEqual(gapOf("missing_transition"));
    expect(beyond.matcher.report().gaps).toMatchObject([{ ordinal: 3, cause: "past_recorded_end", recordedSequence: null }]);
    await added.close();
    await beyond.close();
  });

  it("never delivers what the trace recorded after the matched point (T10)", async () => {
    const recorded = await recordTwoSteps("trace.gap.future");
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });

    await trial.execute(SEARCH);
    await trial.matcher.settled();
    const afterFirst = [...trial.fed];
    await trial.execute({ ...OPEN, parameters: { index: 5 } });
    await trial.matcher.settled();
    const fed = trial.fed.join("\n");

    expect(afterFirst).toHaveLength(2);
    expect(afterFirst[1]).toContain("\"step\":\"one\"");
    expect(fed).not.toContain("\"step\":\"two\"");
    expect(fed).not.toContain("\"answered\":\"example.open\"");
    const events = await recordedTraceEvents(recorded.trace);
    const secondOperation = events.filter((event) => event.messageType === "server.execute_action" && event.kind === "outbound")[1]!;
    expect(trial.matcher.report().deliveredSequences.every((sequence) => sequence < secondOperation.sequence)).toBe(true);
    await trial.close();
  });

  it("refuses a trace with a missing sequence and answers every command with its gap, never a recorded answer (T14)", async () => {
    const recorded = await recordTwoSteps("trace.gap.incomplete");
    const events = await recordedTraceEvents(recorded.trace);
    const store = await copiedTraceStore(recorded.trace, events.filter((event) => event.sequence !== 3));
    const trial = await openTrial({ store, traceId: recorded.trace.traceId, sessionView: SUPPLIED_VIEW });

    const first = await trial.execute(SEARCH);
    const second = await trial.execute(OPEN);
    await trial.matcher.settled();
    const report = trial.matcher.report();

    expect(failure(first)).toEqual(gapOf("incomplete_capture"));
    expect(failure(second)).toEqual(gapOf("incomplete_capture"));
    expect(report.refusal).toMatchObject({ reason: "incomplete_capture", detail: expect.stringContaining("sequence_gap") });
    expect(report.gaps.map((gap) => gap.cause)).toEqual(["refused_trace", "refused_trace"]);
    expect(report.deliveredSequences).toEqual([]);
    expect(onlyGapAnswers(trial.fed)).toBe(true);
    await trial.close();
  });

  it("refuses a trace recorded under a contract version this reader does not speak (T14)", async () => {
    const recorded = await recordTwoSteps("trace.gap.contract");
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, contractVersions: { protocol: `${CLIENT_GATEWAY_PROTOCOL_VERSION}.next` }, sessionView: SUPPLIED_VIEW });

    const result = await trial.execute(SEARCH);
    await trial.matcher.settled();

    expect(failure(result)).toEqual(gapOf("incompatible_contract"));
    expect(trial.matcher.report().refusal?.reason).toBe("incompatible_contract");
    expect(onlyGapAnswers(trial.fed)).toBe(true);
    await trial.close();
  });

  it("answers a command the trace cannot serve with a gap that never reaches a live session (T20)", async () => {
    const recorded = await recordTwoSteps("trace.gap.live");
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });
    const liveSent: string[] = [];
    const live = trial.gateway.connect({ socket: { send: (raw) => { liveSent.push(raw); } } });
    await trial.gateway.receiveRaw(live.sessionId, message("client.hello", { clientId: "client.live", clientType: "extension", name: "client.live", capabilities: [{ id: "example.actions", kind: "action" }] }));
    const pairing = trial.gateway.snapshot().pairings.find((item) => item.requestedBySessionId === live.sessionId);
    if (pairing) await trial.gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.live" });

    const result = await trial.execute({ actionType: "example.transfer", parameters: { amount: 10 } });
    await trial.matcher.settled();

    expect(failure(result)).toEqual(gapOf("missing_transition"));
    expect(liveSent.map((raw) => (JSON.parse(raw) as { type: string }).type)).not.toContain("server.execute_action");
    expect(onlyGapAnswers(trial.fed)).toBe(true);
    await trial.close();
  });
});
