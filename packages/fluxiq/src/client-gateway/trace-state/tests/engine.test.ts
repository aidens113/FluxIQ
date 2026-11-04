// The state rule behind the gateway's socket: a run answered from a recording by state,
// through Core's own intake, with ids translated. Only what the command caused is fed: a
// recorded answer the run did not cause is never delivered, and what it cannot answer is
// a gap the run reads as a failure.

import { describe, expect, it } from "vitest";
import { ClientGatewayService } from "../../service.ts";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActionCommand, type ClientGatewayActionResult } from "../../index.ts";
import { recordEpisode, stateUpdate, succeeded, type Script } from "../../trace-matcher/tests/episode-recording.ts";
import type { ClientGatewayTraceMatcherGateway } from "../../trace-matcher/index.ts";
import type { ClientGatewayChannelScopeSource } from "../../service/channel-scope/index.ts";
import type { ClientGatewayTraceStore } from "../../trace/index.ts";
import { ClientGatewayTraceStateEngine } from "../engine.ts";
import type { ClientGatewayTraceStateDomain } from "../types.ts";
import { fakeDomain, operation } from "./fake-domain.ts";

/** The fake domain over answers as the gateway carries them: the fields sit under `payload`. */
const domain: ClientGatewayTraceStateDomain = {
  ...fakeDomain,
  readAnswer: (answer) => fakeDomain.readAnswer(answer === null ? null : { ...(answer.payload as object), status: answer.status }),
  computeRead: (read, recorded) => {
    const flat = recorded.map((source) => ({ ...source, answer: { ...source.answer, ...(source.answer.payload as object) } }));
    const computed = fakeDomain.computeRead(read, flat);
    if (computed === null) return null;
    return { ...computed, answer: { status: "succeeded", payload: { rows: computed.rows, at: computed.answer.at } } };
  }
};

const SCAN: ClientGatewayActionCommand = { actionType: "scan", parameters: {} };
const GOTO: ClientGatewayActionCommand = { actionType: "goto", parameters: { to: "b" } };
const PICK: ClientGatewayActionCommand = { actionType: "pick", parameters: { part: "x" } };

/** Answers each command at once: a scan with the rows of the aisle the robot is in. */
function warehouse(): Script {
  let at = "a";
  return (command) => {
    if (command.actionType === "goto") at = (command.parameters as { to: string }).to;
    const answer = command.actionType === "scan" ? { at, rows: JSON.stringify(at === "a" ? ["bolt-a", "nut-a"] : ["bolt-b"]) } : { at };
    return [{ delayMs: 1, act: (client, commandId) => client.say(succeeded(commandId, answer)) }];
  };
}

/** `rows` is sent as text, since a scripted answer's fields are flat: the domain reads it back. */
const readingRows: ClientGatewayTraceStateDomain = {
  ...domain,
  readAnswer: (answer) => {
    const payload = (answer?.payload ?? {}) as { rows?: unknown };
    const rows = typeof payload.rows === "string" ? JSON.parse(payload.rows) as unknown : payload.rows;
    return domain.readAnswer(answer === null ? null : { ...answer, payload: { ...payload, rows } });
  },
  computeRead: (read, recorded) => domain.computeRead(read, recorded.map((source) => {
    const payload = source.answer.payload as { rows?: unknown };
    return { ...source, answer: { ...source.answer, payload: { ...payload, rows: typeof payload.rows === "string" ? JSON.parse(payload.rows) as unknown : payload.rows } } };
  }))
};

async function openEngine(store: ClientGatewayTraceStore, traceId: string, chosen: ClientGatewayTraceStateDomain = readingRows, upToFirstChild = false) {
  const scope: ClientGatewayChannelScopeSource & { enter(id: string | undefined): void } = (() => {
    let current: string | undefined;
    return { current: () => current, enter: (id) => { current = id; } };
  })();
  const gateway = new ClientGatewayService({ commandTimeoutMs: 60_000, reconcileAnswerMs: 5_000, channelScope: scope });
  const fed: string[] = [];
  const port: ClientGatewayTraceMatcherGateway = {
    attachScopedSession: (attach) => gateway.attachScopedSession(attach),
    receiveRaw: async (sessionId, text) => {
      fed.push(text);
      await gateway.receiveRaw(sessionId, text);
    },
    receiveTraceArtifact: (sessionId, upload) => gateway.receiveTraceArtifact(sessionId, upload)
  };
  const engine = await ClientGatewayTraceStateEngine.load({
    store, traceId, gateway: port, clock: { advance: async () => undefined },
    contractVersions: { protocol: CLIENT_GATEWAY_PROTOCOL_VERSION }, domain: chosen, upToFirstChild
  });
  const session = engine.attach("scope.state");
  const execute = (command: ClientGatewayActionCommand): Promise<ClientGatewayActionResult> => {
    scope.enter("scope.state");
    try {
      return gateway.executeAction(session.sessionId, command).result;
    } finally {
      scope.enter(undefined);
    }
  };
  return { engine, fed, execute, close: () => gateway.close() };
}

