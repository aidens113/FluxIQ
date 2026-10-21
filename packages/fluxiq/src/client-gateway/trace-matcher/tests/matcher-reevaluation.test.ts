// P5a: the trace matcher's reevaluation port. On a strict mismatch with the
// recorded operation at the cursor that keeps its action type, an optional
// reevaluator may answer the command from what the trace recorded up to the end
// of that operation's segment. Its answer replaces only the recorded result's
// payload; everything else in the segment is fed as recorded, and later
// commands still match strictly. A gap, a decline and a failure are each
// answered as the brief says; anything else never asks.

import { describe, expect, it } from "vitest";
import type { ClientGatewayActionResult, ClientGatewayTraceReevaluation, ClientGatewayTraceReevaluationRequest, ClientGatewayTraceReevaluator, ClientGatewayTraceStore } from "../../index.ts";
import { message, recordEpisode, stateUpdate, succeeded, type Recorded, type Script } from "./episode-recording.ts";
import { openTrial, typesOf, withoutCommandId } from "./trial-gateway.ts";

const SEARCH = { actionType: "example.search", parameters: { query: "lamps", page: 1 }, target: { ref: "search-box" } };
const CHANGED = { ...SEARCH, parameters: { query: "chairs", page: 1 } };
const OPEN = { actionType: "example.open", parameters: { index: 0 } };
const SCRIPT: Script = (command) => [{ delayMs: 1, act: (client, commandId) => client.say(succeeded(commandId, { answered: command.actionType })) }];

/** Search, a state event, open, another state event. */
async function recordTwoSteps(traceId: string, script: Script = SCRIPT, commandTimeoutMs?: number): Promise<Recorded> {
  return recordEpisode({
    traceId,
    script,
    ...(commandTimeoutMs === undefined ? {} : { commandTimeoutMs }),
    drive: async (episode) => {
      await episode.execute(SEARCH);
      await episode.say(stateUpdate({ step: "one" }));
      await episode.execute(OPEN);
      await episode.say(stateUpdate({ step: "two" }));
    }
  });
}

/** A reevaluator that answers every request with `answer` (or throws `answer`) and keeps what it was asked. */
function reevaluatorOf(answer: ClientGatewayTraceReevaluation | Error): ClientGatewayTraceReevaluator & { asked: ClientGatewayTraceReevaluationRequest[] } {
  const asked: ClientGatewayTraceReevaluationRequest[] = [];
  return {
    asked,
    reevaluate: async (request) => {
      asked.push(request);
      if (answer instanceof Error) throw answer;
      return answer;
    }
  };
}

function failure(result: ClientGatewayActionResult): unknown {
  return { status: result.status, code: result.failure?.code, retryable: result.failure?.retryable, effect: result.failure?.effect };
}

const ANSWERED: ClientGatewayTraceReevaluation = { status: "answered", result: { status: "succeeded", payload: { answered: "reevaluated" } } };

