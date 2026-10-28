// P6 (t769, F2): an offline subflow trial runs a brief's proposal through the
// same partial trial runner as a live one, its world that brief's recorded
// live `test` trace. A proposal whose operations match the trace runs on
// recorded support throughout, its own capture a derived trace naming the
// source; a proposal that adds a command meets an explicit gap there, is
// inconclusive, and nothing recorded after the gap is delivered (T09). It
// keeps the whole-candidate runner's rules: never in exploration, the recorded
// session view first, else a supplied one, else refused, and a reevaluator's
// answers listed.
import { afterEach, describe, expect, it } from "vitest";
import { isClientGatewayTraceLive, type ClientGatewayClientHello, type ClientGatewayTraceReevaluator } from "../../../../../../client-gateway/index.ts";
import { isAutomationStudioTrialEvidenceLiveSuccess } from "../../../../model/index.ts";
import { keptOrdinals, offlineHarness, type OfflineHarness } from "./offline-harness.ts";
import { runOfflineSubflow, subflowHarness, subflowOf } from "./subflow-harness.ts";
import { withoutClaims } from "./without-claims.ts";

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

/** A traced harness, its subflow ports, and a live partial trial of `queries` recorded into the first trace. */
async function recorded(queries: readonly string[] = ["lamps", "desks"]) {
  harness = await offlineHarness();
  const subflows = subflowHarness(harness);
  const proposal = subflowOf({ queries, threshold: 10 });
  const live = await subflows.recordLive(proposal);
  expect(live.outcome.record).toMatchObject({ execution: "succeeded", verdict: "yes" });
  expect(harness.live.commands()).toHaveLength(queries.length);
  return { harness, subflows, proposal, live };
}

/** The offline subflow trial that ran, or a throw naming why it was refused. */
async function ran(result: ReturnType<typeof runOfflineSubflow>) {
  const offline = await result;
  if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
  return offline;
}

/** The run's attempts of one plan node, by its key, in order. */
function attemptsOf(harness: OfflineHarness, runId: string | undefined, nodeKey: string) {
  return (runId === undefined ? [] : harness.executed.get(runId)?.attempts ?? []).filter((attempt) => attempt.nodeId.endsWith(`.${nodeKey}`));
}

describe("an offline subflow trial of the recorded proposal", () => {
  it("matches every recorded operation, reproduces the recorded outcome, and records a derived trace naming its source", async () => {
    const { harness, subflows, proposal, live } = await recorded();

    const offline = await ran(runOfflineSubflow(harness, subflows, proposal, live.traceId));

    expect(offline.matcher.refusal).toBeNull();
    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.matcher.matchedOperations.map((operation) => operation.ordinal)).toEqual([1, 2]);
    expect(offline.matcher.sourceEpisodeId).toBe(live.outcome.result.trialRunId);
    expect(offline.supported).toEqual({ matchedOperations: 2, recordedOperations: 2 });
    expect(offline.sessionView).toBe("recorded");
    expect(offline.normalizations).toEqual([]);
    expect(offline.reevaluated).toEqual([]);
    expect(offline.trial.record).toMatchObject({ execution: "succeeded", verdict: "yes", start: { status: "not_reset" }, revision: 1, digest: "lamps.1" });
    expect(offline.trial.result).toMatchObject({ partial: true, scope: "subflow", verdict: "yes" });
    expect(offline.trial.result.trialRunId).not.toBe(live.outcome.result.trialRunId);
    // The same rows were read and the same computation kept the same of them.
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual([2, 3]);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual(keptOrdinals(harness, live.outcome.result.trialRunId, "keep"));
    expect(offline.evidence).toEqual({
      verdict: "pass",
      evidenceOrigins: ["recorded", "pure_computation"],
      scope: "full_recorded_path",
      candidateRevision: 1,
      candidateDigest: "lamps.1",
      goalContractVersion: "plan.offline",
      sourceEpisodeIds: [live.outcome.result.trialRunId],
      liveEpisodeId: null,
      supported: { observations: offline.matcher.deliveredSequences.map((sequence) => `${live.traceId}#${sequence}`), operations: ["example.read#1", "example.read#2"] },
      assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "satisfied" }],
      reasonCodes: [],
      missingEvidence: [],
      provenance: "original"
    });
    expect(isAutomationStudioTrialEvidenceLiveSuccess(offline.evidence)).toBe(false);
    // Its own capture is a derived replay of the trace it ran on, never live.
    const own = await harness.store.readManifest("trace.offline-2");
    expect(own).toMatchObject({ episodeId: offline.trial.result.trialRunId, activity: "test", origin: { kind: "derived", derivation: "replay", sourceTraceIds: [live.traceId] } });
    expect(isClientGatewayTraceLive(own!)).toBe(false);
    // The scoped judge was asked about the new run (not answered from the recorded one), and no live client was reached.
    expect(subflows.judged).toHaveLength(2);
    expect(harness.live.commands()).toHaveLength(2);
    expect(harness.localDispatches).toEqual([]);
    expect(harness.live.errors).toEqual([]);
  });
});

