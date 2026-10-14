import { parseAutomationStudioFlowBootstrapGenerationError } from "../../flow-bootstrap/generation-failure/index.ts";
import type { AutomationStudioSiteResetNamedAct } from "../../flow-bootstrap/site-reset/index.ts";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioSubflowBuilderOutcome, AutomationStudioSubflowProposal, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectReceiptRef, AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";

// Every way a brief can end, as the return the supervisor reads
// (`contracts/builder-return.ts`). A throw, an allowance refusal or a stop is
// the brief's ending, `partial` when a proposal of its subflow stands and
// `blocked` when none does, with its reason in plain words -- never the
// dispatcher's failure. `done` is said only of a build whose latest proposal's
// trial answered yes, and of a reset that left nothing to undo.
//
// **A return says why (t581).** On the A8 bigbox run every brief came back
// with "iteration_limit" or "Flow Bootstrap generation failed", and the
// supervisor resent the same briefs unchanged because nothing told it what had
// gone wrong. A builder's return now carries the honest ending the builder
// gave, when it gave one (`blocked`, or `partial` while a proposal stands),
// and every return of a brief that did not pass says what its last trial
// answered: which predecessor's entry was missing, failed or stale, the step
// that failed and its code, or the judge's words.
//
// **A stop names the loop's own ending (t588).** On A8 launch 6 a towels brief
// came back "The builder failed: Flow Bootstrap generation failed
// (flow_bootstrap.evidence_repeat_without_progress)" and nothing more, though
// every call it made had been refused `not_at_start_location`. A loop that
// stopped -- returned failed, or threw one of Core's own build failures --
// now says what stopped it: an invalid configuration's check, figures and
// sentence (t584), the guard's codes, and the calls it stopped on, each by its
// tool, node and result code and reason, a run of the same answer counted.
// Codes and ids only: nothing the model wrote.

/** What a return's reason may hold (`contracts/builder-return.ts`). */
const MAX_REASON = 2000;
const MAX_ERROR_WORDS = 300;
/** The most of the builder's own words, and of one quoted page or judge text, a reason carries, so the trial's account still fits. */
const MAX_ENDING_WORDS = 1000;
const MAX_QUOTED = 200;
/** The step kinds a trial runs around the subflow (its start, the call into it): a failure there is the subflow's step failing inside. */
const FRAME_STEP = /^builtin\.control\./u;
/** How many of a stopped loop's last answered calls its return names, a run of the same answer said once. */
const MAX_LAST_CALLS = 8;
/** A code or id that may be said: no whitespace, so never a sentence the model wrote. */
const SAYABLE = /^[a-z0-9_.:-]{1,120}$/iu;

/** What a brief spent and tried, whichever way it ended. */
export type AutomationStudioProjectDispatchSpend = {
  allowance: AutomationStudioLlmBuildPurse | undefined;
  trials: readonly AutomationStudioProjectReceiptRef[];
  /** The latest proposal Core accepted, for a builder whose loop then threw. */
  accepted?: Readonly<AutomationStudioSubflowProposal> | undefined;
};

