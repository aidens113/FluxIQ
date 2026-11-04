// A candidate trial answered by the state engine, on a real recorded trace, through the
// production executor and gateway: the verdict is pure, no judge decides it, and the result
// is recorded under the existing honesty rules, so a simulated pass can never count as live
// proof. Exploration is refused and a derived trace is refused, as for any offline trial.
import { afterEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceOperation, ClientGatewayTraceRecordedPayload, ClientGatewayTraceStateDomain, ClientGatewayTraceStateEngineGap } from "../../../../../../client-gateway/index.ts";
import { isAutomationStudioTrialEvidenceLiveSuccess, validateAutomationStudioTrialEvidenceResult } from "../../../../../../flows/authoring/model/index.ts";
import { candidateOf, offlineHarness, requestFor, runOffline, type OfflineHarness } from "../../tests/offline-harness.ts";
import { automationStudioStateTrialEvidenceResult, runAutomationStudioOfflineStateTrial, type AutomationStudioOfflineTrialPhase, type AutomationStudioStateTrialReference } from "../../index.ts";
import type { AutomationStudioFlowCandidate } from "../../../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";

const payloadOf = (answer: ClientGatewayTraceRecordedPayload | null): { rows?: unknown } => (answer?.payload ?? {}) as { rows?: unknown };

/** The example domain's port: one read, no page, rows by value. */
const domain: ClientGatewayTraceStateDomain = {
  normalisations: [{ id: "none", why: "the example read has one form" }],
  labelCall: () => "read",
  pageMoveForm: () => "absolute",
  canonicalKey: (operation: ClientGatewayTraceOperation) => JSON.stringify(operation.compared),
  siblingKey: (operation: ClientGatewayTraceOperation) => JSON.stringify(operation.compared),
  waitMs: () => null,
  readAnswer: (answer) => ({
    outcome: answer?.status === "succeeded" ? "succeeded" : "failed",
    position: "here",
    rows: Array.isArray(payloadOf(answer).rows) ? (payloadOf(answer).rows as readonly unknown[]).map((row) => JSON.stringify(row)) : null,
    timedOut: false
  }),
  isOneTimeLayerAct: () => false,
  handleScope: () => (operation) => operation,
  // What the example read says when the recording cannot answer it: nothing to read.
  unansweredCall: () => ({ status: "succeeded", payload: { rows: [] } }),
  computeRead: () => null,
  recordedAnswerFits: () => true
};

function runState(harness: OfflineHarness, candidate: AutomationStudioFlowCandidate, traceId: string, phase: AutomationStudioOfflineTrialPhase = "test", reference: AutomationStudioStateTrialReference = "judged_yes") {
  return runAutomationStudioOfflineStateTrial({ request: requestFor(candidate), ports: harness.ports, source: { store: harness.store, traceId }, gateway: harness.gateway, phase, domain, reference });
}

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("a candidate trial on the state engine", () => {
  it("passes a Flow that fits the recording, as recorded evidence only, whatever the judge said", async () => {
    harness = await offlineHarness();
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);
    const liveReads = harness.live.commands().length;
    harness.verdict.current = { verdict: "not_judged", why: "this judge is not read", spent: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, calls: 0 } };

    const offline = await runState(harness, candidate, recorded.traceId);

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(harness.live.commands().length).toBe(liveReads);
    expect(offline.engine.gaps).toEqual([]);
    expect(offline.engine.verdict.verdict).toBe("pass");
    expect(offline.evidence).toMatchObject({
      verdict: "pass",
      evidenceOrigins: ["recorded", "pure_computation"],
      scope: "full_recorded_path",
      liveEpisodeId: null,
      sourceEpisodeIds: [recorded.outcome.result.trialRunId],
      reasonCodes: [],
      missingEvidence: [],
      provenance: "original"
    });
    expect(offline.evidence.assertionsChecked.map((assertion) => [assertion.id, assertion.outcome])).toEqual([
      ["recording.same_rows", "satisfied"], ["recording.acts_covered", "satisfied"], ["recording.reached_end", "satisfied"], ["recording.run_finished", "satisfied"]
    ]);
    // The honesty rule, unchanged: this is never live proof.
    expect(isAutomationStudioTrialEvidenceLiveSuccess(offline.evidence)).toBe(false);
    expect(offline.normalizations).toEqual([{ field: "none", reason: "the example read has one form" }]);
  });

  it("shows nothing against a recording nobody said yes to: a Flow can repeat a failed run exactly", async () => {
    harness = await offlineHarness();
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);

    const offline = await runState(harness, candidate, recorded.traceId, "test", "unjudged");

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.engine.verdict.verdict).toBe("pass");
    expect(offline.evidence).toMatchObject({ verdict: "inconclusive", reasonCodes: ["judgement_unavailable"], scope: "segment", missingEvidence: [{ reasonCode: "judgement_unavailable", operation: null }] });
    expect(offline.evidence.assertionsChecked.every((assertion) => assertion.outcome === "unverified")).toBe(true);
  });

  it("is inconclusive with the gap's own reason when a read's input changed, and nothing recorded answers it", async () => {
    harness = await offlineHarness();
    const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));

    const offline = await runState(harness, candidateOf({ query: "desks", threshold: 10 }, 2), recorded.traceId);

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.evidence.verdict).toBe("inconclusive");
    expect(offline.evidence.reasonCodes).toEqual(["argument_mismatch"]);
    expect(offline.evidence.scope).toBe("segment");
    expect(offline.evidence.assertionsChecked.every((assertion) => assertion.outcome === "unverified")).toBe(true);
    // The read gap did not stop the run, and the gap comes back naming where it sits.
    expect(offline.trial.record.execution).toBe("succeeded");
    expect(offline.stepGaps).toEqual([expect.objectContaining({ step: 2, reason: "argument_mismatch", actionType: "example.read", wentOn: true })]);
    expect(isAutomationStudioTrialEvidenceLiveSuccess(offline.evidence)).toBe(false);
  });

  it("is refused in exploration and on a derived trace, before anything runs", async () => {
    harness = await offlineHarness();
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);

    expect(await runState(harness, candidate, recorded.traceId, "exploration")).toMatchObject({ status: "refused", reasonCode: "offline_not_allowed_in_phase" });

    const ranOffline = await runOffline(harness, candidate, recorded.traceId);
    if (ranOffline.status !== "ran") throw new Error("refused");
    expect(await runState(harness, candidate, ranOffline.trial.record.traceId!)).toMatchObject({ status: "refused", reasonCode: "source_not_live" });
  });
});

