import type { JsonObject } from "../../../../../core/index.ts";
import { emitAutomationStudioActivity } from "../../activity/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY } from "../../llm/decision-handlers/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck } from "../../llm/evidence-loop.ts";
import { automationStudioProjectSupervisorBriefSizing } from "./brief-sizing.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorLeftOnTarget } from "./left-on-target.ts";
import type { AutomationStudioProjectSupervisorCompletedOnPass, AutomationStudioProjectSupervisorRecoveryShortfall, AutomationStudioProjectSupervisorReliesOnRecovery, AutomationStudioProjectSupervisorStandingRescue } from "./state.ts";

/** The supervisor decisions a held ending needs left (header, t743): the repair's dispatch, a turn to spare, and the ending again. */
const REPAIR_TURNS = 3;

/** An honest ending the model completed with, once the check accepted it. */
export type AutomationStudioProjectSupervisorEnded = { outcome: "blocked" | "partial"; reason: string };

/** What the supervisor completes with: the latest assembled revision, or an honest ending. */
export const AUTOMATION_STUDIO_PROJECT_SUPERVISOR_COMPLETION_SCHEMA: JsonObject = {
  type: "object",
  description: "Either the complete object of the latest assembly -- exactly revision and digest -- or an honest ending -- exactly ended and reason. A result naming a revision and digest is read as completing on that revision, whatever else it carries.",
  properties: { revision: { type: "integer" }, digest: { type: "string" }, ended: { type: "string", enum: ["blocked", "partial"] }, reason: { type: "string", description: "Read by the person as it is: plain words about what could not be done and why, with no codes, tool or subflow names, or build terms." } },
  additionalProperties: false
};