export const automationStudioProjectDispatchEnding = Object.freeze({
  /** A brief that never started: nothing spent, nothing tried. */
  notStarted(brief: AutomationStudioProjectSubflowBrief, reason: string): AutomationStudioProjectBuilderReturn {
    return { briefId: brief.briefId, outcome: "blocked", reason: clip(reason), trials: [], spentUsd: 0, calls: 0 };
  },

  /** A builder loop that returned. */
  built(brief: AutomationStudioProjectSubflowBrief, outcome: AutomationStudioSubflowBuilderOutcome, spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
    const proposal = outcome.proposal ?? spend.accepted;
    const lastTrial = trialSaid(outcome.lastTrial ?? outcome.trial);
    if (outcome.loop.ok && outcome.ended) {
      // The builder's own ending; `partial` only while a proposal stands (header).
      const as = outcome.ended.outcome === "partial" && proposal ? "partial" : "blocked";
      return returned(brief, as, `The builder ended this brief ${as}: ${clipped(outcome.ended.reason, MAX_ENDING_WORDS)}${lastTrial}`, spend, proposal);
    }
    if (outcome.loop.ok && proposal) {
      const verdict = outcome.trial?.verdict;
      if (verdict === "yes") return returned(brief, "done", `Revision ${proposal.revision} of the subflow was tried on its own and its trial answered yes.`, spend, proposal);
      const why = verdict === undefined
        ? `The builder completed revision ${proposal.revision}, but no subflow trial could run here, so it stands untried.`
        : `The builder completed revision ${proposal.revision}, but its latest trial answered ${verdict}.`;
      return returned(brief, "partial", `${why}${lastTrial}`, spend, proposal);
    }
    const ended = outcome.loop.ok ? "The builder completed without a proposal of its subflow." : stopReason(outcome.loop, spend.allowance);
    return returned(brief, proposal ? "partial" : "blocked", `${ended}${lastTrial}`, spend, proposal);
  },

  /** A builder or reset that threw, or was stopped. */
  thrown(brief: AutomationStudioProjectSubflowBrief, error: unknown, stopped: boolean, spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
    const refusal = spend.allowance?.refusal;
    const why = stopped
      ? "The build was stopped before this brief finished."
      : refusal
        ? `This brief's allowance could not pay for its next call (${refusal.code}).`
        : `The builder failed: ${errorWords(error)}${thrownEnding(error)}`;
    return returned(brief, spend.accepted ? "partial" : "blocked", why, spend, spend.accepted);
  },

  /** A reset loop that returned, and what it left to undo. */
  reset(brief: AutomationStudioProjectSubflowBrief, loop: AutomationStudioLlmEvidenceLoopResult, left: readonly AutomationStudioSiteResetNamedAct[], spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
    if (loop.ok && !left.length) return returned(brief, "done", "Every lasting act this build made is undone; the site is as the build found it.", spend, undefined);
    const still = left.length ? ` ${left.length} act${left.length === 1 ? " is" : "s are"} still to undo: ${left.map((act) => `${act.act} (${act.did})`).join(", ")}.` : "";
    const ended = loop.ok ? "The reset completed." : stopReason(loop, spend.allowance);
    return returned(brief, "blocked", `${ended}${still}`, spend, undefined);
  }
});

function returned(
  brief: AutomationStudioProjectSubflowBrief,
  outcome: AutomationStudioProjectBuilderReturn["outcome"],
  reason: string,
  spend: AutomationStudioProjectDispatchSpend,
  proposal: Readonly<AutomationStudioSubflowProposal> | undefined
): AutomationStudioProjectBuilderReturn {
  const value: AutomationStudioProjectBuilderReturn = {
    briefId: brief.briefId,
    outcome,
    reason: clip(reason),
    trials: spend.trials.map((trial) => ({ ...trial })),
    spentUsd: spend.allowance?.spentUsd() ?? 0,
    calls: spend.allowance?.spentCalls() ?? 0
  };
  if (proposal) value.proposal = { subflowKey: proposal.scope.subflowKey, revision: proposal.revision, digest: proposal.digest };
  return value;
}

/** Why a loop ended without completing: its allowance, when that refused, otherwise its own code. */
function stopReason(loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>, allowance: AutomationStudioLlmBuildPurse | undefined): string {
  const refusal = allowance?.refusal;
  if (refusal) return `This brief's allowance could not pay for its next call (${refusal.code}), so the builder stopped.`;
  return `The builder stopped before completing (${loop.code}).${configurationSaid(loop.configuration)}${guardSaid(loop.exhaustion?.lastIssueCodes)}${callsSaid(loop.trace)}`;
}

/** One answered call, as a loop's trace row or a stored failure's step holds it. */
type AnsweredCall = { toolId?: string | undefined; decision?: string | undefined; nodeId?: string | undefined; resultCode?: string | undefined; resultReason?: string | undefined };

/** What one of Core's own build failures says of the loop it ended, or nothing for any other throw (header). */
function thrownEnding(error: unknown): string {
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
  if (!diagnostic) return "";
  return `${guardSaid(diagnostic.issueCodes)}${callsSaid(diagnostic.evidenceLoop?.steps ?? [])}`;
}

/** The check that refused the loop's configuration, its figures and its sentence (t584). */
function configurationSaid(configuration: { check: string; values: JsonObject; words: string } | undefined): string {
  if (!configuration) return "";
  const figures = Object.entries(configuration.values).map(([name, value]) => `${name} ${JSON.stringify(value)}`).join(", ");
  return ` Its configuration was refused by the check ${configuration.check}${figures ? ` (${clipped(figures, MAX_QUOTED)})` : ""}: ${clipped(configuration.words, MAX_QUOTED)}`;
}

/** The codes the guard that stopped the loop recorded the stop under. */
function guardSaid(codes: readonly string[] | undefined): string {
  const said = [...new Set((codes ?? []).filter((code) => SAYABLE.test(code)))];
  return said.length ? ` It was stopped by ${said.join(", ")}.` : "";
}

/**
 * The calls the loop stopped on: its last answered ones, most recent first,
 * each by tool, node, result code and reason, and a run of the same answer
 * said once with its count -- so "every call was refused not_at_start_location"
 * reads as such, beside the guard's own refusal of the repeat.
 */
