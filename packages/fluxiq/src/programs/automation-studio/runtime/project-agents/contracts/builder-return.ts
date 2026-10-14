import { automationStudioProjectJsonShape as shape, type AutomationStudioProjectParse } from "./json-shape.ts";
import { readAutomationStudioProjectReceiptRef, type AutomationStudioProjectReceiptRef } from "./receipt-ref.ts";
import type { AutomationStudioProjectSubflowBrief } from "./subflow-brief.ts";

// What a builder hands back: compact by construction, because the supervisor
// reads this and never the builder's history. A return is bound to its brief
// -- and through the brief to one structure-plan digest -- so a proposal for
// another subflow, or a survey's findings on a build, is refused.

export const AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES = Object.freeze(["done", "partial", "blocked"] as const);

export type AutomationStudioProjectBuilderReturn = {
  briefId: string;
  outcome: (typeof AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES)[number];
  reason: string;
  proposal?: { subflowKey: string; revision: number; digest: string };
  trials: AutomationStudioProjectReceiptRef[];
  interfaceRequest?: { change: string; why: string };
  /** Survey only. */
  findings?: string[];
  spentUsd: number;
  calls: number;
};

const LIMITS = { reason: 2000, trials: 100, findings: 50, finding: 2000 } as const;

export const automationStudioProjectBuilderReturn = Object.freeze({
  parse(value: unknown): AutomationStudioProjectParse<AutomationStudioProjectBuilderReturn> {
    return shape.parse(() => read(value));
  },

  /** What stops this return being accepted as the answer to this brief. */
  issues(returned: AutomationStudioProjectBuilderReturn, brief: AutomationStudioProjectSubflowBrief): Array<{ code: string; path: string }> {
    const issues: Array<{ code: string; path: string }> = [];
    if (returned.briefId !== brief.briefId) issues.push({ code: "project.return_brief_mismatch", path: "return.briefId" });
    if (returned.proposal && returned.proposal.subflowKey !== brief.subflowKey) issues.push({ code: "project.return_subflow_mismatch", path: "return.proposal.subflowKey" });
    if (brief.kind === "survey" && returned.proposal) issues.push({ code: "project.return_survey_proposal", path: "return.proposal" });
    if (brief.kind !== "survey" && returned.findings) issues.push({ code: "project.return_findings_not_survey", path: "return.findings" });
    // A reset is done when nothing of the build is left to undo; it proposes no subflow.
    if (brief.kind === "reset" && returned.proposal) issues.push({ code: "project.return_reset_proposal", path: "return.proposal" });
    if (returned.outcome === "done" && brief.kind !== "survey" && brief.kind !== "reset" && !returned.proposal) issues.push({ code: "project.return_done_without_proposal", path: "return.proposal" });
    if (returned.outcome === "done" && brief.kind === "survey" && !returned.findings?.length) issues.push({ code: "project.return_done_without_findings", path: "return.findings" });
    return issues;
  }
});

function read(value: unknown): AutomationStudioProjectBuilderReturn {
  const fields = shape.object(value, "return", ["briefId", "outcome", "reason", "trials", "spentUsd", "calls"], ["proposal", "interfaceRequest", "findings"]);
  const returned: AutomationStudioProjectBuilderReturn = {
    briefId: shape.storageId(fields.briefId, "return.briefId"),
    outcome: shape.oneOf(fields.outcome, "return.outcome", AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES),
    reason: shape.text(fields.reason, "return.reason", LIMITS.reason),
    trials: shape.array(fields.trials, "return.trials", LIMITS.trials).map((trial, index) => readAutomationStudioProjectReceiptRef(trial, `return.trials.${index}`)),
    spentUsd: shape.amount(fields.spentUsd, "return.spentUsd"),
    calls: shape.count(fields.calls, "return.calls")
  };
  if (fields.proposal !== undefined) {
    const proposal = shape.object(fields.proposal, "return.proposal", ["subflowKey", "revision", "digest"]);
    returned.proposal = { subflowKey: shape.id(proposal.subflowKey, "return.proposal.subflowKey"), revision: shape.count(proposal.revision, "return.proposal.revision", 1), digest: shape.digest(proposal.digest, "return.proposal.digest") };
  }
  if (fields.interfaceRequest !== undefined) {
    const request = shape.object(fields.interfaceRequest, "return.interfaceRequest", ["change", "why"]);
    returned.interfaceRequest = { change: shape.text(request.change, "return.interfaceRequest.change", LIMITS.reason), why: shape.text(request.why, "return.interfaceRequest.why", LIMITS.reason) };
  }
  if (fields.findings !== undefined) returned.findings = shape.array(fields.findings, "return.findings", LIMITS.findings).map((finding, index) => shape.text(finding, `return.findings.${index}`, LIMITS.finding));
  return returned;
}