/**
 * The supervisor's completion rule. Either exactly the latest assembled
 * candidate's revision and digest, accepted only once the whole trial gate
 * says yes for that exact revision (`AutomationStudioFlowCandidateTrialGate`,
 * `completion`); or an honest ending -- `ended` blocked or partial, with a
 * reason -- accepted only once something has stopped the build: a brief came
 * back blocked or partial, or a whole trial did not pass. `ended` is told the
 * ending the check accepted, for the caller to record.
 *
 * **An ending says what the build left on the target (bigbox debug fix 10;
 * t775).** Bigbox `run-mv8186yr-a385fd3a` ended blocked with nine of the
 * build's acts on the site, untold. Since t775 (user, 2026-10-27: reset as
 * rarely as possible) nothing holds an ending or a completion for a reset and
 * Core sends no cleanup of its own: whatever of the build is still on the
 * target, Core names in the ending's reason itself (`./left-on-target.ts`), so
 * the person is told exactly what is there, and may ask for it to be put back.
 * The `project.completion_reset_first` hold is retired.
 *
 * **A pass the run rescued (social debug, t603).** A yes the trial gate holds
 * back only for what the run recovered from by itself and the Flow does not
 * answer (`rescuedTest`, `./state.ts`) is refused with the supervisor's way
 * forward: a repair naming that whole test (`wholeTest`). Once that repair
 * could not be made -- it came back without the change, or the purse could not
 * pay for it (`./dispatch-tool.ts`) -- completing on that same revision is
 * accepted: the passing test stands, and the person is told the Flow relies on
 * the run's own recovery, and why (`automationStudioProjectSupervisorReliesOnRecovery`).
 * A build any guard stopped first -- its money, time or turns, a stall, a
 * provider that stopped answering -- completes on it the same way
 * (`./supervisor-loop.ts`, t622).
 *
 * **A result naming the passing test is a completion (A8 social
 * `run-mv96rz6h`, t622).** The supervisor completed four times with the
 * standing test's revision and digest and also `ended` and `reason`; the
 * ending branch read it first and refused each on its shape until the loop
 * stalled. A result that names a revision and a digest is now judged as a
 * completion on that revision whatever else it carries -- the words beside it
 * are dropped -- as a builder's receipt is (t601, t611); only a result naming
 * neither is read as an ending. A shape refusal names the latest assembly's
 * complete object and the keys to drop (`extra`), and a refusal sent again
 * says, in a completion's terms rather than a draft's, that the same result
 * gets the same answer (`sentAgainInstead`).
 *
 * **An honest ending while a rescued pass stands completes on it (t622).** The
 * passing whole test is Core's evidence, not the model's words: an ending the
 * model gives while the latest whole test is a rescued pass (`rescuedTest`)
 * completes on that test exactly as a guard's end does, the person told the
 * Flow relies on the run's own recovery (`ended`), and the model's own ending
 * kept beside it (`endedWith`) for the run's outcome, never in the person's
 * words. Only the person's cancel ends without it (`./supervisor-loop.ts`).
 *
 * **An honest ending completes on the build's fallback too (A8 wave 9 social
 * `run-mv9ml775`, t637).** When a repair of a rescued pass came back done and
 * the Flow assembled from it never passed, the most recent rescued pass is the
 * build's fallback (`standingRescue`, `./state.ts`), and an honest ending
 * completes on it, said as above with the later assembly named as set aside.
 * Unlike the latest assembly's own rescued pass, whose trial was the last thing
 * run on the target, the fallback's Flow was not: later trials and builders
 * acted since. What of the build is still on the target is named after the
 * person's words, as for an ending (t775). The ending is never refused as too
 * soon: a passing revision stands.
 *
 * **The fallback is any pass, and may be named (coordinator, t637).** The
 * fallback is the most recent whole-test pass of either kind: a rescued one,
 * said with the recovery words, or an outright one, said plainly -- the later
 * revision never passed, so the build completes on the last that passed. A
 * completion naming the fallback's revision and digest completes on it the
 * same way (`completed`), rather than being refused as not the
 * latest; one naming any other revision that is not the latest is refused
 * `project.completion_not_latest` as before.
 *
 * **A failed subflow gets one changed brief before the build ends (rerun
 * round 4, t743).** Photo, social, job and office runs ended right after one
 * brief came back blocked, with most of their money left. While the build can
 * still pay for a brief -- the dispatch's own sizing check
 * (`./brief-sizing.ts`), here for one repair -- an ending is refused
 * `project.completion_repair_first`, naming each subflow whose latest build or
 * repair return is blocked or partial and that has had no changed brief since
 * (`unrepaired`, `./state.ts`): a repair of it, or a brief of it under an
 * amended plan; the same brief sent again does not count. A return with a
 * closed terminal reason (`terminalReason`, `../dispatch/ending.ts`) holds
 * nothing. Each subflow holds an ending at most once (`heldForRepair`), so the
 * rule can never keep the build going to its ceiling; and it holds nothing
 * when the loop has too few decisions left to send the repair and end again
 * (`REPAIR_TURNS`): a held ending would only run the turns out. It comes before the reset
 * rule, so a reset is sent only once the build is really ending; and it does
 * not touch an ending that completes on a pass that stands.
 *
 * **An act no call can settle holds no ending (t743, S2).** While the build
 * has an act on the target that no call can check or put back
 * (`unsettleable`, `./left-on-target.ts`, from each brief's ledger's
 * `unsatisfiable()`), no trial can run anywhere in the build, so neither rule
 * holds an ending for it: a changed brief could not be tested, and such an
 * act is never `undoable`, so no reset is asked for it. The ending's reason
 * names it after the person's words as left on the target.
 */