describe("the trace matcher's reevaluation port", () => {
  it("answers a changed read with the reevaluated result, feeds the rest of the segment as recorded, and later commands still match strictly", async () => {
    const recorded = await recordTwoSteps("trace.reevaluate.answered");
    const reevaluator = reevaluatorOf(ANSWERED);
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, reevaluator });

    const changed = await trial.execute(CHANGED);
    const next = await trial.execute(OPEN);
    await trial.matcher.settled();
    const report = trial.matcher.report();

    expect(withoutCommandId(changed)).toMatchObject({ status: "succeeded", payload: { answered: "reevaluated" } });
    expect(withoutCommandId(next)).toEqual(withoutCommandId(recorded.results[1]!));
    expect(report.gaps).toEqual([]);
    expect(report.matchedOperations).toMatchObject([
      { ordinal: 1, actionType: "example.search", answeredFrom: "reevaluated", fields: ["parameters.query"] },
      { ordinal: 2, actionType: "example.open", answeredFrom: "recorded", fields: [] }
    ]);
    expect(typesOf(trial.fed)).toEqual(["client.action_result", "client.state_update", "client.action_result", "client.state_update"]);
    expect(trial.fed[1]).toContain("\"step\":\"one\"");
    expect(trial.fed.join("\n")).not.toContain("\"answered\":\"example.search\"");
    // Only the payload was replaced: the recorded envelope stays, the payload's command id is the trial's.
    const fedResult = JSON.parse(trial.fed[0]!) as { id: string; payload: { commandId: string } };
    expect(fedResult.payload.commandId).toBe(changed.commandId);
    expect(fedResult.id).not.toMatch(/^trace-gap\./);
    expect(reevaluator.asked).toHaveLength(1);
    const request = reevaluator.asked[0]!;
    expect(request.traceId).toBe(recorded.trace.traceId);
    expect(request.command).toMatchObject({ commandId: changed.commandId, actionType: "example.search", parameters: { query: "chairs" } });
    expect(request.operation.actionType).toBe("example.search");
    expect(request.recorded).toMatchObject({ actionType: "example.search", commandId: recorded.results[0]!.commandId });
    expect(request.recordedCommand).toMatchObject({ commandId: recorded.results[0]!.commandId, parameters: { query: "lamps" } });
    expect(request.fields).toEqual(["parameters.query"]);
    expect(request.recordedResult).toMatchObject({ commandId: recorded.results[0]!.commandId, status: "succeeded", payload: { answered: "example.search" } });
    expect(request.artifacts).toEqual([]);
    await trial.close();
  });

  it("lists and reads only the artifacts recorded up to the end of the operation's segment", async () => {
    const encoder = new TextEncoder();
    const uploads: Script = (command) => [{
      delayMs: 1,
      act: (client, commandId) => {
        client.upload(encoder.encode(`<${command.actionType}/>`), "text/html");
        client.say(succeeded(commandId, { answered: command.actionType }));
      }
    }];
    const recorded = await recordTwoSteps("trace.reevaluate.artifacts", uploads);
    const manifest = await recorded.trace.store.readManifest(recorded.trace.traceId);
    const [searchArtifact, openArtifact] = manifest!.artifacts;
    const read: (Uint8Array | undefined)[] = [];
    const reevaluator: ClientGatewayTraceReevaluator = {
      reevaluate: async (request) => {
        expect(request.artifacts).toEqual([{ id: searchArtifact!.id, sha256: searchArtifact!.sha256, mediaType: "text/html", sequence: searchArtifact!.sequence }]);
        read.push(await request.readArtifact(searchArtifact!.sha256), await request.readArtifact(openArtifact!.sha256), await request.readArtifact("0".repeat(64)));
        return ANSWERED;
      }
    };
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, reevaluator });

    await trial.execute(CHANGED);
    await trial.matcher.settled();

    expect(manifest!.artifacts).toHaveLength(2);
    expect(read.map((bytes) => (bytes === undefined ? undefined : new TextDecoder().decode(bytes)))).toEqual(["<example.search/>", undefined, undefined]);
    expect(trial.matcher.report().gaps).toEqual([]);
    await trial.close();
  });

  it("answers the reevaluator's gap with its reason and fields, cause reevaluation, and diverges", async () => {
    const recorded = await recordTwoSteps("trace.reevaluate.gap");
    const reevaluator = reevaluatorOf({ status: "gap", reason: "snapshot_unavailable", fields: ["parameters.query"] });
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, reevaluator });

    const changed = await trial.execute(CHANGED);
    const next = await trial.execute(OPEN);
    await trial.matcher.settled();
    const report = trial.matcher.report();

    expect(failure(changed)).toEqual({ status: "failed", code: "snapshot_unavailable", retryable: false, effect: "unacted" });
    expect(failure(next)).toMatchObject({ code: "missing_transition" });
    expect(report.gaps).toMatchObject([
      { ordinal: 1, actionType: "example.search", reason: "snapshot_unavailable", cause: "reevaluation", fields: ["parameters.query"] },
      { ordinal: 2, cause: "after_gap" }
    ]);
    expect(report.matchedOperations).toEqual([]);
    expect(report.deliveredSequences).toEqual([]);
    await trial.close();
  });

  it("keeps today's mismatch gap when the reevaluator declines", async () => {
    const recorded = await recordTwoSteps("trace.reevaluate.declined");
    const reevaluator = reevaluatorOf({ status: "declined" });
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, reevaluator });

    const changed = await trial.execute(CHANGED);
    await trial.matcher.settled();

    expect(reevaluator.asked).toHaveLength(1);
    expect(failure(changed)).toMatchObject({ code: "argument_mismatch" });
    expect(trial.matcher.report().gaps).toEqual([
      { ordinal: 1, commandId: changed.commandId, actionType: "example.search", reason: "argument_mismatch", cause: "mismatch", fields: ["parameters.query"], recordedSequence: expect.any(Number) }
    ]);
    await trial.close();
  });

  it("answers a reevaluator that throws with an incomplete-capture gap, never a pass, and keeps its message", async () => {
    const recorded = await recordTwoSteps("trace.reevaluate.throws");
    const reevaluator = reevaluatorOf(new Error("sandbox crashed"));
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, reevaluator });

    const changed = await trial.execute(CHANGED);
    await trial.matcher.settled();
    const report = trial.matcher.report();

    expect(failure(changed)).toMatchObject({ status: "failed", code: "incomplete_capture" });
    expect(report.gaps).toMatchObject([{ ordinal: 1, reason: "incomplete_capture", cause: "reevaluation" }]);
    expect(report.matchedOperations).toEqual([]);
    expect(report.refusedDeliveries.some((note) => note.includes("sandbox crashed"))).toBe(true);
    await trial.close();
  });

  it("never asks about another action type, a command past the recorded end, or a strict match", async () => {
    const recorded = await recordTwoSteps("trace.reevaluate.never");
    const order = reevaluatorOf(ANSWERED);
    const reordered = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, reevaluator: order });
    expect(failure(await reordered.execute(OPEN))).toMatchObject({ code: "ambiguous_context" });
    await reordered.matcher.settled();
    expect(order.asked).toEqual([]);

    const beyond = reevaluatorOf(ANSWERED);
    const past = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, reevaluator: beyond });
    await past.execute(SEARCH);
    await past.execute(OPEN);
    expect(failure(await past.execute(OPEN))).toMatchObject({ code: "missing_transition" });
    await past.matcher.settled();
    expect(beyond.asked).toEqual([]);
    expect(past.matcher.report().matchedOperations.map((operation) => operation.answeredFrom)).toEqual(["recorded", "recorded"]);
    expect(past.matcher.report().gaps).toMatchObject([{ cause: "past_recorded_end" }]);
    await reordered.close();
    await past.close();
  });

  it("never asks about a recorded operation whose fields were withheld at capture: it stays a redacted-input gap", async () => {
    const recorded = await recordTwoSteps("trace.reevaluate.redacted");
    const store = recorded.trace.store;
    const events = await store.readEventRange(recorded.trace.traceId, 1, Number.MAX_SAFE_INTEGER);
    const firstCommand = events.find((event) => event.messageType === "server.execute_action")?.sequence;
    const withheld: ClientGatewayTraceStore = Object.assign(Object.create(store) as ClientGatewayTraceStore, {
      readEventRange: async (traceId: string, from: number, to: number) => (await store.readEventRange(traceId, from, to)).map((event) =>
        event.sequence === firstCommand ? { ...event, redactions: [{ path: "payload.parameters.query", reason: "secret" as const }] } : event)
    });
    const asked = reevaluatorOf(ANSWERED);
    const trial = await openTrial({ store: withheld, traceId: recorded.trace.traceId, reevaluator: asked });
    expect(failure(await trial.execute(CHANGED))).toMatchObject({ code: "redacted_input" });
    await trial.matcher.settled();
    expect(asked.asked).toEqual([]);
    expect(trial.matcher.report().gaps).toMatchObject([{ reason: "redacted_input", cause: "mismatch" }]);
    await trial.close();
  });

  it("never asks when the segment does not hold exactly one result for the recorded command", async () => {
    const twice: Script = (command) => [{
      delayMs: 1,
      act: (client, commandId) => {
        client.say(succeeded(commandId, { answered: command.actionType }));
        client.say(message("client.action_result", { commandId, status: "succeeded", payload: { again: true } }));
      }
    }];
    const doubled = await recordTwoSteps("trace.reevaluate.two-results", twice);
    const asked = reevaluatorOf(ANSWERED);
    const trial = await openTrial({ store: doubled.trace.store, traceId: doubled.trace.traceId, reevaluator: asked });
    expect(failure(await trial.execute(CHANGED))).toMatchObject({ code: "argument_mismatch" });
    await trial.matcher.settled();
    expect(asked.asked).toEqual([]);

    const silent: Script = () => [];
    const unanswered = await recordEpisode({ traceId: "trace.reevaluate.no-result", script: silent, commandTimeoutMs: 20, drive: async (episode) => {
      await episode.execute(SEARCH);
    } });
    const none = reevaluatorOf(ANSWERED);
    const quiet = await openTrial({ store: unanswered.trace.store, traceId: unanswered.trace.traceId, reevaluator: none, commandTimeoutMs: 20 });
    expect(failure(await quiet.execute(CHANGED))).toMatchObject({ code: "argument_mismatch" });
    await quiet.matcher.settled();
    expect(none.asked).toEqual([]);
    await trial.close();
    await quiet.close();
  });
});