function callsSaid(rows: readonly AnsweredCall[]): string {
  const answered = rows.filter((row) => row.resultCode !== undefined && SAYABLE.test(row.resultCode)).slice(-MAX_LAST_CALLS).reverse();
  const runs: Array<{ said: string; count: number }> = [];
  for (const row of answered) {
    const said = callSaid(row);
    const last = runs.at(-1);
    if (last?.said === said) last.count += 1;
    else runs.push({ said, count: 1 });
  }
  if (!runs.length) return "";
  return ` The calls it stopped on, latest first: ${runs.map((run) => (run.count > 1 ? `${run.said} (${run.count} in a row)` : run.said)).join("; ")}.`;
}

function callSaid(row: AnsweredCall): string {
  const tool = [row.toolId, row.decision].find((value): value is string => typeof value === "string" && SAYABLE.test(value)) ?? "a decision";
  const node = row.nodeId && SAYABLE.test(row.nodeId) ? ` on ${row.nodeId}` : "";
  const reason = row.resultReason && SAYABLE.test(row.resultReason) ? ` (${row.resultReason})` : "";
  return `${tool}${node} answered ${row.resultCode}${reason}`;
}

/**
 * What the last trial answered, as a sentence after a return's reason, or
 * nothing when no trial ran or it answered yes (header). Page and judge text is
 * quoted short; codes are said as they are.
 */
function trialSaid(trial: AutomationStudioSubflowTrialResult | undefined): string {
  if (!trial || (trial.verdict === "yes" && trial.entryPrepared)) return "";
  const feedback = trial.feedback;
  const code = text(feedback.code);
  const head = ` Its last trial, of revision ${trial.revision}, answered ${trial.verdict}${code ? ` (${code})` : ""}`;
  if (!trial.entryPrepared) return `${head}: ${entrySaid(feedback)}`;
  const step = failedStep(feedback.steps);
  if (step) return `${head}: ${step}`;
  const judge = isObject(feedback.judge) ? feedback.judge : undefined;
  const judged = text(judge?.observed) ?? text(judge?.advice) ?? text(feedback.why);
  return judged ? `${head}: the judge said ${quoted(judged)}.` : `${head}.`;
}

/** Why the trial's entry was not prepared: which predecessor had no passing proposal, failed, or was proposed against another plan. */
function entrySaid(feedback: JsonObject): string {
  const missing = names(feedback.missing);
  if (missing) return `its entry was never prepared, because no proposal of ${missing} had passed its own trial, so this subflow's own steps were not tried.`;
  const failed = text(feedback.failedPredecessor);
  if (failed) return `its entry was never prepared, because the predecessor subflow "${failed}" failed while preparing it, so this subflow's own steps were not tried.`;
  const stale = names(feedback.stale);
  if (stale) return `its entry was never prepared, because the proposal of ${stale} was made against another plan, so this subflow's own steps were not tried.`;
  return "its entry was never prepared, so this subflow's own steps were not tried.";
}

/** The step the subflow failed at, its control and failure code, from the trial's step list: the last failed step that is not the trial's frame. */
function failedStep(steps: JsonValue | undefined): string | undefined {
  if (!Array.isArray(steps)) return undefined;
  const failed = steps.filter((step): step is JsonObject => isObject(step) && step.status === "failed");
  const step = failed.filter((entry) => !FRAME_STEP.test(text(entry.definitionId) ?? "")).at(-1) ?? failed.at(-1);
  if (!step) return undefined;
  const label = text(step.label);
  const control = text(step.control);
  const failure = text(step.failureCode);
  const happened = text(step.happened);
  return `step ${typeof step.step === "number" ? step.step : "?"}${label ? ` ${quoted(label)}` : ""}${control ? ` on ${quoted(control)}` : ""} failed${failure ? ` with ${failure}` : ""}${happened ? ` (${clipped(happened, MAX_QUOTED)})` : ""}.`;
}

function names(value: JsonValue | undefined): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const listed = value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return listed.length ? listed.map((entry) => `"${entry}"`).join(", ") : undefined;
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function quoted(value: string): string {
  return `"${clipped(value, MAX_QUOTED)}"`;
}

function clipped(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorWords(error: unknown): string {
  const words = error instanceof Error ? error.message : String(error);
  const trimmed = words.trim() || "no reason was given";
  return trimmed.length > MAX_ERROR_WORDS ? `${trimmed.slice(0, MAX_ERROR_WORDS - 3)}...` : trimmed;
}

function clip(reason: string): string {
  return reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON - 3)}...` : reason;
}