export function automationStudioProjectSupervisorCompletion(context: AutomationStudioProjectSupervisorContext, ended: (ending: AutomationStudioProjectSupervisorEnded) => void): (result: JsonObject, loop?: { turnsLeft?: number | undefined }) => AutomationStudioLlmEvidenceCompletionCheck {
  /** Each subflow a repair-first refusal has named: it never holds an ending again (header, t743). */
  const heldForRepair = new Set<string>();
  /** The repair-first rule before an ending (header, t743): a refusal naming each failed subflow not yet given a changed brief, while a brief can be paid for. */
  const repairFirst = (turnsLeft: number | undefined): AutomationStudioLlmEvidenceCompletionCheck | undefined => {
    const due = context.state.unrepaired().filter((entry) => !heldForRepair.has(entry.subflowKey));
    // Turns too are what a brief is paid with: the repair's dispatch, a reset the reset rule may ask for, and the ending again.
    if (!due.length || (turnsLeft !== undefined && turnsLeft < REPAIR_TURNS) || !canPayForBrief(context, due[0]!.subflowKey)) return undefined;
    // No changed brief could be tested while an act no call can settle is on the target (header, t743).
    if (automationStudioProjectSupervisorLeftOnTarget(context.ports).unsettleable) return undefined;
    for (const entry of due) heldForRepair.add(entry.subflowKey);
    return refused("project.completion_repair_first", GUIDANCE.completion.repairFirst, { unrepaired: due.map((entry) => ({ subflowKey: entry.subflowKey, failingBrief: entry.briefId })) });
  };
  /** What of the build is still on the target, named in an ending's or a fallback completion's words (header, t775): nothing is held for it. */
  const leftNow = (): ReturnType<typeof automationStudioProjectSupervisorLeftOnTarget> => automationStudioProjectSupervisorLeftOnTarget(context.ports);
  return (result, loop) => {
    const keys = Object.keys(result);
    // A result naming a revision and a digest is judged as a completion on it, whatever else it carries (header).
    const names = typeof result.revision === "number" && typeof result.digest === "string";
    if (result.ended !== undefined && !names) {
      const reason = typeof result.reason === "string" ? result.reason.trim() : "";
      const extra = keys.filter((key) => key !== "ended" && key !== "reason");
      if ((result.ended !== "blocked" && result.ended !== "partial") || !reason || extra.length) return refused("project.completion_shape", GUIDANCE.completion.shape, shapeDetail(context, extra));
      const endedWith: AutomationStudioProjectSupervisorEnded = { outcome: result.ended, reason };
      const rescue = context.state.standingRescue(context.controller, context.gate);
      // The latest assembly's rescued pass stands: the ending completes on it, the model's words kept beside it (header).
      if (rescue && !rescue.fallback) {
        automationStudioProjectSupervisorReliesOnRecovery(context, "ended", { endedWith, rescue });
        return { ok: true };
      }
      if (!rescue && !context.state.anyNotDone() && !context.state.wholeTrialFailed) return refused("project.completion_ended_too_soon", GUIDANCE.completion.endedTooSoon);
      // Each failed subflow gets one changed brief while money is left, before the reset rule (header, t743).
      const repair = rescue ? undefined : repairFirst(loop?.turnsLeft);
      if (repair) return repair;
      const left = leftNow();
      // The build's fallback stands: the ending completes on it (header, t637).
      if (rescue) {
        automationStudioProjectSupervisorReliesOnRecovery(context, "ended", { endedWith, rescue, left: left.note });
        return { ok: true };
      }
      ended({ outcome: result.ended, reason: left.reason(reason) });
      return { ok: true };
    }
    const candidate = context.controller.latest();
    if (!candidate) return refused("project.completion_nothing_assembled", GUIDANCE.completion.nothingAssembled, { submitted: false });
    if (!names || !context.controller.matches({ revision: result.revision as number, digest: result.digest as string, baseDependencyDigest: candidate.baseDependencyDigest })) {
      // A completion naming the build's fallback completes on it (header, t637).
      const rescue = names ? context.state.standingRescue(context.controller, context.gate) : undefined;
      if (rescue?.fallback && rescue.fallback.revision === result.revision && rescue.fallback.digest === result.digest) {
        const left = leftNow();
        automationStudioProjectSupervisorReliesOnRecovery(context, "completed", { rescue, left: left.note });
        return { ok: true };
      }
      return refused("project.completion_not_latest", GUIDANCE.completion.notLatest, { submitted: true, complete: { revision: candidate.revision, digest: candidate.digest } });
    }
    const checked = context.gate.completion({ revision: candidate.revision, digest: candidate.digest });
    const rescued = checked.ok ? undefined : context.state.rescuedTest(context.controller, context.gate);
    if (checked.ok) {
      // A build that ends with a Flow says which of its own lasting acts are still on the site (t785): builds no longer clean up at the end (t775). Nothing is said when nothing is left.
      leftNow().announce();
      return checked;
    }
    if (!rescued) return checked;
    // A pass the run rescued completes once its repair could not be made, and the person is told (header).
    const why = context.state.recoveryRepairsShort.get(rescued.key);
    if (why) {
      automationStudioProjectSupervisorReliesOnRecovery(context, why, { rescue: { test: rescued } });
      return { ok: true };
    }
    return refused("candidate.trial_slow_down_unhandled", GUIDANCE.completion.recoveryRepairFirst, { slowDown: rescued.unanswered, wholeTest: { ...rescued.receipt } });
  };
}

