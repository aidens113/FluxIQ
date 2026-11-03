import { describe, expect, it } from "vitest";
import { automationStudioRunDetailWithDeclinedAdaptiveRetry, decideAutomationStudioAdaptiveRetry } from "../adaptive-retry.ts";
import { automationStudioVerificationAwaitsJudgedRun } from "../verification-awaits-judged-run.ts";

// One receipt exactly as `runtimePatchAttempts` records it for a repair that
// was applied automatically and asked for the original action to be taken
// again. Every case below changes one field of it.
function receipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "temporary_wait_retry",
    retryOriginalAction: true,
    approvalDecision: { autoApply: true },
    resumable: true,
    resumeFrom: { nodeId: "end", route: "success" },
    ...overrides
  };
}

describe("decideAutomationStudioAdaptiveRetry", () => {
  it("resumes at the node the trial reached", () => {
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt()] })).toEqual({ resume: { nodeId: "end", route: "success" } });
  });

  it("answers nothing when no repair asked for the action to be taken again", () => {
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ retryOriginalAction: false })] })).toBeNull();
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ approvalDecision: { autoApply: false } })] })).toBeNull();
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [] })).toBeNull();
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: undefined })).toBeNull();
  });

  it("refuses to continue when the verdict did not vouch for the repair, and passes its code on", () => {
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ resumable: false, notResumableCode: "check_unknown" })] }))
      .toEqual({ declined: { notResumableCode: "check_unknown" } });
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ resumable: false, notResumableCode: "no_evidence" })] }))
      .toEqual({ declined: { notResumableCode: "no_evidence" } });
  });

  it("refuses a receipt that never answered the question at all", () => {
    const { resumable: _resumable, ...unanswered } = receipt();
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [unanswered] }))
      .toEqual({ declined: { notResumableCode: "resume_decision_missing" } });
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ resumable: "yes" })] }))
      .toEqual({ declined: { notResumableCode: "resume_decision_missing" } });
  });

  it("refuses a resume point it cannot aim at", () => {
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ resumeFrom: undefined })] }))
      .toEqual({ declined: { notResumableCode: "resume_point_missing" } });
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ resumeFrom: { nodeId: "", route: "success" } })] }))
      .toEqual({ declined: { notResumableCode: "resume_point_malformed" } });
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ resumeFrom: { nodeId: "end" } })] }))
      .toEqual({ declined: { notResumableCode: "resume_point_malformed" } });
  });

  it("refuses a Flow the trial already ran to its end rather than start it again", () => {
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ resumeFrom: { completed: true } })] }))
      .toEqual({ declined: { notResumableCode: "resume_point_completed" } });
  });

  it("holds the resume point to the graph the retry would run", () => {
    const inSubflow = receipt({ resumeFrom: { nodeId: "end", route: "success", subflowId: "subflow.primary" } });
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [inSubflow], subflowId: "subflow.primary" }))
      .toEqual({ resume: { nodeId: "end", route: "success" } });
    // A node id is unique only inside its own graph. A point that names none,
    // or names another Subflow, could aim at a same-named node of the wrong one.
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt()], subflowId: "subflow.primary" }))
      .toEqual({ declined: { notResumableCode: "resume_point_subflow_mismatch" } });
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [inSubflow], subflowId: "subflow.other" }))
      .toEqual({ declined: { notResumableCode: "resume_point_subflow_mismatch" } });
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [inSubflow] }))
      .toEqual({ declined: { notResumableCode: "resume_point_subflow_mismatch" } });
  });

  it("refuses when one repair of several was not vouched for, or they disagree on where", () => {
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt(), receipt({ resumable: false, notResumableCode: "check_failed" })] }))
      .toEqual({ declined: { notResumableCode: "check_failed" } });
    expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt(), receipt({ resumeFrom: { nodeId: "other", route: "success" } })] }))
      .toEqual({ declined: { notResumableCode: "resume_points_disagree" } });
  });

  // t267: a target override on a Flow that declares no evidence proved nothing
  // in its trial (`no_evidence`), and its evidence is the judged whole run. The
  // run has to carry on through it to be judged at all.
  describe("a repair whose evidence is the judged whole run", () => {
    const awaiting = {
      kind: "temporary_target_override",
      resumable: false,
      notResumableCode: "no_evidence",
      verification: { status: "unverifiable", reason: "no_expectation_declared", awaitsJudgedRun: true }
    };

    it("carries on at the point its trial named", () => {
      expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt(awaiting)] })).toEqual({ resume: { nodeId: "end", route: "success" } });
      expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt(awaiting), receipt()] })).toEqual({ resume: { nodeId: "end", route: "success" } });
    });

    it("is held to every other rule a resume point is held to", () => {
      const decide = (overrides: Record<string, unknown>, subflowId?: string) => decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ ...awaiting, ...overrides })], ...(subflowId ? { subflowId } : {}) });
      expect(decide({ resumeFrom: undefined })).toEqual({ declined: { notResumableCode: "resume_point_missing" } });
      expect(decide({ resumeFrom: { completed: true } })).toEqual({ declined: { notResumableCode: "resume_point_completed" } });
      expect(decide({}, "subflow.primary")).toEqual({ declined: { notResumableCode: "resume_point_subflow_mismatch" } });
      expect(decide({ resumeFrom: { nodeId: " ", route: "success" } })).toEqual({ declined: { notResumableCode: "resume_point_malformed" } });
      expect(decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt(awaiting), receipt({ resumeFrom: { nodeId: "other", route: "success" } })] }))
        .toEqual({ declined: { notResumableCode: "resume_points_disagree" } });
    });

    it("is refused as before when nothing awaits a judged run, or the trial's refusal was anything but no evidence", () => {
      const decide = (overrides: Record<string, unknown>) => decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: [receipt({ ...awaiting, ...overrides })] });
      expect(decide({ verification: { status: "unverifiable", reason: "no_expectation_declared" } })).toEqual({ declined: { notResumableCode: "no_evidence" } });
      expect(decide({ verification: undefined })).toEqual({ declined: { notResumableCode: "no_evidence" } });
      expect(decide({ verification: { status: "verified", awaitsJudgedRun: true } })).toEqual({ declined: { notResumableCode: "no_evidence" } });
      expect(decide({ notResumableCode: "check_unknown" })).toEqual({ declined: { notResumableCode: "check_unknown" } });
      expect(decide({ notResumableCode: undefined })).toEqual({ declined: { notResumableCode: "resume_decision_missing" } });
    });
  });
});

