import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS, type AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioProjectJsonShape as shape, type AutomationStudioProjectParse } from "./json-shape.ts";
import { readAutomationStudioProjectReceiptRef, type AutomationStudioProjectReceiptRef } from "./receipt-ref.ts";
import type { AutomationStudioProjectSubflowBrief } from "./subflow-brief.ts";

// What a builder hands back: compact by construction, because the supervisor
// reads this and never the builder's history. A return is bound to its brief
// -- and through the brief to one structure-plan digest -- so a proposal for
// another subflow, or a survey's findings on a build, is refused.

/**
 * A trial a return lists (t606): its receipt reference, and beside it what the
 * trial answered and how many rows it stored, so the supervisor can tell the
 * trial closest to passing from the latest (`closestTrial` below).
 * A8 towels (`run-mv8p37k8-f1a90624`) had three trials store exactly the
 * right rows and answer unsure, and the repair was sent the latest, a no that
 * stored two. `verdict` and `rows` are additive: the reference a repair's
 * `failingReceipt` copies is still `kind`, `receiptId` and `digest`, and the
 * digest is made as before, from the trial's verdict among the rest
 * (`../dispatch/receipts.ts`), so these fields never change it. A return
 * written before them lists neither.
 */
export type AutomationStudioProjectTrialRef = AutomationStudioProjectReceiptRef & {
  verdict?: AutomationStudioCandidateTrialVerdict;
  /** The rows the trial stored, where its feedback said. */
  rows?: number;
};

export const AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES = Object.freeze(["done", "partial", "blocked"] as const);

export type AutomationStudioProjectBuilderReturn = {
  briefId: string;
  outcome: (typeof AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES)[number];
  reason: string;
  proposal?: { subflowKey: string; revision: number; digest: string };
  trials: AutomationStudioProjectTrialRef[];
  interfaceRequest?: { change: string; why: string };
  /** Survey only. */
  findings?: string[];
  /**
   * The output, by the name the brief's interface gives it, that the brief's latest submission was refused for binding
   * to no value, on a return that is not done (t645): the plan asks the subflow for a value none of its steps makes,
   * and the supervisor is told which subflow takes it (`../supervisor/dispatch-tool.ts`). Absent from returns before it.
   */
  unmadeOutput?: string;
  /**
   * A blocked return's part a subflow before this one already does, by the brief's part id, and the act the run that
   * prepared its entry landed for it where the builder named one (t676): Core checked that claim before the builder's
   * ending was taken (`../../flow-bootstrap/subflow-candidate/done-before.ts`). Absent from every other return.
   */
  doneBefore?: { part: string; act?: string };
  /**
   * Set on a return that is not done when Core's no-progress guard stopped its builder for repeating calls that made
   * no progress (live lane 1 fix 1): read from the loop's own failure code (`../dispatch/ending.ts`), never from the
   * reason's words. One brief of its subflow may then be sent again unchanged, carrying this attempt
   * (`earlierAttempt`, `./subflow-brief.ts`; `../supervisor/dispatch-tool.ts`). Absent from every other return.
   */
  stoppedRepeating?: true;
  /**
   * Set on a return that is not done when nothing a changed brief could say would let it go on (t743), from a closed
   * list read structurally where the return is made (`../dispatch/ending.ts`), never from the reason's words:
   * `allowance_spent`, the brief's allowance refused its next call; `stopped`, the build was stopped; `person_ended`,
   * the brief's permission or person-needed ending stopped it (a lasting act the person did not permit, or a check only
   * a person can pass); `gate_unsatisfiable`, the trial gate's start can never be met (wired from the reset ledger).
   * The supervisor's repair-first rule (`../supervisor/completion.ts`) does not hold an ending for such a return.
   * Absent from every other return.
   */
  terminalReason?: (typeof TERMINAL_REASONS)[number];
  spentUsd: number;
  calls: number;
};

/** The closed terminal reasons a return may carry (`terminalReason`, t743). */
const TERMINAL_REASONS = Object.freeze(["allowance_spent", "stopped", "person_ended", "gate_unsatisfiable"] as const);

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
   * whose run failed; among the same verdict, more rows stored; among equals,
   * the latest. A trial that answered yes is no failing trial and is never
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

  /** Whether `left` ranks strictly above `right` as `closestTrial` ranks them. */
  trialAbove(left: AutomationStudioProjectTrialRef, right: AutomationStudioProjectTrialRef): boolean {
    return trialAbove(left, right);
  },

  /** The reference a brief's `failingReceipt` copies of a listed trial: kind, receipt id and digest, nothing beside them. */
  trialRef(trial: AutomationStudioProjectTrialRef): AutomationStudioProjectReceiptRef {
    return { kind: trial.kind, receiptId: trial.receiptId, digest: trial.digest };
  }
});

const TRIAL_RANK: Readonly<Record<string, number>> = { unsure: 3, no: 2, not_judged: 1, execution_failed: 0 };

function trialRank(trial: AutomationStudioProjectTrialRef): [number, number] {
  return [trial.verdict === undefined ? -1 : TRIAL_RANK[trial.verdict] ?? -1, trial.rows ?? -1];
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
