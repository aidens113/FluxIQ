import { parseAutomationStudioFlowBootstrapGenerationError } from "../../flow-bootstrap/generation-failure/index.ts";
import type { AutomationStudioSiteResetNamedAct } from "../../flow-bootstrap/site-reset/index.ts";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioSubflowBuilderOutcome, AutomationStudioSubflowDoneBefore, AutomationStudioSubflowProposal, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/index.ts";
import { automationStudioCandidateRefusalCodes as refusalCodes } from "../../service/candidate-failure/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectReceiptRef, AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import { automationStudioProjectDispatchAllowanceSaid, type AutomationStudioProjectDispatchSizedAtStart } from "./allowance-said.ts";

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
//
// **A standing yes is done, however the loop stopped (t611).** A8 social
// `run-mv8ic6mk-09bf12ff`: a builder whose latest proposal's trial answered
// yes sent a receipt with an ending beside it, was refused the shape until its
// loop stopped, and came back `partial`; the supervisor amended a subflow that
// had passed. The trial's receipt is Core's evidence, not the builder's words:
// whenever the latest proposal has a standing yes with its entry prepared,
// the return is `done` with that proposal and its receipts, and its reason says
// how the builder stopped after it. And a return that is not done says when its
// last trial was a yes -- of a revision the builder then replaced -- where it
// once said nothing. A builder whose loop threw is held to the same check
// (`passedProposal`), against the latest proposal Core accepted and the last
// trial its port answered (`spend.trial`, kept by `./run-brief.ts`): done on a
// yes of exactly that proposal, today's return otherwise.
//
// **A return says its money (t627).** Every return of a brief that ran ends with
// what it was given when it started, where that was less than the dispatch
// sized it at, and each top-up its allowance drew from the build's purse, in
// figures (`./allowance-said.ts`); the rest of its reason is clipped to leave
// room for them.
//
// **A refused submission says its issues (everything-store debug, t630).** A8
// wave 7 `run-mv9dd0fk-8cd2e522` came back blocked "core.submit_subflow
// answered subflow.scope_refused:b54daa6d (3 in a row)": the suffix is a digest
// of the refusal's issues, which keeps two refusals apart for the repeat guard
// and means nothing to the supervisor, and the one fact it needed --
// `subflow.input_unread`, the plan's input no step read -- was behind it. Where
// the stop's codes carry the last refused submission's issues
// (`candidate.last_submission_*`, `../../service/candidate-failure/refusal-codes.ts`),
// the run of that refusal is said by its family and its issue codes instead,
// an unread input by the name the brief's interface gives it, and the codes
// leave the guard's sentence. Since t672 only an input the person gives the
// Flow is refused unread, so the reason ends with that advice: give the value
// to the subflow that uses it, or say where this one does. Codes and Core's
// own port names only.
//
// **An input the subflow did not need is said, not amended (t672).** On the A8
// Lab run `run-mvan7giv-4246aafb` a builder's input handed on by an earlier
// subflow was one none of its lines needed; it was refused, the brief ended
// blocked, and the supervisor amended the plan and had the earlier subflow
// rebuilt. Such an input is now accepted unread and carried on the proposal
// (`unneededInputs`, `flow-bootstrap/subflow-candidate/scoped-submission.ts`),
// and every return with that proposal says, by the input's name, that the
// subflow did not need it and the plan needs no change for it.
//
// **An output the subflow cannot make is the plan's to change (A8 frozen pair
// 3 bigbox, t645).** `run-mv9zn5ob-d929084d` planned an output no step of its
// producer could make; the builder was refused it fourteen times across two
// briefs, and both came back with codes that never said the plan was at fault.
// A last refused submission carrying `subflow.output_not_a_value` or
// `subflow.output_unknown_port` is said with the output by the name the
// brief's interface gives it, and the reason ends with the plan's advice: drop
// the value and keep `after` when a later subflow needs only what this one
// leaves on the target. The same words end a brief Core stops itself once one
// output was refused under two different bindings (`outputStopped`,
// `./output-refusals.ts`).
//
// **A trial's own findings reach the supervisor (t645, with t647).** A trial's
// feedback may carry what Core itself measured of the run under `coreFindings`
// (`{code, act, did, call, said}`, first `trial.explored_on_absorbed_act`: the
// page the builder explored was changed by an act the trial's start undid and
// no step does). The return said only the trial's code, failed step and judge,
// so the supervisor sent a repair "since the act is already done". Each
// finding's `said` -- Core's own sentence -- is now carried after the trial's
// account, by its code, bounded as the rest; the key is read structurally.
//
// **A part done before is said as Core checked it (t676).** A dependent
// builder's blocked ending that a subflow before it did one of its parts is
// admitted only once Core checked it (`doneBefore`,
// `flow-bootstrap/subflow-candidate/builder-loop.ts`): the part asks a lasting
// act, and the act it names is one the run that prepared its entry landed. The
// return's reason says that claim after the builder's words, by the part's id
// and the act's, so the supervisor reads Core's check and not only the
// builder's sentence, and the return carries it as `doneBefore`
// (`contracts/builder-return.ts`).
//
// **A builder stopped for repeating itself is marked so (live lane 1 fix 1,
// `run-mvcx8na6-9554a3f1`).** Its return was blocked with the guard's codes in
// words, and the supervisor's second brief of that subflow was refused as a
// repeat its builder could only do again. A return that is not done because the
// no-progress guard stopped its loop -- a loop that returned
// `llm_evidence_loop.repeat_without_progress`, or threw Core's build failure
// `flow_bootstrap.evidence_repeat_without_progress` -- now carries
// `stoppedRepeating`, read from those codes and never from the reason, so the
// supervisor may send that brief once more with the attempt shown
// (`../supervisor/dispatch-tool.ts`).

