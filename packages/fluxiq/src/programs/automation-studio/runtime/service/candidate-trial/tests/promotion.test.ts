import { describe, expect, it, vi } from "vitest";
import { automationStudioCandidateFingerprint as fingerprint, type AutomationStudioCandidateTrialResult } from "../../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "../../candidate-drafts/index.ts";
import { promoteAutomationStudioCandidateTrial, type AutomationStudioCandidateTrialRecord } from "../index.ts";
import { trialFixture } from "./fixtures.ts";

function promotionFixture() {
  const { buildPlan } = trialFixture();
  const digest = fingerprint.candidate({ projectId: "project", flowId: "parent", baseDependencyDigest: "base", instructionText: "Add the hub", buildPlan });
  const record = {
    kind: "flow_candidate_draft", schemaVersion: 1, status: "draft", verification: "not_performed", candidateId: "candidate.1", projectId: "project", flowId: "parent",
    sourceInstructionIds: ["instruction"], instructionText: "Add the hub", baseSettingsRevision: 4, accounting: { requestId: "candidate.r", estimatedInputTokens: 0 }, createdAt: 1,
    candidate: { revision: 2, digest, baseDependencyDigest: "base", status: "draft", summary: "Add the hub to the cart", buildPlan, changedPaths: ["plan"] }
  } as AutomationStudioFlowCandidateDraftRecord;
  const yes: AutomationStudioCandidateTrialResult = { revision: 2, digest, verdict: "yes", feedback: {}, trialRunId: "trial.2" };
  const trials: AutomationStudioCandidateTrialRecord[] = [
    { candidateId: "candidate.1", revision: 1, digest: "c".repeat(64), trialRunId: "trial.1", start: { status: "not_reset" }, execution: "succeeded", verdict: "no", code: "candidate.trial_judged_no", judge: { calls: 2, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 } },
    { candidateId: "candidate.1", revision: 2, digest, trialRunId: "trial.2", start: { status: "reset", result: {} }, execution: "succeeded", verdict: "yes", judge: { calls: 2, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 } }
  ];
  const propose = vi.fn(async (_proposal: unknown) => ({ adaptationId: "adaptation.bootstrap.1", status: "proposed" }) as AutomationStudioBootstrapAdaptation);
  const input = { record, standing: yes as AutomationStudioCandidateTrialResult | undefined, trials, readAuthoritative: async () => structuredClone(record) as AutomationStudioFlowCandidateDraftRecord | undefined,
    currentBinding: async () => ({ executionDigest: "base", settingsRevision: 4 }), propose };
  return { input, record, digest, propose };
}

describe("promoting a judged candidate", () => {
  it("two yeses for the exact revision and digest give a proposal with the candidateTrial audit detail", async () => {
    const { input, digest, propose } = promotionFixture();
    const promoted = await promoteAutomationStudioCandidateTrial(input);
    expect(promoted).toMatchObject({ status: "proposed", adaptation: { adaptationId: "adaptation.bootstrap.1" }, candidate: { candidateId: "candidate.1", revision: 2, digest, trial: { runId: "trial.2", verdict: "yes", calls: 2 } } });
    expect(propose).toHaveBeenCalledTimes(1);
    expect(propose.mock.calls[0]![0]).toMatchObject({ baseDependencyDigest: "base", sourceInstructionIds: ["instruction"], summary: "Add the hub to the cart",
      candidateTrial: { candidateId: "candidate.1", revision: 2, digest, trial: { runId: "trial.2", verdict: "yes", calls: 2, start: "reset" }, trials: 2 } });
  });

  it.each([
    ["no trial ran", (input: ReturnType<typeof promotionFixture>["input"]) => { input.standing = undefined; }, "not_tested", "candidate.trial_not_run"],
    ["the judge was unsure", (input: ReturnType<typeof promotionFixture>["input"]) => { input.standing = { ...input.standing!, verdict: "unsure", feedback: { code: "candidate.trial_unconfirmed" } }; }, "unsure", "candidate.trial_unconfirmed"],
    ["the judge said no", (input: ReturnType<typeof promotionFixture>["input"]) => { input.standing = { ...input.standing!, verdict: "no", feedback: { code: "candidate.trial_judged_no" } }; }, "no", "candidate.trial_judged_no"],
    ["the yes was for an older revision", (input: ReturnType<typeof promotionFixture>["input"]) => { input.standing = { ...input.standing!, revision: 1 }; }, "yes", "candidate.trial_stale_revision"],
    ["no trial record stands behind the yes", (input: ReturnType<typeof promotionFixture>["input"]) => { input.trials = input.trials.slice(0, 1); }, "yes", "candidate.trial_record_missing"],
    ["the authoritative draft cannot be read", (input: ReturnType<typeof promotionFixture>["input"]) => { input.readAuthoritative = async () => undefined; }, "yes", "candidate.promotion_draft_unreadable"],
    ["the stored plan no longer hashes to the trial digest", (input: ReturnType<typeof promotionFixture>["input"]) => { const read = input.readAuthoritative; input.readAuthoritative = async () => { const stored = (await read())!; stored.candidate.buildPlan.plan.subflows[0]!.name = "Swapped"; return stored; }; }, "yes", "candidate.promotion_digest_mismatch"],
    ["the stored draft names another candidate", (input: ReturnType<typeof promotionFixture>["input"]) => { const read = input.readAuthoritative; input.readAuthoritative = async () => ({ ...(await read())!, candidateId: "candidate.2" }); }, "yes", "candidate.promotion_digest_mismatch"],
    ["the Flow's instructions changed since the trial", (input: ReturnType<typeof promotionFixture>["input"]) => { input.currentBinding = async () => ({ executionDigest: "edited", settingsRevision: 4 }); }, "yes", "FLOW_BOOTSTRAP_STALE"],
    ["the Flow's settings changed since the trial", (input: ReturnType<typeof promotionFixture>["input"]) => { input.currentBinding = async () => ({ executionDigest: "base", settingsRevision: 5 }); }, "yes", "FLOW_BOOTSTRAP_STALE"]
  ] as const)("stays a draft when %s, and proposes nothing", async (_name, change, verdict, code) => {
    const { input, propose } = promotionFixture();
    change(input);
    expect(await promoteAutomationStudioCandidateTrial(input)).toMatchObject({ status: "draft", trial: { verdict, codes: [code] } });
    expect(propose).not.toHaveBeenCalled();
  });

  it("a base that moves under the adaptation lock keeps the draft as stale; any other failure is thrown", async () => {
    const stale = promotionFixture();
    stale.propose.mockRejectedValueOnce(new Error("FLOW_BOOTSTRAP_STALE: base dependency digest does not match the current Flow."));
    expect(await promoteAutomationStudioCandidateTrial(stale.input)).toEqual({ status: "draft", trial: { verdict: "yes", runId: "trial.2", codes: ["FLOW_BOOTSTRAP_STALE"] } });
    const broken = promotionFixture();
    broken.propose.mockRejectedValueOnce(new Error("disk full"));
    await expect(promoteAutomationStudioCandidateTrial(broken.input)).rejects.toThrow("disk full");
  });
});