/**
 * Completes on a pass that stands although no repair of it was made for
 * `why` (header): `rescue`, or else the one standing -- the latest assembly's
 * rescued pass, or the build's fallback (t637). A rescued pass is said with the
 * recovery words; an outright fallback plainly. The state keeps what the
 * person is told for the run's outcome, and the Flow it completed on when that
 * is the fallback; the chat shows it now. `left` is Core's note of what is
 * still on the target, said after it on the fallback. Undefined, and nothing
 * said, when no such pass stands.
 */
export function automationStudioProjectSupervisorReliesOnRecovery(
  context: Pick<AutomationStudioProjectSupervisorContext, "state" | "controller" | "gate">,
  why: AutomationStudioProjectSupervisorRecoveryShortfall,
  options: { endedWith?: AutomationStudioProjectSupervisorEnded; rescue?: AutomationStudioProjectSupervisorStandingRescue; left?: string | undefined } = {}
): AutomationStudioProjectSupervisorReliesOnRecovery | AutomationStudioProjectSupervisorCompletedOnPass | undefined {
  const rescue = options.rescue ?? context.state.standingRescue(context.controller, context.gate);
  if (!rescue) return undefined;
  const relied = rescue.test ? context.state.relyOnRecovery(rescue, why, options.endedWith, options.left) : context.state.completeOnPass(rescue.fallback, why, options.endedWith, options.left);
  const title = rescue.test ? RELIES_TITLE : FALLBACK_TITLE;
  emitAutomationStudioActivity({ phase: "verifying", label: title, detail: { kind: "note", title, status: "succeeded", text: relied.told } });
  return relied;
}

/** The chat row's title when the build completes on a fallback that passed outright (t637). */
const FALLBACK_TITLE = "The build completes on the last revision that passed";

/** The chat row's title when the Flow completes relying on the run's own recovery. */
const RELIES_TITLE = "The Flow relies on the run's own recovery";

/**
 * Whether the build can still pay for one repair brief of `subflowKey` (header, t743): the check `project.dispatch`
 * sizes its briefs by (`./brief-sizing.ts`, `./dispatch-tool.ts`), with no new money rule. A build without a purse
 * sizes nothing, so nothing stops a brief for money.
 */
function canPayForBrief(context: AutomationStudioProjectSupervisorContext, subflowKey: string): boolean {
  const { purse, finishing } = context.ports;
  const structure = context.state.structure;
  if (!purse || !structure) return true;
  return automationStudioProjectSupervisorBriefSizing({
    sent: [{ kind: "repair", subflowKey }], purse, structure, done: new Set(context.state.latestDone().keys()), supervisorCalls: finishing?.supervisorCalls ?? 0,
    ...(finishing ? { finishingCalls: finishing.supervisorCalls + finishing.resetCalls } : {})
  }).ok;
}

/** What a shape refusal names (header): the latest assembly's complete object, when there is one, and the keys to drop. */
function shapeDetail(context: AutomationStudioProjectSupervisorContext, extra: readonly string[]): JsonObject {
  const latest = context.controller.latest();
  return { ...(latest ? { complete: { revision: latest.revision, digest: latest.digest } } : {}), extra: [...extra] };
}

/** Every refusal carries the supervisor's own sent-again words (header): it has no draft to change. */
function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction, ...detail, [AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY]: GUIDANCE.completion.sentAgain } };
}
