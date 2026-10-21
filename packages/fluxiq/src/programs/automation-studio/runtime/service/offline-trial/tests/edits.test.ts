// P4c: an edited candidate on a recorded trace. Edited logic computes its own
// result and no recorded output is restored (T05); a new computation over
// fields of the recorded observation nothing used before succeeds (T06); an
// upstream edit changes downstream values, so nothing computed in the source
// run is inherited (T23); and a changed action argument is answered with an
// evidence gap -- the trial inconclusive, never the recorded success.
import { afterEach, describe, expect, it } from "vitest";
import { candidateOf, keptOrdinals, offlineHarness, runOffline, type OfflineHarness } from "./offline-harness.ts";

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

/** The offline trial that ran, or a throw naming why it was refused. */
async function ran(result: ReturnType<typeof runOffline>) {
  const offline = await result;
  if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
  return offline;
}

describe("an edited candidate on a recorded trace", () => {
  it("computes a changed threshold's own result, not the recorded one (T05)", async () => {
    harness = await offlineHarness();
    const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));
    expect(keptOrdinals(harness, recorded.outcome.result.trialRunId, "keep")).toEqual([2, 3]);

    const offline = await ran(runOffline(harness, candidateOf({ query: "lamps", threshold: 15 }, 2), recorded.traceId));

    expect(offline.matcher.gaps).toEqual([]);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual([3]);
    expect(offline.evidence).toMatchObject({ verdict: "pass", scope: "full_recorded_path", candidateRevision: 2, missingEvidence: [] });
  });

  it("runs a new computation over a field of the recorded rows nothing read before (T06)", async () => {
    harness = await offlineHarness();
    const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));
    expect(keptOrdinals(harness, recorded.outcome.result.trialRunId, "stocked")).toBeUndefined();

    const offline = await ran(runOffline(harness, candidateOf({ query: "lamps", threshold: 10, stockAbove: 5 }, 2), recorded.traceId));

    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.trial.record.execution).toBe("succeeded");
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual([2, 3]);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "stocked")).toEqual([3]);
    expect(offline.evidence).toMatchObject({ verdict: "pass", scope: "full_recorded_path" });
  });

  it("recomputes downstream after an upstream edit: nothing computed in the source run is inherited (T23)", async () => {
    harness = await offlineHarness();
    const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 4, stockAbove: 2 }));
    expect(keptOrdinals(harness, recorded.outcome.result.trialRunId, "keep")).toEqual([1, 2, 3]);
    expect(keptOrdinals(harness, recorded.outcome.result.trialRunId, "stocked")).toEqual([2, 3]);

    // Only the upstream threshold changes; the downstream step is the recorded one.
    const offline = await ran(runOffline(harness, candidateOf({ query: "lamps", threshold: 15, stockAbove: 2 }, 2), recorded.traceId));

    expect(offline.matcher.gaps).toEqual([]);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual([3]);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "stocked")).toEqual([3]);
  });

  it("answers a changed action argument with an evidence gap, inconclusive, never the recorded rows", async () => {
    harness = await offlineHarness();
    const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));
    const judgedBefore = harness.judged.length;

    const offline = await ran(runOffline(harness, candidateOf({ query: "desks", threshold: 10 }, 2), recorded.traceId));

    expect(offline.matcher.matchedOperations).toEqual([]);
    expect(offline.matcher.gaps).toEqual([expect.objectContaining({ actionType: "example.read", reason: "argument_mismatch", cause: "mismatch", fields: ["parameters.query"] })]);
    const reads = harness.executed.get(offline.trial.result.trialRunId!)!.attempts.filter((attempt) => attempt.definitionId === "builtin.policy.action");
    expect(reads.map((attempt) => attempt.status)).toEqual(["failed"]);
    expect(reads[0]!.failure).toMatchObject({ code: "argument_mismatch", retryable: false });
    expect(harness.batches.get(offline.trial.result.trialRunId!)).toEqual([]);
    expect(JSON.stringify(offline.trial)).not.toContain("lamp-b");
    expect(offline.trial.result.verdict).toBe("execution_failed");
    expect(harness.judged).toHaveLength(judgedBefore);
    expect(offline.evidence).toMatchObject({
      verdict: "inconclusive",
      scope: "segment",
      reasonCodes: ["argument_mismatch"],
      missingEvidence: [{ reasonCode: "argument_mismatch", scope: "segment", operation: "example.read#1", detail: expect.stringContaining("parameters.query") }]
    });
    expect(JSON.stringify(offline.evidence)).not.toContain("desks");
  });
});
