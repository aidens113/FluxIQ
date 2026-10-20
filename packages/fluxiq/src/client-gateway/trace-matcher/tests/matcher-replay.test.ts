// P4b: a recorded episode answered from its trace through the trial gateway's
// own intake. The recorded run replays to the same results (original parity);
// the same call made twice is answered by its occurrence (T08); an
// acknowledgement, an unsolicited state event and the completion arrive in
// recorded order and the acknowledgement is not read as completion (T12); a
// recorded timeout feeds nothing and moves the clock past the recorded wait;
// a recorded reconcile answer reaches a session attached with the view the
// trace recorded; and node identity in metadata is not part of the key (T15).

import { describe, expect, it } from "vitest";
import { ANSWERS_RECONCILE, message, recordEpisode, stateUpdate, succeeded, type Script } from "./episode-recording.ts";
import { openTrial, typesOf, withoutCommandId } from "./trial-gateway.ts";

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

describe("the trace matcher answering a recorded run", () => {
  it("replays the recorded run to the same results through the intake", async () => {
    const recorded = await recordEpisode({
      traceId: "trace.matcher.parity",
      script: SCRIPT,
      drive: async (episode) => {
        await episode.execute(SEARCH);
        await episode.say(stateUpdate({ step: "results" }));
        await episode.execute(OPEN);
      }
    });
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });

    const first = await trial.execute(SEARCH);
    const second = await trial.execute(OPEN);
    await trial.matcher.settled();
    const report = trial.matcher.report();

    expect(withoutCommandId(first)).toEqual(withoutCommandId(recorded.results[0]!));
    expect(withoutCommandId(second)).toEqual(withoutCommandId(recorded.results[1]!));
    expect(first.commandId).not.toBe(recorded.results[0]!.commandId);
    expect(report.refusal).toBeNull();
    expect(report.gaps).toEqual([]);
    expect(report.matchedOperations.map((operation) => operation.actionType)).toEqual(["example.search", "example.open"]);
    expect(report.recordedOperations).toBe(2);
    expect(report.sourceEpisodeId).toBe("run.trace.matcher.parity");
    expect(report.refusedDeliveries).toEqual([]);
    expect(typesOf(trial.fed)).toEqual(["client.action_result", "client.state_update", "client.action_result"]);
    // The command id is the only thing translated: every other byte is the recorded text.
    expect(trial.fed[0]).toContain(JSON.stringify(first.commandId));
    expect(trial.fed[0]).not.toContain(recorded.results[0]!.commandId);
    await trial.close();
  });

  it("answers the same call made twice by its occurrence, not with the first recorded answer (T08)", async () => {
    const script: Script = (_command, occurrence) => [{ delayMs: 1, act: (client, commandId) => client.say(succeeded(commandId, { rows: occurrence === 1 ? [1] : [2] })) }];
    const recorded = await recordEpisode({
      traceId: "trace.matcher.occurrence",
      script,
      drive: async (episode) => {
        await episode.execute({ actionType: "example.read" });
        await episode.execute({ actionType: "example.read" });
      }
    });
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });

    const first = await trial.execute({ actionType: "example.read" });
    const second = await trial.execute({ actionType: "example.read" });

    expect(first.payload).toEqual({ rows: [1] });
    expect(second.payload).toEqual({ rows: [2] });
    await trial.close();
  });

  it("delivers an acknowledgement, an unsolicited state event, then the completion in recorded order (T12)", async () => {
    const script: Script = () => [
      { delayMs: 1, act: (client, commandId) => client.say(stateUpdate({ phase: "accepted" }, { commandId })) },
      { delayMs: 4, act: (client) => client.say(stateUpdate({ step: "moved" })) },
      { delayMs: 8, act: (client, commandId) => client.say(succeeded(commandId, { done: true })) }
    ];
    const recorded = await recordEpisode({ traceId: "trace.matcher.order", script, drive: async (episode) => { await episode.execute({ actionType: "example.submit" }); } });
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });
    let settled = false;
    const seen: { state: unknown; settled: boolean }[] = [];
    // Read the moment each text has been taken in, before the next recorded input is fed. A read deferred by a
    // turn of the event loop raced the next feed: the completion could already have settled the command.
    trial.afterFeed.current = (text) => {
      const state = (JSON.parse(text) as { payload: { state?: unknown } }).payload.state ?? "result";
      seen.push({ state, settled });
    };

    const response = trial.execute({ actionType: "example.submit" });
    void response.then(() => { settled = true; });
    const result = await response;
    await trial.matcher.settled();

    // Fed in recorded order; neither the acknowledgement nor the state event settled the command. The completion's
    // own entry is not asserted (its settle resolves a turn later); the result below is the completion's payload.
    expect(seen.map((entry) => entry.state)).toEqual([{ phase: "accepted" }, { step: "moved" }, "result"]);
    expect(seen.slice(0, 2).map((entry) => entry.settled)).toEqual([false, false]);
    expect(settled).toBe(true);
    expect(result).toMatchObject({ status: "succeeded", payload: { done: true } });
    // The acknowledgement keeps its correlation: it names the trial's command id.
    expect(trial.fed[0]).toContain(JSON.stringify(result.commandId));
    // The clock moved by the recorded deltas, which add up to the recorded completion latency.
    const events = await recorded.trace.events();
    const issued = events.find((event) => event.kind === "outbound" && event.messageType === "server.execute_action")!;
    const completed = events.find((event) => event.kind === "inbound" && event.messageType === "client.action_result")!;
    expect(trial.advances.reduce((sum, ms) => sum + ms, 0)).toBe(completed.time.logicalMs - issued.time.logicalMs);
    await trial.close();
  });

  it("feeds nothing for a recorded timeout and moves the clock past the recorded wait", async () => {
    const recorded = await recordEpisode({ traceId: "trace.matcher.timeout", commandTimeoutMs: 20, script: () => [], drive: async (episode) => { await episode.execute({ actionType: "example.wait" }); } });
    expect(recorded.results[0]).toMatchObject({ status: "timed_out" });
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, commandTimeoutMs: 20 });

    const result = await trial.execute({ actionType: "example.wait" });
    await trial.matcher.settled();

    expect(result).toMatchObject({ status: "timed_out" });
    expect(trial.fed).toEqual([]);
    expect(trial.advances.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThan(20);
    expect(trial.matcher.report().matchedOperations).toHaveLength(1);
    await trial.close();
  });

  it("attaches with the view the trace recorded, so the recorded reconcile answer settles the command as it did", async () => {
    const recorded = await recordEpisode({
      traceId: "trace.matcher.reconcile",
      commandTimeoutMs: 20,
      capabilities: [ANSWERS_RECONCILE],
      script: () => [],
      reconcile: () => [{ delayMs: 1, act: (client, commandId) => client.say(message("client.reconcile_result", { commandId, state: "not_seen" })) }],
      drive: async (episode) => { await episode.execute({ actionType: "example.press" }); }
    });
    expect(recorded.results[0]).toMatchObject({ status: "failed", metadata: { reconciled: "not_seen" } });
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, commandTimeoutMs: 20 });

    const result = await trial.execute({ actionType: "example.press" });
    await trial.matcher.settled();

    expect(trial.session.capabilities).toEqual([ANSWERS_RECONCILE]);
    expect(withoutCommandId(result)).toEqual(withoutCommandId(recorded.results[0]!));
    expect(typesOf(trial.fed)).toEqual(["client.reconcile_result"]);
    await trial.close();
  });

  it("does not key on node identity: two candidates with different node structure and the same operations both match (T15)", async () => {
    const recorded = await recordEpisode({
      traceId: "trace.matcher.nodes",
      script: SCRIPT,
      drive: async (episode) => {
        await episode.execute({ ...SEARCH, metadata: { node: "node.search" } });
        await episode.execute({ ...OPEN, metadata: { node: "node.open" } });
      }
    });
    const flat = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });
    const grouped = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId });

    const flatResults = [await flat.execute({ ...SEARCH, metadata: { node: "n1" } }), await flat.execute({ ...OPEN, metadata: { node: "n2" } })];
    const groupedResults: unknown[] = [];
    for (const step of [SEARCH, OPEN]) groupedResults.push(await grouped.execute({ ...step, timeoutMs: 30_000, metadata: { node: "subflow.browse/inner.1", flow: "flow.v2" } }));

    expect(flat.matcher.report().gaps).toEqual([]);
    expect(grouped.matcher.report().gaps).toEqual([]);
    expect(flatResults.map((result) => result.status)).toEqual(["succeeded", "succeeded"]);
    expect(groupedResults).toMatchObject([{ status: "succeeded", payload: { rows: [1, 2, 3] } }, { status: "succeeded", payload: { item: "lamp-1" } }]);
    await flat.close();
    await grouped.close();
  });
});