/** What a return's reason may hold (`contracts/builder-return.ts`). */
const MAX_REASON = 2000;
const MAX_ERROR_WORDS = 300;
/** The most of the builder's own words, and of one quoted page or judge text, a reason carries, so the trial's account still fits. */
const MAX_ENDING_WORDS = 1000;
const MAX_QUOTED = 200;
/** How many of a trial's Core findings a reason carries, and the most of one finding's sentence (header, t645). */
const MAX_FINDINGS = 3;
const MAX_FINDING_WORDS = 400;
/** The step kinds a trial runs around the subflow (its start, the call into it): a failure there is the subflow's step failing inside. */
const FRAME_STEP = /^builtin\.control\./u;
/** How many of a stopped loop's last answered calls its return names, a run of the same answer said once. */
const MAX_LAST_CALLS = 8;
/** The no-progress guard's stop, as a loop returns it and as Core's build failure publishes it (header, lane-1 fix 1). */
const LOOP_REPEATED = "llm_evidence_loop.repeat_without_progress";
const BUILD_REPEATED = "flow_bootstrap.evidence_repeat_without_progress";
/** A code or id that may be said: no whitespace, so never a sentence the model wrote. */
const SAYABLE = /^[a-z0-9_.:-]{1,120}$/iu;

/** What a brief spent and tried, whichever way it ended. */
export type AutomationStudioProjectDispatchSpend = {
  allowance: AutomationStudioLlmBuildPurse | undefined;
  trials: readonly AutomationStudioProjectReceiptRef[];
  /** The latest proposal Core accepted, for a builder whose loop then threw. */
  accepted?: Readonly<AutomationStudioSubflowProposal> | undefined;
  /** The last subflow trial the brief's port answered, for a builder whose loop then threw: a yes of `accepted` is done (header, t611). */
  trial?: Readonly<AutomationStudioSubflowTrialResult> | undefined;
  /** What the brief started with, where it was sized as it started below what the dispatch sized it at (`./start-allowance.ts`, t627). */
  sizedAtStart?: AutomationStudioProjectDispatchSizedAtStart | undefined;
};