describe("the state trial's evidence result", () => {
  const trial = (execution: "succeeded" | "failed" | "not_run" = "succeeded") => ({ record: { execution, revision: 3, digest: "digest.3" } });
  const answered = { ordinal: 1, commandId: "c", actionType: "read", kind: "read" as const, recordedCommandId: "r", recordedSequence: 3, answeredFrom: "recorded" as const, mayBeGoneNextTime: false };
  const engine = (verdict: "pass" | "fail" | "inconclusive", reasons: string[] = [], gaps: readonly ClientGatewayTraceStateEngineGap[] = [], matchedOperations: readonly (typeof answered)[] = [answered]) => ({
    traceId: "trace.exploration", sourceEpisodeId: "episode", refusal: null, recordedOperations: 2, matchedOperations, gaps, deliveredSequences: [3], refusedDeliveries: [], unansweredMessageTypes: [], withheldDeliveries: 0, commandActions: [], bookkeepingCommands: 0,
    end: { used: [], receipted: [], skipped: [], reachedEnd: true, rows: [], afterChangedRows: false },
    verdict: { verdict, reasons, assertions: [{ id: "recording.same_rows" as const, outcome: verdict === "pass" ? "satisfied" as const : "violated" as const }] }
  });

  it("is a fail on recorded support when an assertion was violated, naming no gap", () => {
    const evidence = automationStudioStateTrialEvidenceResult({ trial: trial(), engine: engine("fail", ["recording.same_rows"]), sourceEpisodeId: "episode", goalContractVersion: "goal", reference: "judged_yes" });
    expect(evidence).toMatchObject({ verdict: "fail", reasonCodes: ["assertion_failure"], missingEvidence: [], scope: "full_recorded_path", liveEpisodeId: null });
  });

  it("is a fail when the run stopped, even if every assertion held", () => {
    const evidence = automationStudioStateTrialEvidenceResult({ trial: trial("failed"), engine: engine("pass"), sourceEpisodeId: "episode", goalContractVersion: "goal", reference: "judged_yes" });
    expect(evidence).toMatchObject({ verdict: "fail", scope: "segment" });
    expect(evidence.assertionsChecked.at(-1)).toEqual({ id: "recording.run_finished", outcome: "violated" });
  });

  it("is inconclusive, never a fail, when the run never ran or never reached the recording", () => {
    const never = automationStudioStateTrialEvidenceResult({ trial: trial("not_run"), engine: engine("fail", ["recording.same_rows"], [], []), sourceEpisodeId: "episode", goalContractVersion: "goal", reference: "judged_yes" });
    expect(never).toMatchObject({ verdict: "inconclusive", reasonCodes: ["missing_transition"], missingEvidence: [{ operation: null }], scope: "segment" });
    const unreached = automationStudioStateTrialEvidenceResult({ trial: trial("failed"), engine: engine("fail", ["recording.same_rows"], [], []), sourceEpisodeId: "episode", goalContractVersion: "goal", reference: "judged_yes" });
    expect(unreached).toMatchObject({ verdict: "inconclusive", reasonCodes: ["missing_transition"] });
  });

  it("carries every state rule gap as a U5 reason, inconclusive", () => {
    const gap: ClientGatewayTraceStateEngineGap = { ordinal: 2, commandId: "c", actionType: "act", wentOn: true, reason: "after_unrecorded_act", cause: "state_rule", fields: [], recordedSequence: null };
    const evidence = automationStudioStateTrialEvidenceResult({ trial: trial(), engine: engine("inconclusive", [], [gap]), sourceEpisodeId: "episode", goalContractVersion: "goal", reference: "judged_yes" });
    expect(evidence).toMatchObject({ verdict: "inconclusive", reasonCodes: ["after_unrecorded_act"], scope: "segment", missingEvidence: [{ reasonCode: "after_unrecorded_act", operation: "act#2" }] });
    expect(validateAutomationStudioTrialEvidenceResult(evidence).ok).toBe(true);
  });
});
