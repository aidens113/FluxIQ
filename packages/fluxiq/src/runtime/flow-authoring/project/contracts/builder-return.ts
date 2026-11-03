import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectParse, AutomationStudioProjectReceiptRef, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTrialRef } from "../../../../flows/authoring/project/index.ts";
import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";
import { AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES, AUTOMATION_STUDIO_PROJECT_TERMINAL_REASONS as TERMINAL_REASONS } from "../../../../flows/authoring/project/index.ts";
import { readAutomationStudioProjectReceiptRef } from "./receipt-ref.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS } from "../../../../flows/authoring/plan/index.ts";

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
    // A part done before ends a brief blocked, and is one of the brief's own parts (t676).
    if (returned.doneBefore !== undefined && (returned.outcome !== "blocked" || !brief.parts.includes(returned.doneBefore.part))) issues.push({ code: "project.return_done_before", path: "return.doneBefore" });
    // A builder stopped for repeating itself never ends its brief done (lane-1 fix 1).
    if (returned.stoppedRepeating !== undefined && returned.outcome === "done") issues.push({ code: "project.return_stopped_repeating", path: "return.stoppedRepeating" });
    // A closed terminal reason ends a brief that is not done (t743).
    if (returned.terminalReason !== undefined && returned.outcome === "done") issues.push({ code: "project.return_terminal_reason", path: "return.terminalReason" });
    if (returned.unmadeOutput !== undefined && (returned.outcome === "done" || !(brief.interface?.outputs ?? []).some((port) => port.id === returned.unmadeOutput))) issues.push({ code: "project.return_unmade_output", path: "return.unmadeOutput" });
    // A reset is done when nothing of the build is left to undo; it proposes no subflow.
    if (brief.kind === "reset" && returned.proposal) issues.push({ code: "project.return_reset_proposal", path: "return.proposal" });
    if (returned.outcome === "done" && brief.kind !== "survey" && brief.kind !== "reset" && !returned.proposal) issues.push({ code: "project.return_done_without_proposal", path: "return.proposal" });
    if (returned.outcome === "done" && brief.kind === "survey" && !returned.findings?.length) issues.push({ code: "project.return_done_without_findings", path: "return.findings" });
    return issues;
  },

  /**
   * The trial of a subflow a repair should start from (t606): the closest to
   * passing of every trial the returns given (oldest first) listed, not the
   * latest. Unsure over no, no over a trial that was not judged, that over one
   * whose run failed; among the same verdict, the latest, unless the latest
   * stored no answer rows and an earlier one did, then the latest that did
   * (header, t752). A trial that answered yes is no failing trial and is never
   * chosen, and one listed without its verdict ranks below every one with it.
   * Undefined when no trial that did not pass was listed.
   */
  closestTrial(returns: readonly AutomationStudioProjectBuilderReturn[]): AutomationStudioProjectTrialRef | undefined {
    let closest: AutomationStudioProjectTrialRef | undefined;
    for (const trial of returns.flatMap((returned) => returned.trials)) {
      if (trial.verdict === "yes") continue;
      // The latest among equals: a later trial replaces one it does not rank below.
      if (!closest || !trialAbove(closest, trial)) closest = trial;
    }
    return closest;
  },

  /**
   * Whether `left` ranks strictly above `right` as `closestTrial` ranks them, order aside: a better verdict, or the
   * same verdict with answer rows stored where `right` stored none (header, t752). Two trials of one verdict that both
   * stored answer rows, or neither did, rank equal; `closestTrial` then takes the later.
   */
  trialAbove(left: AutomationStudioProjectTrialRef, right: AutomationStudioProjectTrialRef): boolean {
    return trialAbove(left, right);
  },

  /** The reference a brief's `failingReceipt` copies of a listed trial: kind, receipt id and digest, nothing beside them. */
  trialRef(trial: AutomationStudioProjectTrialRef): AutomationStudioProjectReceiptRef {
    return { kind: trial.kind, receiptId: trial.receiptId, digest: trial.digest };
  }
});

const TRIAL_RANK: Readonly<Record<string, number>> = { unsure: 3, no: 2, not_judged: 1, execution_failed: 0 };

/** A trial's verdict rank, and whether it stored answer rows: the count itself never ranks it (header, t752). */
function trialRank(trial: AutomationStudioProjectTrialRef): [number, number] {
  return [trial.verdict === undefined ? -1 : TRIAL_RANK[trial.verdict] ?? -1, (trial.rows ?? 0) > 0 ? 1 : 0];
}

function trialAbove(left: AutomationStudioProjectTrialRef, right: AutomationStudioProjectTrialRef): boolean {
  const [a, b] = [trialRank(left), trialRank(right)];
  return a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];
}

function read(value: unknown): AutomationStudioProjectBuilderReturn {
  const fields = shape.object(value, "return", ["briefId", "outcome", "reason", "trials", "spentUsd", "calls"], ["proposal", "interfaceRequest", "findings", "unmadeOutput", "doneBefore", "stoppedRepeating", "terminalReason"]);
  const returned: AutomationStudioProjectBuilderReturn = {
    briefId: shape.storageId(fields.briefId, "return.briefId"),
    outcome: shape.oneOf(fields.outcome, "return.outcome", AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES),
    reason: shape.text(fields.reason, "return.reason", LIMITS.reason),
    trials: shape.array(fields.trials, "return.trials", LIMITS.trials).map((trial, index) => readTrial(trial, `return.trials.${index}`)),
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
  if (fields.unmadeOutput !== undefined) returned.unmadeOutput = shape.id(fields.unmadeOutput, "return.unmadeOutput");
  if (fields.doneBefore !== undefined) {
    const doneBefore = shape.object(fields.doneBefore, "return.doneBefore", ["part"], ["act"]);
    returned.doneBefore = { part: shape.id(doneBefore.part, "return.doneBefore.part"), ...(doneBefore.act !== undefined ? { act: shape.id(doneBefore.act, "return.doneBefore.act") } : {}) };
  }
  if (fields.stoppedRepeating !== undefined) returned.stoppedRepeating = fields.stoppedRepeating === true ? true : shape.refuse("project.not_true", "return.stoppedRepeating");
  if (fields.terminalReason !== undefined) returned.terminalReason = shape.oneOf(fields.terminalReason, "return.terminalReason", TERMINAL_REASONS);
  if (fields.findings !== undefined) returned.findings = shape.array(fields.findings, "return.findings", LIMITS.findings).map((finding, index) => shape.text(finding, `return.findings.${index}`, LIMITS.finding));
  return returned;
}

/** One listed trial: its receipt reference read as ever, and its verdict and stored rows where given (header). */
function readTrial(value: unknown, path: string): AutomationStudioProjectTrialRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return readAutomationStudioProjectReceiptRef(value, path);
  const { verdict, rows, ...ref } = value as Record<string, unknown>;
  const trial: AutomationStudioProjectTrialRef = readAutomationStudioProjectReceiptRef(ref, path);
  if (verdict !== undefined) trial.verdict = shape.oneOf(verdict, `${path}.verdict`, AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS);
  if (rows !== undefined) trial.rows = shape.count(rows, `${path}.rows`);
  return trial;
}