describe("automationStudioVerificationAwaitsJudgedRun", () => {
  it("is true only for an unverifiable verification that awaits its judged run", () => {
    expect(automationStudioVerificationAwaitsJudgedRun({ status: "unverifiable", reason: "no_expectation_declared", awaitsJudgedRun: true })).toBe(true);
    expect(automationStudioVerificationAwaitsJudgedRun({ status: "unverifiable", reason: "no_expectation_declared" })).toBe(false);
    expect(automationStudioVerificationAwaitsJudgedRun({ status: "unverifiable", awaitsJudgedRun: "true" })).toBe(false);
    expect(automationStudioVerificationAwaitsJudgedRun({ status: "verified", awaitsJudgedRun: true })).toBe(false);
    expect(automationStudioVerificationAwaitsJudgedRun(undefined)).toBe(false);
    expect(automationStudioVerificationAwaitsJudgedRun([{ status: "unverifiable", awaitsJudgedRun: true }])).toBe(false);
  });
});

describe("automationStudioRunDetailWithDeclinedAdaptiveRetry", () => {
  it("leaves a run that never declined anything untouched", () => {
    const detail = { metadata: { runtimePatchAttempts: [] } };
    expect(automationStudioRunDetailWithDeclinedAdaptiveRetry(detail, undefined)).toBe(detail);
  });

  it("records that the run stopped and why, beside what it already reported", () => {
    expect(automationStudioRunDetailWithDeclinedAdaptiveRetry({ metadata: { llmGate: { ok: true } } }, "check_unknown")).toEqual({
      metadata: { llmGate: { ok: true }, adaptiveRetry: { attempted: false, notResumableCode: "check_unknown" } }
    });
    expect(automationStudioRunDetailWithDeclinedAdaptiveRetry({}, "no_evidence")).toEqual({
      metadata: { adaptiveRetry: { attempted: false, notResumableCode: "no_evidence" } }
    });
  });
});