export const automationStudioProjectDispatchEnding = Object.freeze({
  /** A brief that never started: nothing spent, nothing tried. */
  notStarted(brief: AutomationStudioProjectSubflowBrief, reason: string): AutomationStudioProjectBuilderReturn {
    return { briefId: brief.briefId, outcome: "blocked", reason: clip(reason), trials: [], spentUsd: 0, calls: 0 };
  },

  /** A builder loop that returned. */
  built(brief: AutomationStudioProjectSubflowBrief, outcome: AutomationStudioSubflowBuilderOutcome, spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
    // A standing yes for the latest proposal is done, however the loop stopped (header, t611).
    const passed = passedProposal(outcome.proposal, outcome.trial);
    if (passed) {
      if (outcome.loop.ok && !outcome.ended) return returned(brief, "done", passedSaid(passed), spend, passed);
      const after = outcome.loop.ok ? `The builder then ended it ${outcome.ended!.outcome}: ${clipped(outcome.ended!.reason, MAX_ENDING_WORDS)}` : stopReason(brief, outcome.loop, spend.allowance);
      return passedDone(brief, passed, after, spend);
    }
    const proposal = outcome.proposal ?? spend.accepted;
    const lastTrial = trialSaid(outcome.lastTrial ?? outcome.trial, proposal);
    if (outcome.loop.ok && outcome.ended) {
      // The builder's own ending; `partial` only while a proposal stands (header).
      const as = outcome.ended.outcome === "partial" && proposal ? "partial" : "blocked";
      const value = returned(brief, as, `The builder ended this brief ${as}: ${clipped(outcome.ended.reason, MAX_ENDING_WORDS)}${doneBeforeSaid(outcome.ended.doneBefore)}${lastTrial}`, spend, proposal);
      // The claim Core checked rides on a blocked return as well as in its words (header, t676).
      const doneBefore = outcome.ended.doneBefore;
      if (as === "blocked" && doneBefore) value.doneBefore = { part: doneBefore.part, ...(doneBefore.act !== undefined ? { act: doneBefore.act } : {}) };
      return value;
    }
    if (outcome.loop.ok && proposal) {
      const verdict = outcome.trial?.verdict;
      if (verdict === "yes") return returned(brief, "done", `Revision ${proposal.revision} of the subflow was tried on its own and its trial answered yes.`, spend, proposal);
      const why = verdict === undefined
        ? `The builder completed revision ${proposal.revision}, but no subflow trial could run here, so it stands untried.`
        : `The builder completed revision ${proposal.revision}, but its latest trial answered ${verdict}.`;
      return returned(brief, "partial", `${why}${lastTrial}`, spend, proposal);
    }
    const ended = outcome.loop.ok ? "The builder completed without a proposal of its subflow." : stopReason(brief, outcome.loop, spend.allowance);
    const value = returned(brief, proposal ? "partial" : "blocked", `${ended}${lastTrial}`, spend, proposal);
    // The guard's own code, never the reason's words (header, lane-1 fix 1); an allowance refusal is not this stop.
    if (!outcome.loop.ok && outcome.loop.code === LOOP_REPEATED && !spend.allowance?.refusal) value.stoppedRepeating = true;
    return value;
  },

  /** A builder or reset that threw, or was stopped. */
  thrown(brief: AutomationStudioProjectSubflowBrief, error: unknown, stopped: boolean, spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
    const refusal = spend.allowance?.refusal;
    const why = stopped
      ? "The build was stopped before this brief finished."
      : refusal
        ? `This brief's allowance could not pay for its next call (${refusal.code}).`
        : `The builder failed: ${errorWords(error)}${thrownEnding(error, brief)}`;
    // A standing yes for the latest accepted proposal is done, the throw said after it (header, t611): the same check as a returned loop's.
    const passed = passedProposal(spend.accepted, spend.trial);
    if (passed) return passedDone(brief, passed, why, spend);
    const value = returned(brief, spend.accepted ? "partial" : "blocked", why, spend, spend.accepted);
    // Core's build failure for the guard's stop, read structurally (header, lane-1 fix 1).
    if (!stopped && !refusal && parseAutomationStudioFlowBootstrapGenerationError(error)?.code === BUILD_REPEATED) value.stoppedRepeating = true;
    return value;
  },

  /** Why Core stopped a brief whose builder was refused one output under two different bindings (header, t645): the output by its interface name, the codes, and the plan's advice. */
  outputStopped(output: string, codes: readonly string[]): string {
    const said = [...new Set(codes.filter((code) => SAYABLE.test(code)))];
    return `Core stopped this brief: core.submit_subflow refused output "${output}" under two different bindings${said.length ? ` (${said.join(", ")})` : ""}, so another binding would only be refused again.${outputAdvice([output])}`;
  },

  /** A reset loop that returned, and what it left to undo; `done` its words when nothing is, naming any act that stayed (`./reset-done.ts`, t684). */
  reset(brief: AutomationStudioProjectSubflowBrief, loop: AutomationStudioLlmEvidenceLoopResult, left: readonly AutomationStudioSiteResetNamedAct[], spend: AutomationStudioProjectDispatchSpend, done: string): AutomationStudioProjectBuilderReturn {
    if (loop.ok && !left.length) return returned(brief, "done", done, spend, undefined);
    const still = left.length ? ` ${left.length} act${left.length === 1 ? " is" : "s are"} still to undo: ${left.map((act) => `${act.act} (${act.did})`).join(", ")}.` : "";
    const ended = loop.ok ? "The reset completed." : stopReason(brief, loop, spend.allowance);
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
    // The unneeded inputs are said before the money, and kept whole as it is (header, t672, t627).
    reason: withMoney(reason, `${unneededSaid(proposal)}${automationStudioProjectDispatchAllowanceSaid(spend.sizedAtStart, spend.allowance?.toppedUp() ?? [])}`),
    trials: spend.trials.map((trial) => ({ ...trial })),
    spentUsd: spend.allowance?.spentUsd() ?? 0,
    calls: spend.allowance?.spentCalls() ?? 0
  };
  if (proposal) value.proposal = { subflowKey: proposal.scope.subflowKey, revision: proposal.revision, digest: proposal.digest };
  return value;
}

/** Why a loop ended without completing: its allowance, when that refused, otherwise its own code. */
function stopReason(brief: AutomationStudioProjectSubflowBrief, loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>, allowance: AutomationStudioLlmBuildPurse | undefined): string {
  const refusal = allowance?.refusal;
  if (refusal) return `This brief's allowance could not pay for its next call (${refusal.code}), so the builder stopped.`;
  return `The builder stopped before completing (${loop.code}).${configurationSaid(loop.configuration)}${stoppedOn(brief, loop.exhaustion?.lastIssueCodes, loop.trace)}`;
}

/** One answered call, as a loop's trace row or a stored failure's step holds it. */
type AnsweredCall = { toolId?: string | undefined; decision?: string | undefined; nodeId?: string | undefined; resultCode?: string | undefined; resultReason?: string | undefined };

/** What one of Core's own build failures says of the loop it ended, or nothing for any other throw (header). */
function thrownEnding(error: unknown, brief: AutomationStudioProjectSubflowBrief): string {
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
  if (!diagnostic) return "";
  return stoppedOn(brief, diagnostic.issueCodes, diagnostic.evidenceLoop?.steps ?? []);
}

/**
 * The last refused submission, as the stop's codes carry it (header, t630): its family, its issue codes, the codes that
 * carried it, and the brief's outputs its output issues name (t645).
 */
type LastRefused = { family: string; codes: string[]; carried: ReadonlySet<string>; outputs: string[] };

/** A refusal code ending in the digest of its issues (`../../flow-bootstrap/candidate/submission-refusal.ts`). */
const ISSUES_DIGEST = /:[0-9a-f]{8}$/u;
/** The scope issue that says no step of the subflow reads an input the plan gives it (`../../flow-bootstrap/subflow-candidate/callable-target.ts`). */
const INPUT_UNREAD = "subflow.input_unread";
/** What the supervisor is told after an unread input, which is always one the person gives the Flow (header, t630, t672). */
const INPUT_UNREAD_ADVICE = " The plan gives this subflow a value the person gives the Flow, and no step of it reads that value: if another subflow is the one that uses it, change the plan with project.amend_plan to give it there; otherwise send a changed brief saying where this subflow uses it.";
/** The scope issues that say an output is bound to no value (`../../flow-bootstrap/subflow-candidate/route-outputs.ts`), each at `flow.output.<id>`. */
const OUTPUT_CODES: ReadonlySet<string> = new Set(["subflow.output_not_a_value", "subflow.output_unknown_port"]);
const OUTPUT_PATH = /^flow\.output\.([A-Za-z][A-Za-z0-9_]*)$/u;

/** The guard's codes, then the calls the loop stopped on, the last refused submission said by its issues where the codes carry them (header, t630). */
function stoppedOn(brief: AutomationStudioProjectSubflowBrief, codes: readonly string[] | undefined, rows: readonly AnsweredCall[]): string {
  const refused = lastRefused(codes ?? [], brief);
  const guard = guardSaid((codes ?? []).filter((code) => !refused?.carried.has(code)));
  const calls = callsSaid(rows, refused ? (code) => refusedSaid(code, refused, brief) : undefined);
  const advice = refused && calls.said ? `${refused.codes.includes(INPUT_UNREAD) ? INPUT_UNREAD_ADVICE : ""}${refused.outputs.length ? outputAdvice(refused.outputs) : ""}` : "";
  return `${guard}${calls.text}${advice}`;
}

/** The last refused submission the codes carry, or undefined when they carry none with a family and an issue; its outputs are the brief's own (header, t645). */
function lastRefused(codes: readonly string[], brief: AutomationStudioProjectSubflowBrief): LastRefused | undefined {
  const decoded = refusalCodes.decode(codes);
  if (!decoded?.family || !SAYABLE.test(decoded.family)) return undefined;
  const issues = [...new Set(decoded.issues.map((issue) => issue.code).filter((code) => SAYABLE.test(code)))];
  if (!issues.length) return undefined;
  const declared = new Set((brief.interface?.outputs ?? []).map((port) => port.id));
  const outputs = [...new Set(decoded.issues.flatMap((issue) => {
    const named = OUTPUT_CODES.has(issue.code) && issue.path ? OUTPUT_PATH.exec(issue.path)?.[1] : undefined;
    return named && declared.has(named) && SAYABLE.test(named) ? [named] : [];
  }))];
  return { family: decoded.family, codes: issues, carried: new Set(refusalCodes.encode(decoded)), outputs };
}

/** What the supervisor is told after an output the subflow could not make (header, t645): the plan's to change. */
function outputAdvice(outputs: readonly string[]): string {
  const named = outputs.map((name) => `"${name}"`).join(", ");
  return ` The plan asks this subflow to hand on ${outputs.length === 1 ? `output ${named}, a value` : `outputs ${named}, values`} none of its steps makes: `
    + "if a later subflow needs only what this one leaves on the target, change the plan with project.amend_plan to drop the value and keep the later subflow after this one; otherwise send a changed brief saying where on the target this subflow reads it.";
}

/** A call's result code as said: the last refused submission's family and issues in place of its digest, or undefined for any other code. */
function refusedSaid(code: string, refused: LastRefused, brief: AutomationStudioProjectSubflowBrief): string | undefined {
  if (!ISSUES_DIGEST.test(code) || code.replace(ISSUES_DIGEST, "") !== refused.family) return undefined;
  const outputs = refused.outputs.length ? refused.outputs.map((name) => `"${name}"`).join(", ") : undefined;
  const said = (issue: string) => (issue === INPUT_UNREAD ? `${issue}: ${inputsSaid(brief)}` : OUTPUT_CODES.has(issue) && outputs ? `${issue}: output ${outputs}` : issue);
  return `${refused.family} (${refused.codes.map(said).join(", ")})`;
}

/** What a return says of a part a subflow before this one did, as Core admitted the builder's claim (header, t676); nothing without one. */
function doneBeforeSaid(doneBefore: AutomationStudioSubflowDoneBefore | undefined): string {
  if (!doneBefore || !SAYABLE.test(doneBefore.part)) return "";
  const act = doneBefore.act !== undefined && SAYABLE.test(doneBefore.act) ? `, by the act ${doneBefore.act}, which the run that prepared this subflow's entry landed` : "";
  return ` Core checked the builder's claim: a subflow before this one already does this brief's part ${doneBefore.part}${act}, and that part asks a lasting act.`;
}

/** What a return says of the handed-on inputs its proposal does not read (header, t672), by the names Core checked; nothing when there are none. */
function unneededSaid(proposal: Readonly<AutomationStudioSubflowProposal> | undefined): string {
  const names = (proposal?.unneededInputs ?? []).filter((name) => SAYABLE.test(name));
  if (!names.length) return "";
  const quoted = names.map((name) => `"${name}"`).join(", ");
  return ` No step of this subflow reads ${names.length === 1 ? `its input ${quoted}` : `its inputs ${quoted}`}, which an earlier subflow hands on: this subflow did not need ${names.length === 1 ? "it" : "them"}, and the plan needs no change for that.`;
}

/** The brief's inputs by the names its interface gives them, the plan's port names Core checked. */
function inputsSaid(brief: AutomationStudioProjectSubflowBrief): string {
  const names = (brief.interface?.inputs ?? []).map((port) => port.id).filter((name) => SAYABLE.test(name));
  if (!names.length) return "an input";
  const quoted = names.map((name) => `"${name}"`).join(", ");
  return names.length === 1 ? `input ${quoted}` : `one of the inputs ${quoted}`;
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
function callsSaid(rows: readonly AnsweredCall[], codeSaid?: (code: string) => string | undefined): { text: string; said: boolean } {
  const answered = rows.filter((row) => row.resultCode !== undefined && SAYABLE.test(row.resultCode)).slice(-MAX_LAST_CALLS).reverse();
  // Only the latest refused submission's run is the one the codes carry the issues of (header, t630).
  const latest = codeSaid ? answered.find((row) => codeSaid(row.resultCode!) !== undefined)?.resultCode : undefined;
  const runs: Array<{ said: string; count: number }> = [];
  for (const row of answered) {
    const said = callSaid(row, latest !== undefined && row.resultCode === latest ? codeSaid!(latest) : undefined);
    const last = runs.at(-1);
    if (last?.said === said) last.count += 1;
    else runs.push({ said, count: 1 });
  }
  if (!runs.length) return { text: "", said: false };
  return { text: ` The calls it stopped on, latest first: ${runs.map((run) => (run.count > 1 ? `${run.said} (${run.count} in a row)` : run.said)).join("; ")}.`, said: latest !== undefined };
}

function callSaid(row: AnsweredCall, code = row.resultCode): string {
  const tool = [row.toolId, row.decision].find((value): value is string => typeof value === "string" && SAYABLE.test(value)) ?? "a decision";
  const node = row.nodeId && SAYABLE.test(row.nodeId) ? ` on ${row.nodeId}` : "";
  const reason = row.resultReason && SAYABLE.test(row.resultReason) ? ` (${row.resultReason})` : "";
  return `${tool}${node} answered ${code}${reason}`;
}

/**
 * The one check every ending asks (header, t611): `proposal` -- the latest --
 * when `trial` is a partial yes about it, its entry prepared, for its own
 * brief, plan and subflow and that exact revision and digest; undefined
 * otherwise. A returned loop gives the gate's standing verdict, a thrown one
 * the last trial its port answered.
 */
function passedProposal(proposal: Readonly<AutomationStudioSubflowProposal> | undefined, trial: Readonly<AutomationStudioSubflowTrialResult> | undefined): Readonly<AutomationStudioSubflowProposal> | undefined {
  if (!proposal || !trial || trial.partial !== true || trial.verdict !== "yes" || trial.entryPrepared !== true) return undefined;
  const said = trial.identity;
  const scope = proposal.scope;
  const same = said?.buildId === scope.buildId && said.briefId === scope.briefId && said.planDigest === scope.planDigest && said.subflowKey === scope.subflowKey;
  return same && trial.revision === proposal.revision && trial.digest === proposal.digest ? proposal : undefined;
}

/** What a passing brief says of its yes. */
function passedSaid(passed: Readonly<AutomationStudioSubflowProposal>): string {
  return `Revision ${passed.revision} of the subflow was tried on its own and its trial answered yes.`;
}

/** A brief done on its standing yes though the builder did not complete with it, `after` saying how it stopped. */
function passedDone(brief: AutomationStudioProjectSubflowBrief, passed: Readonly<AutomationStudioSubflowProposal>, after: string, spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
  return returned(brief, "done", `${passedSaid(passed)} The brief is done on that trial's receipt, though the builder did not complete with it. ${after}`, spend, passed);
}

/**
 * What the last trial answered, as a sentence after a return's reason, or
 * nothing when no trial ran (header). A yes is said too, with the revision
 * submitted after it where there is one (t611). Page and judge text is quoted
 * short; codes are said as they are.
 */
function trialSaid(trial: AutomationStudioSubflowTrialResult | undefined, latest?: Readonly<AutomationStudioSubflowProposal>): string {
  if (!trial) return "";
  if (trial.verdict === "yes" && trial.entryPrepared) {
    const after = latest && (latest.revision !== trial.revision || latest.digest !== trial.digest) ? `, but revision ${latest.revision} was submitted after it and was never tried` : "";
    return ` Its last trial, of revision ${trial.revision}, answered yes${after}.`;
  }
  const feedback = trial.feedback;
  const code = text(feedback.code);
  const head = ` Its last trial, of revision ${trial.revision}, answered ${trial.verdict}${code ? ` (${code})` : ""}`;
  const found = findingsSaid(feedback.coreFindings);
  if (!trial.entryPrepared) return `${head}: ${entrySaid(feedback)}${found}`;
  const step = failedStep(feedback.steps);
  if (step) return `${head}: ${step}${found}`;
  const judge = isObject(feedback.judge) ? feedback.judge : undefined;
  const judged = text(judge?.observed) ?? text(judge?.advice) ?? text(feedback.why);
  return judged ? `${head}: the judge said ${quoted(judged)}.${found}` : `${head}.${found}`;
}

/** What Core itself found of the trial's run (header, t645): each finding's own sentence by its code, read structurally. */
function findingsSaid(value: JsonValue | undefined): string {
  if (!Array.isArray(value)) return "";
  const said = value.filter(isObject).flatMap((finding) => {
    const code = text(finding.code);
    const words = text(finding.said);
    return code && words && SAYABLE.test(code) ? [` Core found (${code}): ${clipped(words, MAX_FINDING_WORDS)}`] : [];
  });
  return said.slice(0, MAX_FINDINGS).join("");
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

/** `reason`, clipped so `money` still fits after it (header, t627). */
function withMoney(reason: string, money: string): string {
  if (!money) return clip(reason);
  return `${clipped(reason, MAX_REASON - money.length)}${money}`.slice(0, MAX_REASON);
}

function clip(reason: string): string {
  return reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON - 3)}...` : reason;
}
