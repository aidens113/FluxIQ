// Whether a trial result satisfies the "whole Flow run from its start judged
// successful at least once" gate (user rule, 2026-10-02). The final judged
// whole run stays live: an offline pass never satisfies it, even over the full
// recorded path (trace-offline-trials-plan, Decision 3). The live pass must be
// of the exact candidate revision and digest and the goal contract the gate is
// deciding for, so a pass of an earlier revision does not carry over.

import { isAutomationStudioTrialEvidenceLiveSuccess } from "./live-success-eligibility.ts";
import type { AutomationStudioTrialEvidenceGateSubject } from "./types.ts";
import { validateAutomationStudioTrialEvidenceResult } from "./validate-trial-evidence-result.ts";

/** Whether `input` is a live success of exactly `subject`'s candidate and goal contract. */
export function satisfiesAutomationStudioWholeRunGate(input: unknown, subject: AutomationStudioTrialEvidenceGateSubject): boolean {
  if (!isAutomationStudioTrialEvidenceLiveSuccess(input)) return false;
  const answer = validateAutomationStudioTrialEvidenceResult(input);
  if (!answer.ok) return false;
  return (
    answer.result.candidateRevision === subject.candidateRevision &&
    answer.result.candidateDigest === subject.candidateDigest &&
    answer.result.goalContractVersion === subject.goalContractVersion
  );
}