describe("an offline subflow trial of a proposal that adds a command (T09)", () => {
  it("answers the added command with an explicit gap, is inconclusive, and delivers nothing recorded after the gap", async () => {
    const { harness, subflows, live } = await recorded(["lamps", "desks"]);
    const events = await harness.store.readEventRange(live.traceId, 1, Number.MAX_SAFE_INTEGER);
    const commands = events.filter((event) => event.messageType === "server.execute_action");
    expect(commands).toHaveLength(2);

    const offline = await ran(runOfflineSubflow(harness, subflows, subflowOf({ queries: ["lamps", "chairs", "desks"], threshold: 10 }, 2), live.traceId));

    expect(offline.matcher.gaps).toHaveLength(1);
    expect(offline.matcher.gaps[0]).toMatchObject({ ordinal: 2, actionType: "example.read", reason: "argument_mismatch", cause: "mismatch" });
    expect(offline.matcher.matchedOperations.map((operation) => operation.ordinal)).toEqual([1]);
    expect(offline.supported).toEqual({ matchedOperations: 1, recordedOperations: 2 });
    // Nothing recorded from the second recorded command on reached the trial.
    expect(offline.matcher.deliveredSequences.length).toBeGreaterThan(0);
    expect(offline.matcher.deliveredSequences.every((sequence) => sequence < commands[1]!.sequence)).toBe(true);
    // The added read failed on the gap, so the recorded read after it never ran and nothing was judged.
    expect(attemptsOf(harness, offline.trial.result.trialRunId, "read2").map((attempt) => attempt.status)).toEqual(["failed"]);
    expect(attemptsOf(harness, offline.trial.result.trialRunId, "read3")).toEqual([]);
    expect(offline.trial.record).toMatchObject({ execution: "failed", verdict: "execution_failed", revision: 2, digest: "lamps.2" });
    expect(subflows.judged).toHaveLength(1);
    expect(offline.evidence).toMatchObject({
      verdict: "inconclusive",
      scope: "segment",
      candidateRevision: 2,
      candidateDigest: "lamps.2",
      reasonCodes: ["argument_mismatch"],
      assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "unverified" }],
      missingEvidence: [{ reasonCode: "argument_mismatch", scope: "segment", operation: "example.read#2" }]
    });
    expect(harness.live.commands()).toHaveLength(2);
    expect(harness.localDispatches).toEqual([]);
  });
});

describe("an offline subflow trial with a reevaluator", () => {
  it("runs a changed read on the reevaluated answer and lists the operation, never a value", async () => {
    const { harness, subflows, live } = await recorded(["lamps"]);
    const asked: unknown[] = [];
    const reevaluator: ClientGatewayTraceReevaluator = {
      reevaluate: async (request) => {
        asked.push(request);
        return { status: "answered", result: { status: "succeeded", payload: { rows: [{ name: "desk-a", price: 30, stock: 1 }, { name: "desk-b", price: 3, stock: 0 }] } } };
      }
    };

    const offline = await ran(runOfflineSubflow(harness, subflows, subflowOf({ queries: ["desks"], threshold: 10 }, 2), live.traceId, "repair", { reevaluator }));

    expect(asked).toHaveLength(1);
    expect(offline.matcher.gaps).toEqual([]);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual([1]);
    expect(offline.reevaluated).toEqual([{ ordinal: 1, actionType: "example.read", fields: ["parameters.query"] }]);
    expect(JSON.stringify(offline.reevaluated)).not.toContain("desks");
    expect(offline.evidence).toMatchObject({ verdict: "pass", evidenceOrigins: ["recorded", "pure_computation", "snapshot_evaluation"], liveEpisodeId: null });
  });
});

describe("an offline subflow trial that is refused", () => {
  it("never runs during exploration: no episode opens, no judge is asked, no client is reached", async () => {
    const { harness, subflows, proposal, live } = await recorded();

    const refused = await runOfflineSubflow(harness, subflows, proposal, live.traceId, "exploration");

    expect(refused).toEqual({ status: "refused", reasonCode: "offline_not_allowed_in_phase", detail: expect.any(String) });
    expect(subflows.judged).toHaveLength(1);
    expect(await harness.store.readManifest("trace.offline-2")).toBeUndefined();
    expect(harness.live.commands()).toHaveLength(2);
  });

  it("is refused before anything runs when the trace recorded no session view and the caller supplied none", async () => {
    const { harness, subflows, proposal, live } = await recorded();
    const store = await withoutClaims(harness.store, live.traceId);

    const refused = await runOfflineSubflow(harness, subflows, proposal, live.traceId, "test", { store });

    expect(refused).toEqual({ status: "refused", reasonCode: "incomplete_capture", detail: expect.stringContaining("session view") });
    expect(subflows.judged).toHaveLength(1);
    expect(await harness.store.readManifest("trace.offline-2")).toBeUndefined();
    expect(harness.live.commands()).toHaveLength(2);
    expect(harness.localDispatches).toEqual([]);
  });
});

describe("an offline subflow trial's session view", () => {
  it("is the supplied view when the trace recorded none, declared as a normalization", async () => {
    const { harness, subflows, proposal, live } = await recorded();
    const store = await withoutClaims(harness.store, live.traceId);
    const serving: ClientGatewayClientHello = {
      clientType: "custom", name: "Supplied client", metadata: { domainId: "example" },
      capabilities: [{ id: "example.actions", kind: "action", actionTypes: ["example.read"], metadata: { domainId: "example" } }]
    };

    const offline = await ran(runOfflineSubflow(harness, subflows, proposal, live.traceId, "test", { store, sessionView: serving }));

    expect(offline.sessionView).toBe("supplied");
    expect(offline.normalizations).toEqual([{ field: "session view", reason: expect.stringContaining("supplied") }]);
    expect(offline.supported).toEqual({ matchedOperations: 2, recordedOperations: 2 });
    expect(offline.evidence).toMatchObject({ verdict: "pass", scope: "full_recorded_path", missingEvidence: [] });
  });
});
