// P6 (t769, design section 3): an offline trial's outcome mapped to the answer
// the trial gates read. A failure the recording demonstrates is kept; a pass,
// a gap, an unsettled judge and a refusal all run the trial live, a gap naming
// the first step the recording could not answer. Every answer is one the
// gates' own step accepts, and every matcher gap reason has words for the
// model (the drift check B3 could not hold inside the trace-free boundary).
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS, type ClientGatewayTraceMatcherGap, type ClientGatewayTraceMatcherGapReason, type ClientGatewayTraceMatcherReport } from "../../../../../../client-gateway/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../../flow-bootstrap/candidate/index.ts";
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as WORDS, automationStudioTrialOfflineFirstStep } from "../../../flow-bootstrap/offline-first/index.ts";
import { automationStudioOfflineTrialEvidenceResult, type AutomationStudioOfflineTrialRan, type AutomationStudioOfflineTrialRefusal } from "../../offline-trial/index.ts";
import { automationStudioOfflineFirstAnswer } from "../index.ts";

type Execution = "succeeded" | "failed" | "cancelled" | "not_run";
type FakeTrial = {
  record: { execution: Execution; revision: number; digest: string };
  result: { revision: number; digest: string; verdict: AutomationStudioCandidateTrialVerdict; feedback: JsonObject; entryPrepared?: boolean; standingNo?: unknown };
};

const EXPECTED = Object.freeze({ revision: 2, digest: "digest.2" });

function trial(verdict: AutomationStudioCandidateTrialVerdict, execution: Execution, feedback: JsonObject = { steps: [] }, extra: Partial<FakeTrial["result"]> = {}): FakeTrial {
  return { record: { execution, ...EXPECTED }, result: { ...EXPECTED, verdict, feedback, ...extra } };
}

function matched(ordinal: number) {
  return { ordinal, commandId: `command.${ordinal}`, recordedCommandId: `recorded.${ordinal}`, recordedSequence: ordinal * 10, actionType: "example.read", answeredFrom: "recorded" as const, fields: [] };
}

function gap(ordinal: number, reason: ClientGatewayTraceMatcherGapReason, cause: ClientGatewayTraceMatcherGap["cause"] = "mismatch"): ClientGatewayTraceMatcherGap {
  return { ordinal, commandId: `command.${ordinal}`, actionType: cause === "failed_delivery" ? "" : "example.read", reason, cause, fields: [], recordedSequence: ordinal * 10 };
}

function matcher(recorded: number, matchedOrdinals: readonly number[], gaps: readonly ClientGatewayTraceMatcherGap[] = []): ClientGatewayTraceMatcherReport {
  return {
    traceId: "trace.live", sourceEpisodeId: "episode.live", refusal: null, recordedOperations: recorded,
    matchedOperations: matchedOrdinals.map(matched), gaps, deliveredSequences: matchedOrdinals.map((ordinal) => ordinal * 10), refusedDeliveries: [], unansweredMessageTypes: []
  };
}

/** An offline trial that ran, its evidence computed by the offline runner's own evidence result. */
function ran(fake: FakeTrial, report: ClientGatewayTraceMatcherReport): AutomationStudioOfflineTrialRan<FakeTrial> {
  return {
    status: "ran", trial: fake, matcher: report, sessionView: "recorded", normalizations: [], reevaluated: [],
    evidence: automationStudioOfflineTrialEvidenceResult({ trial: fake, matcher: report, sourceEpisodeId: "episode.live", goalContractVersion: "goal" }),
    supported: { matchedOperations: report.matchedOperations.length, recordedOperations: report.recordedOperations }
  };
}

/** What the gates do with the answer: it must never be refused as invalid. */
function stepOf(answer: unknown) {
  const step = automationStudioTrialOfflineFirstStep(answer, EXPECTED);
  if (step.kind === "live") expect(step.note).not.toMatchObject({ why: expect.stringMatching(/^offline_(answer|kept)/u) });
  return step;
}

describe("a refused offline trial", () => {
  it("runs live, not tried, under the refusal's reason", () => {
    const refusal: AutomationStudioOfflineTrialRefusal = { status: "refused", reasonCode: "incomplete_capture", detail: "the trace recorded no session view" };

    const answer = automationStudioOfflineFirstAnswer(refusal);

    expect(answer).toEqual({ kind: "live", note: { outcome: "not_tried", why: "incomplete_capture" } });
    expect(stepOf(answer)).toMatchObject({ kind: "live", logged: { outcome: "refused:incomplete_capture" } });
  });
});

