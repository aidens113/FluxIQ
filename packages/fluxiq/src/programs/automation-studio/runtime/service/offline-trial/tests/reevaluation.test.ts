// P5a: an offline trial whose matcher has a reevaluator. A changed read the
// reevaluator answers from the recorded snapshot stands in the recorded read's
// place: the run goes on to its end, its result names the snapshot evaluation
// among its origins and the outcome lists each reevaluated operation (ordinal,
// action type, differing fields; never a value). Such a pass is still recorded
// evidence: never a live success, never the whole-run gate's pass.
import { afterEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceReevaluationRequest, ClientGatewayTraceReevaluator } from "../../../../../../client-gateway/index.ts";
import { isAutomationStudioTrialEvidenceLiveSuccess, satisfiesAutomationStudioWholeRunGate } from "../../../../model/index.ts";
import { candidateOf, keptOrdinals, offlineHarness, runOffline, type OfflineHarness } from "./offline-harness.ts";

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

/** Answers every read with rows of its own, as a snapshot evaluation would, and keeps what it was asked. */
function rowsReevaluator(): ClientGatewayTraceReevaluator & { asked: ClientGatewayTraceReevaluationRequest[] } {
  const asked: ClientGatewayTraceReevaluationRequest[] = [];
  return {
    asked,
    reevaluate: async (request) => {
      asked.push(request);
      return { status: "answered", result: { status: "succeeded", payload: { rows: [{ name: "desk-a", price: 30, stock: 1 }, { name: "desk-b", price: 3, stock: 0 }] } } };
    }
  };
}

/** The offline trial that ran, or a throw naming why it was refused. */
async function ran(result: ReturnType<typeof runOffline>) {
  const offline = await result;
  if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
  return offline;
}

describe("an offline trial with a reevaluator", () => {
  it("runs a changed read on the reevaluated answer, names the snapshot evaluation and lists the operation, never as a live success", async () => {
    harness = await offlineHarness();
    const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));
    const reevaluator = rowsReevaluator();

    const candidate = candidateOf({ query: "desks", threshold: 10 }, 2);
    const offline = await ran(runOffline(harness, candidate, recorded.traceId, "test", { reevaluator }));

    expect(reevaluator.asked).toHaveLength(1);
    expect(reevaluator.asked[0]!.recordedResult).toMatchObject({ status: "succeeded", payload: { rows: expect.any(Array) } });
    expect(offline.matcher.gaps).toEqual([]);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual([1]);
    expect(offline.reevaluated).toEqual([{ ordinal: 1, actionType: "example.read", fields: ["parameters.query"] }]);
    expect(JSON.stringify(offline.reevaluated)).not.toContain("desks");
    expect(offline.evidence).toMatchObject({ verdict: "pass", scope: "full_recorded_path", evidenceOrigins: ["recorded", "pure_computation", "snapshot_evaluation"], liveEpisodeId: null });
    expect(isAutomationStudioTrialEvidenceLiveSuccess(offline.evidence)).toBe(false);
    expect(satisfiesAutomationStudioWholeRunGate(offline.evidence, { candidateRevision: 2, candidateDigest: candidate.digest, goalContractVersion: offline.evidence.goalContractVersion })).toBe(false);
  });

  it("keeps the recorded origins and lists nothing when every operation matched strictly", async () => {
    harness = await offlineHarness();
    const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));
    const reevaluator = rowsReevaluator();

    const offline = await ran(runOffline(harness, candidateOf({ query: "lamps", threshold: 15 }, 2), recorded.traceId, "test", { reevaluator }));

    expect(reevaluator.asked).toEqual([]);
    expect(offline.reevaluated).toEqual([]);
    expect(offline.evidence.evidenceOrigins).toEqual(["recorded", "pure_computation"]);
  });
});