async function recorded(traceId: string, commands: readonly ClientGatewayActionCommand[], script: Script = warehouse()) {
  return recordEpisode({ traceId, script, drive: async (episode) => {
    for (const command of commands) await episode.execute(command);
  } });
}

describe("the state engine behind the socket", () => {
  it("answers a Flow that repeats the exploration through the intake, and passes it", async () => {
    const trace = await recorded("trace.state.same", [SCAN, GOTO, SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    const first = await trial.execute(SCAN);
    await trial.execute(GOTO);
    const second = await trial.execute(SCAN);
    await trial.engine.settled();
    const report = trial.engine.report();

    expect(first).toMatchObject({ status: "succeeded", payload: { at: "a" } });
    expect(second).toMatchObject({ status: "succeeded", payload: { at: "b" } });
    expect(report.gaps).toEqual([]);
    expect(report.matchedOperations.map((answered) => answered.answeredFrom)).toEqual(["recorded", "recorded", "recorded"]);
    expect(report.verdict.verdict).toBe("pass");
    await trial.close();
  });

  it("answers a Flow that skips a read, by state and not by a cursor", async () => {
    const trace = await recorded("trace.state.skip", [SCAN, SCAN, GOTO, SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    await trial.execute(GOTO);
    const read = await trial.execute(SCAN);

    expect(read).toMatchObject({ status: "succeeded", payload: { at: "b" } });
    expect(trial.engine.report().gaps).toEqual([]);
    await trial.close();
  });

  it("never answers with a recorded answer the Flow did not cause: a read from after an act it never did is a gap the run reads as a failure", async () => {
    const trace = await recorded("trace.state.uncaused", [SCAN, PICK, SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    const first = await trial.execute(SCAN);
    const second = await trial.execute(SCAN);

    expect(first.status).toBe("succeeded");
    // The second recorded scan came after the pick this run never did, so its answer is never fed: the first stands again.
    expect(second).toMatchObject({ status: "succeeded" });
    const third = await trial.execute(SCAN);
    expect(third.status).toBe("succeeded");
    const report = trial.engine.report();
    expect(report.matchedOperations.map((answered) => answered.recordedSequence)).toEqual([report.matchedOperations[0]!.recordedSequence, report.matchedOperations[0]!.recordedSequence, report.matchedOperations[0]!.recordedSequence]);
    expect(report.verdict.verdict).toBe("fail");
    expect(report.verdict.reasons).toContain("recording.acts_covered");
    await trial.close();
  });

  it("answers an unrecorded act with a non-retryable gap, and a read after it is off the recording too", async () => {
    const trace = await recorded("trace.state.off", [SCAN, GOTO, SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    const act = await trial.execute({ actionType: "pick", parameters: { part: "never recorded" } });
    const read = await trial.execute(SCAN);
    await trial.engine.settled();
    const report = trial.engine.report();

    expect(act).toMatchObject({ status: "failed", failure: { code: "missing_transition", retryable: false, effect: "unacted" } });
    expect(read).toMatchObject({ status: "succeeded", payload: { rows: [] } });
    expect(report.gaps.map((gap) => [gap.reason, gap.cause, gap.wentOn])).toEqual([["missing_transition", "state_rule", false], ["after_unrecorded_act", "state_rule", true]]);
    expect(report.verdict.verdict).toBe("inconclusive");
    await trial.close();
  });

  it("goes on past a read gap: every gap comes back in one verdict, and nothing recorded answers it", async () => {
    const trace = await recorded("trace.state.goes-on", [SCAN, GOTO, SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    const first = await trial.execute({ actionType: "scan", parameters: { other: 1 } });
    const second = await trial.execute(GOTO);
    const third = await trial.execute({ actionType: "scan", parameters: { other: 2 } });
    const fourth = await trial.execute(SCAN);
    await trial.engine.settled();
    const report = trial.engine.report();

    expect(first).toMatchObject({ status: "succeeded", payload: { rows: [] } });
    expect(second).toMatchObject({ status: "succeeded", payload: { at: "b" } });
    expect(third).toMatchObject({ status: "succeeded", payload: { rows: [] } });
    expect(fourth).toMatchObject({ status: "succeeded", payload: { at: "b" } });
    expect(report.gaps.map((gap) => [gap.ordinal, gap.reason, gap.wentOn])).toEqual([[1, "argument_mismatch", true], [3, "argument_mismatch", true]]);
    expect(report.commandActions).toEqual(["scan", "goto", "scan", "scan"]);
    expect(report.verdict.verdict).toBe("inconclusive");
    await trial.close();
  });

  it("goes on past a page move it cannot answer, and refuses what depends on where the page went", async () => {
    const trace = await recorded("trace.state.move", [SCAN, GOTO, SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    await trial.execute(SCAN);
    const moved = await trial.execute({ actionType: "goto", parameters: { to: "never" } });
    const read = await trial.execute(SCAN);
    await trial.engine.settled();
    const report = trial.engine.report();

    expect(moved.status).toBe("succeeded");
    expect(read).toMatchObject({ status: "succeeded", payload: { rows: [] } });
    expect(report.gaps.map((gap) => [gap.reason, gap.wentOn])).toEqual([["missing_transition", true], ["after_unrecorded_move", true]]);
    await trial.close();
  });

  it("refuses to repeat a recorded act: a lasting act lands once", async () => {
    const trace = await recorded("trace.state.once", [PICK, SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    expect((await trial.execute(PICK)).status).toBe("succeeded");
    expect(await trial.execute(PICK)).toMatchObject({ status: "failed", failure: { code: "would_repeat_act" } });
    await trial.close();
  });

  it("feeds what arrived after a command the first time only, and never another command's answer", async () => {
    const trace = await recordEpisode({ traceId: "trace.state.segment", script: warehouse(), drive: async (episode) => {
      await episode.execute(SCAN);
      await episode.say(stateUpdate({ step: "looked" }));
      await episode.execute(GOTO);
    } });
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    await trial.execute(SCAN);
    await trial.execute(SCAN);
    await trial.engine.settled();

    const updates = trial.fed.filter((text) => (JSON.parse(text) as { type: string }).type === "client.state_update");
    expect(updates).toHaveLength(1);
    const results = trial.fed.filter((text) => (JSON.parse(text) as { type: string }).type === "client.action_result");
    expect(results).toHaveLength(2);
    await trial.close();
  });

  it("feeds a computed read in the recorded answer's place, and names it as computed", async () => {
    const trace = await recorded("trace.state.computed", [SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    const read = await trial.execute({ actionType: "scan", parameters: { keep: "bolt" } });
    await trial.engine.settled();
    const report = trial.engine.report();

    expect(read).toMatchObject({ status: "succeeded", payload: { rows: ["bolt-a"] } });
    expect(report.matchedOperations.map((answered) => answered.answeredFrom)).toEqual(["computed"]);
    expect(report.gaps).toEqual([]);
    expect(report.end.rows).toEqual(["bolt-a"]);
    expect(report.verdict.verdict).toBe("fail");
    expect(report.verdict.reasons).toEqual(["recording.same_rows"]);
    await trial.close();
  });

  it("never compares the trial's own bookkeeping with the recording: it is not the Flow, and the verdict does not read it", async () => {
    const trace = await recorded("trace.state.bookkeeping", [SCAN]);
    const trial = await openEngine(trace.trace.store, trace.trace.traceId);

    await trial.execute(SCAN);
    const endView = await trial.execute({ actionType: "scan", parameters: { includeHidden: true }, metadata: { callId: "result-check.end-view" } });
    await trial.engine.settled();
    const report = trial.engine.report();

    expect(endView.status).toBe("failed");
    expect(report.bookkeepingCommands).toBe(1);
    expect(report.gaps).toEqual([]);
    expect(report.verdict.verdict).toBe("pass");
    await trial.close();
  });

  it("answers every command with its gap on a refused trace", async () => {
    const trace = await recorded("trace.state.refused", [SCAN]);
    const scopeless = await ClientGatewayTraceStateEngine.load({
      store: trace.trace.store, traceId: "trace.state.absent", gateway: { attachScopedSession: () => { throw new Error("unused"); }, receiveRaw: async () => undefined, receiveTraceArtifact: () => { throw new Error("unused"); } },
      clock: { advance: async () => undefined }, contractVersions: { protocol: CLIENT_GATEWAY_PROTOCOL_VERSION }, domain: readingRows
    });
    expect(scopeless.report().refusal?.reason).toBe("incomplete_capture");
    expect(scopeless.sessionView()).toBeNull();
    expect(operation("scan").actionType).toBe("scan");
  });
});