describe("a failure the recording demonstrates", () => {
  it("keeps a judge's no on a run matched throughout, with its standing no and counts", () => {
    const fake = trial("no", "succeeded", { steps: [{ step: 1, status: "succeeded" }] }, { standingNo: { kept: true } });

    const answer = automationStudioOfflineFirstAnswer(ran(fake, matcher(2, [1, 2])));

    expect(answer).toEqual({ kind: "kept", result: fake.result, standingNo: { kept: true }, checked: { matched: 2, recorded: 2 } });
    expect(stepOf(answer)).toMatchObject({ kind: "keep", logged: { outcome: "kept_no", matchedOperations: 2, recordedOperations: 2 }, evidence: { checkedAgainst: "recorded_run" } });
  });

  it("keeps a run that failed on recorded support, with no gap", () => {
    const fake = trial("execution_failed", "failed", { code: "candidate.trial_failed", steps: [{ step: 1, status: "failed", failureCode: "element_not_found" }] });

    const answer = automationStudioOfflineFirstAnswer(ran(fake, matcher(1, [1])));

    expect(answer).toEqual({ kind: "kept", result: fake.result, checked: { matched: 1, recorded: 1 } });
    expect(stepOf(answer)).toMatchObject({ kind: "keep", logged: { outcome: "kept_failed" } });
  });

  it("never keeps a run that did not run, or a subflow whose entry was not prepared", () => {
    const notRun = automationStudioOfflineFirstAnswer(ran(trial("execution_failed", "not_run"), matcher(0, [])));
    const unprepared = automationStudioOfflineFirstAnswer(ran(trial("execution_failed", "failed", { steps: [] }, { entryPrepared: false }), matcher(1, [1])));

    expect(notRun).toMatchObject({ kind: "live", note: { outcome: "inconclusive" } });
    expect(unprepared).toEqual({ kind: "live", note: { outcome: "inconclusive", why: "offline_entry_not_prepared" }, checked: { matched: 1, recorded: 1 } });
    expect(stepOf(notRun).kind).toBe("live");
    expect(stepOf(unprepared).kind).toBe("live");
  });
});

describe("an offline pass", () => {
  it("runs live, noting the pass, and is never kept", () => {
    const answer = automationStudioOfflineFirstAnswer(ran(trial("yes", "succeeded"), matcher(2, [1, 2])));

    expect(answer).toEqual({ kind: "live", note: { outcome: "passed" }, checked: { matched: 2, recorded: 2 } });
    expect(stepOf(answer)).toMatchObject({ kind: "live", logged: { outcome: "passed" } });
  });
});

describe("an offline trial that left recorded support (T09)", () => {
  it("runs live, naming the first step whose failure is a gap reason and the reason", () => {
    const feedback: JsonObject = { steps: [
      { step: 1, status: "succeeded" },
      { step: 2, status: "succeeded" },
      { step: 3, status: "failed", failureCode: "argument_mismatch" }
    ] };

    const answer = automationStudioOfflineFirstAnswer(ran(trial("execution_failed", "failed", feedback), matcher(2, [1], [gap(2, "argument_mismatch")])));

    expect(answer).toEqual({ kind: "live", note: { outcome: "gap", step: 3, why: "argument_mismatch" }, checked: { matched: 1, recorded: 2 } });
    const step = stepOf(answer);
    expect(step).toMatchObject({ kind: "live", logged: { outcome: "gap", step: 3 } });
    expect(step.kind === "live" ? step.note.said : "").toContain(WORDS.reasons.argument_mismatch);
  });

  it("is inconclusive under the gap's reason when no step names it", () => {
    const answer = automationStudioOfflineFirstAnswer(ran(trial("yes", "succeeded", { steps: [{ step: 1, status: "succeeded" }] }), matcher(2, [1, 2], [gap(0, "missing_artifact", "failed_delivery")])));

    expect(answer).toEqual({ kind: "live", note: { outcome: "inconclusive", why: "missing_artifact" }, checked: { matched: 2, recorded: 2 } });
    expect(stepOf(answer).kind).toBe("live");
  });

  it("is inconclusive when nothing reached the recorded client", () => {
    const answer = automationStudioOfflineFirstAnswer(ran(trial("no", "succeeded"), matcher(2, [])));

    expect(answer).toEqual({ kind: "live", note: { outcome: "inconclusive", why: "missing_transition" }, checked: { matched: 0, recorded: 2 } });
  });
});

describe("an offline trial the judge did not settle", () => {
  it.each(["unsure", "not_judged"] as const)("runs live, inconclusive, when the judge said %s", (verdict) => {
    const answer = automationStudioOfflineFirstAnswer(ran(trial(verdict, "succeeded"), matcher(1, [1])));

    expect(answer).toEqual({ kind: "live", note: { outcome: "inconclusive", why: "judgement_unavailable" }, checked: { matched: 1, recorded: 1 } });
    expect(stepOf(answer).kind).toBe("live");
  });
});

describe("the gap reasons' words (drift)", () => {
  it("has words for every reason the trace matcher can give, and never says the code", () => {
    for (const reason of CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS) {
      expect(Object.hasOwn(WORDS.reasons, reason), reason).toBe(true);
      expect(WORDS.gap(4, reason)).toContain(WORDS.reasons[reason]!);
      expect(WORDS.gap(4, reason)).not.toContain(reason);
    }
  });
});
