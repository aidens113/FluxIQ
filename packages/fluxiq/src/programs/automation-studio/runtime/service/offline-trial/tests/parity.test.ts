// P4c: an offline trial runs the candidate through the same trial runner as a
// live one, its world a live trial's recorded `test` trace. The recorded
// candidate reproduces the recorded outcome on recorded support (original
// parity); a recorded failed attempt and then a success are consumed by the
// production retry, in order (T16); and the judge is asked about the new run's
// evidence, never answered from the recorded trial (T22).
import { afterEach, describe, expect, it } from "vitest";
import { isAutomationStudioTrialEvidenceLiveSuccess } from "../../../../model/index.ts";
import { candidateOf, keptOrdinals, offlineHarness, ROWS, runOffline, type OfflineHarness, type ReadScript } from "./offline-harness.ts";

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("an offline trial of the recorded candidate", () => {
  it("reproduces the recorded outcome through the gateway's intake, and no live client is reached", async () => {
    harness = await offlineHarness();
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);
    expect(recorded.outcome.record.execution).toBe("succeeded");
    expect(recorded.outcome.result.verdict).toBe("yes");
    const liveReads = harness.live.commands().length;
    expect(liveReads).toBe(1);

    const offline = await runOffline(harness, candidate, recorded.traceId);

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.matcher.refusal).toBeNull();
    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.matcher.matchedOperations.map((operation) => operation.actionType)).toEqual(["example.read"]);
    expect(offline.matcher.sourceEpisodeId).toBe(recorded.outcome.result.trialRunId);
    expect(offline.trial.record).toMatchObject({ execution: "succeeded", verdict: "yes", start: { status: "not_reset" } });
    expect(offline.trial.result.trialRunId).not.toBe(recorded.outcome.result.trialRunId);
    // The same rows were read and the same computation kept the same of them.
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual([2, 3]);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual(keptOrdinals(harness, recorded.outcome.result.trialRunId, "keep"));
    expect(harness.batches.get(offline.trial.result.trialRunId!)?.[0]?.rows).toEqual(ROWS);
    expect(offline.evidence).toEqual({
      verdict: "pass",
      evidenceOrigins: ["recorded", "pure_computation"],
      scope: "full_recorded_path",
      candidateRevision: 1,
      candidateDigest: candidate.digest,
      goalContractVersion: "candidate.requirements.unbound",
      sourceEpisodeIds: [recorded.outcome.result.trialRunId],
      liveEpisodeId: null,
      supported: { observations: offline.matcher.deliveredSequences.map((sequence) => `${recorded.traceId}#${sequence}`), operations: ["example.read#1"] },
      assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "satisfied" }],
      reasonCodes: [],
      missingEvidence: [],
      provenance: "original"
    });
    expect(isAutomationStudioTrialEvidenceLiveSuccess(offline.evidence)).toBe(false);
    expect(harness.live.commands()).toHaveLength(liveReads);
    expect(harness.localDispatches).toEqual([]);
    expect(harness.live.errors).toEqual([]);
  });

  it("consumes a recorded failed attempt and then the success through the production retry, in recorded order (T16)", async () => {
    const busyThenRows: ReadScript = (_parameters, occurrence) => occurrence === 1
      ? { delayMs: 1, status: "failed", error: "busy", failure: { category: "timeout", code: "example.busy", retryable: true, stage: "dispatch", effect: "unacted" } }
      : { delayMs: 2, status: "succeeded", payload: { rows: structuredClone([...ROWS]) } };
    harness = await offlineHarness(busyThenRows);
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);
    const recordedReads = harness.executed.get(recorded.outcome.result.trialRunId!)!.attempts.filter((attempt) => attempt.definitionId === "builtin.policy.action");
    expect(recordedReads.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);

    const offline = await runOffline(harness, candidate, recorded.traceId);

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    const reads = harness.executed.get(offline.trial.result.trialRunId!)!.attempts.filter((attempt) => attempt.definitionId === "builtin.policy.action");
    expect(reads.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(reads[0]!.failure).toMatchObject({ code: "example.busy", retryable: true });
    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.matcher.matchedOperations.map((operation) => operation.ordinal)).toEqual([1, 2]);
    const delivered = offline.matcher.deliveredSequences;
    expect([...delivered].sort((a, b) => a - b)).toEqual(delivered);
    expect(keptOrdinals(harness, offline.trial.result.trialRunId, "keep")).toEqual([2, 3]);
    expect(offline.evidence).toMatchObject({ verdict: "pass", scope: "full_recorded_path" });
    expect(harness.live.commands()).toHaveLength(2);
  });

  it("asks the judge about the new run's evidence and never reuses the recorded trial's answer (T22)", async () => {
    harness = await offlineHarness();
    const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));
    expect(recorded.outcome.result.verdict).toBe("yes");
    expect(harness.judged).toHaveLength(1);
    harness.verdict.current = { verdict: "no", expected: "Every row priced above the limit.", observed: "One row was kept.", findings: [], records: { stored: 3, refused: 0, missingRequired: 0 }, spent: { inputTokens: 300, outputTokens: 30, totalTokens: 330, estimatedCostUsd: 0.001, calls: 2 } };
    const edited = candidateOf({ query: "lamps", threshold: 15, stockAbove: 5 }, 2);

    const offline = await runOffline(harness, edited, recorded.traceId);

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(harness.judged).toHaveLength(2);
    const shown = harness.judged[1]!.summary.flowShape;
    expect(shown.map((step) => step.definitionId)).toEqual(["builtin.control.start", "builtin.policy.action", "builtin.data.filter-list", "builtin.data.filter-list"]);
    expect(shown[2]?.parameters).toMatchObject({ value: 15 });
    expect(shown[3]?.parameters).toMatchObject({ path: "stock", value: 5 });
    expect(offline.trial.result.verdict).toBe("no");
    expect(offline.trial.record.judge.calls).toBe(2);
    expect(offline.evidence).toMatchObject({ verdict: "fail", scope: "full_recorded_path", reasonCodes: ["assertion_failure"], assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "violated" }], missingEvidence: [] });
  });
});
