// P4 honest outcomes: with no evidence gap, an offline trial's verdict says
// only what its evidence supports. A judge that gave no verdict (not asked, or
// unsure) leaves the trial inconclusive under `judgement_unavailable`, naming
// the judge as the evidence it lacked, never a fail; a run that failed on
// recorded support is a fail (`assertion_failure`). A gap the matcher recorded
// at a failed delivery reaches the result as missing evidence at that
// operation, with its own reason.
import { afterEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceMatcherGap } from "../../../../../../client-gateway/index.ts";
import { automationStudioOfflineTrialEvidenceResult } from "../index.ts";
import { candidateOf, offlineHarness, runOffline, type OfflineHarness, type ReadScript } from "./offline-harness.ts";

const SPENT = { inputTokens: 300, outputTokens: 30, totalTokens: 330, estimatedCostUsd: 0.001, calls: 2 };

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

/** Records the candidate live, then sets the judge's next answer and runs it offline on that recording. */
async function offlineAfter(judge: OfflineHarness["verdict"]["current"]) {
  harness = await offlineHarness();
  const candidate = candidateOf({ query: "lamps", threshold: 10 });
  const recorded = await harness.recordLive(candidate);
  harness.verdict.current = judge;
  const offline = await runOffline(harness, candidate, recorded.traceId);
  if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
  return offline;
}

describe("an offline trial's verdict with no evidence gap", () => {
  it("is inconclusive, naming the judge as the missing evidence, when the judge was not asked to judge", async () => {
    const offline = await offlineAfter({ verdict: "not_judged", why: "the purse could not pay the judge", spent: { ...SPENT, calls: 0 } });

    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.trial.result.verdict).toBe("not_judged");
    expect(offline.evidence).toMatchObject({
      verdict: "inconclusive",
      scope: "full_recorded_path",
      reasonCodes: ["judgement_unavailable"],
      assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "unverified" }],
      missingEvidence: [{ reasonCode: "judgement_unavailable", scope: "full_recorded_path", operation: null, detail: expect.stringContaining("build_test_judge.task_goal") }]
    });
    expect(offline.evidence.missingEvidence[0]!.detail).toContain("not_judged");
  });

  it("is inconclusive under the same reason when the judge was unsure", async () => {
    const offline = await offlineAfter({ verdict: "unknown", why: "the two checks did not agree", spent: { ...SPENT } });

    expect(offline.trial.result.verdict).toBe("unsure");
    expect(offline.evidence).toMatchObject({
      verdict: "inconclusive",
      reasonCodes: ["judgement_unavailable"],
      assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "unverified" }],
      missingEvidence: [{ reasonCode: "judgement_unavailable", operation: null, detail: expect.stringContaining("unsure") }]
    });
  });

  it("is a fail when the run failed on recorded support", async () => {
    const gone: ReadScript = () => ({ delayMs: 1, status: "failed", error: "gone", failure: { category: "timeout", code: "example.gone", retryable: false, stage: "dispatch", effect: "unacted" } });
    harness = await offlineHarness(gone);
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);
    expect(recorded.outcome.result.verdict).toBe("execution_failed");

    const offline = await runOffline(harness, candidate, recorded.traceId);

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.matcher.matchedOperations.length).toBeGreaterThan(0);
    expect(offline.trial.result.verdict).toBe("execution_failed");
    expect(offline.evidence).toMatchObject({
      verdict: "fail",
      scope: "segment",
      reasonCodes: ["assertion_failure"],
      assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "violated" }],
      missingEvidence: []
    });
  });
});

describe("a gap the matcher recorded at a failed delivery", () => {
  it("is missing evidence at that operation, or at none before the first, under its own reason", async () => {
    const offline = await offlineAfter({ verdict: "yes", spent: { ...SPENT } });
    const atRead: ClientGatewayTraceMatcherGap = { ordinal: 1, commandId: "command-1", actionType: "example.read", reason: "missing_artifact", cause: "failed_delivery", fields: [], recordedSequence: 9 };
    const opening: ClientGatewayTraceMatcherGap = { ordinal: 0, commandId: "", actionType: "", reason: "incomplete_capture", cause: "failed_delivery", fields: [], recordedSequence: 4 };

    const evidence = automationStudioOfflineTrialEvidenceResult({
      trial: offline.trial,
      matcher: { ...offline.matcher, gaps: [opening, atRead] },
      sourceEpisodeId: offline.evidence.sourceEpisodeIds[0]!,
      goalContractVersion: offline.evidence.goalContractVersion
    });

    expect(evidence).toMatchObject({
      verdict: "inconclusive",
      scope: "segment",
      reasonCodes: ["incomplete_capture", "missing_artifact"],
      missingEvidence: [
        { reasonCode: "incomplete_capture", scope: "segment", operation: null, detail: expect.stringContaining("sequence 4") },
        { reasonCode: "missing_artifact", scope: "segment", operation: "example.read#1", detail: expect.stringContaining("sequence 9") }
      ]
    });
    expect(evidence.missingEvidence[1]!.detail).toContain("failed_delivery");
  });
});
