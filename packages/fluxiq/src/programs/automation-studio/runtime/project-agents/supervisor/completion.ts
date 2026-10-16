import type { JsonObject } from "../../../../../core/index.ts";
import { emitAutomationStudioActivity } from "../../activity/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY } from "../../llm/decision-handlers/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorLeftOnTarget } from "./left-on-target.ts";
import type { AutomationStudioProjectSupervisorCompletedOnPass, AutomationStudioProjectSupervisorRecoveryShortfall, AutomationStudioProjectSupervisorReliesOnRecovery, AutomationStudioProjectSupervisorResetToEnd, AutomationStudioProjectSupervisorStandingRescue } from "./state.ts";

/** How many times an ending is held back for a reset before it is let through with what is left named (header). */
const MAX_HELD_FOR_RESET = 2;

/** An honest ending the model completed with, once the check accepted it. */
export type AutomationStudioProjectSupervisorEnded = { outcome: "blocked" | "partial"; reason: string };

/** What the supervisor completes with: the latest assembled revision, or an honest ending. */
export const AUTOMATION_STUDIO_PROJECT_SUPERVISOR_COMPLETION_SCHEMA: JsonObject = {
  type: "object",
  description: "Either the complete object of the latest assembly -- exactly revision and digest -- or an honest ending -- exactly ended and reason. A result naming a revision and digest is read as completing on that revision, whatever else it carries.",
  properties: { revision: { type: "integer" }, digest: { type: "string" }, ended: { type: "string", enum: ["blocked", "partial"] }, reason: { type: "string" } },
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
 * **An honest ending puts the target back first (bigbox debug fix 10).** Bigbox
 * `run-mv8186yr-a385fd3a` ended blocked with nine of the build's acts on the
 * site. While this build's lasting acts are still in place and a reset brief
 * could undo them, an ending is refused `project.completion_reset_first` until
 * a reset brief has come back after the build's last other brief and its last
 * whole test (`resetCameBackLast`, `./state.ts`, t684). A reset that
 * came back without undoing everything, acts no reset can undo, or
 * `MAX_HELD_FOR_RESET` such refusals already given (so a reset that cannot be
 * sent never holds the build until its ceiling) let the ending through; and
 * whatever is still left Core names in the ending's reason itself
 * (`./left-on-target.ts`), so the person is told exactly what is on the target.
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
 * acted since. So the reset rule holds first, exactly as for an ending: while
 * this build's own acts are still in place and a reset brief could undo them,
 * the ending is refused `project.completion_reset_first` until one has come
 * back, and what no reset undid is named after the person's words. The
 * ending is never refused as too soon: a passing revision stands.
 *
 * **The fallback is any pass, and may be named (coordinator, t637).** The
 * fallback is the most recent whole-test pass of either kind: a rescued one,
 * said with the recovery words, or an outright one, said plainly -- the later
 * revision never passed, so the build completes on the last that passed. A
 * completion naming the fallback's revision and digest completes on it under
 * the same reset rule (`completed`), rather than being refused as not the
 * latest; one naming any other revision that is not the latest is refused
 * `project.completion_not_latest` as before.
 *
 * **A refusal for the reset keeps why (t683).** Each
 * `project.completion_reset_first` refusal sets the state's `resetToEnd`: an
 * ending held, or a completion on the fallback held with its complete object.
 * The answer to the reset then says to end, or complete, again now
 * (`./dispatch-tool.ts`), rather than asking the model to remember why it sent
 * the reset and offering a test it does not need.
 */
export function automationStudioProjectSupervisorCompletion(context: AutomationStudioProjectSupervisorContext, ended: (ending: AutomationStudioProjectSupervisorEnded) => void): (result: JsonObject) => AutomationStudioLlmEvidenceCompletionCheck {
  let heldForReset = 0;
  /**
   * The reset rule before an ending, or a completion on the fallback (header): a refusal while a reset could still undo this build's acts, else what is left.
   * A refusal keeps why the reset is asked for (`for`, t683), so the answer after it says to end or complete again, never to test.
   */
  const resetFirst = (held: AutomationStudioProjectSupervisorResetToEnd): { refusal: AutomationStudioLlmEvidenceCompletionCheck | undefined; left: ReturnType<typeof automationStudioProjectSupervisorLeftOnTarget> } => {
    const left = automationStudioProjectSupervisorLeftOnTarget(context.ports);
    if (!left.note || !left.undoable || context.state.resetCameBackLast() || heldForReset >= MAX_HELD_FOR_RESET) return { refusal: undefined, left };
    heldForReset += 1;
    context.state.resetToEnd = held;
    return { refusal: refused("project.completion_reset_first", GUIDANCE.completion.resetFirst, { actsInPlace: left.acts.filter((act) => act.undoable).map((act) => ({ act: act.act, did: act.did, brief: act.brief })) }), left };
  };
  return (result) => {
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
      const { refusal, left } = resetFirst({ by: "ending" });
      if (refusal) return refusal;
      // The build's fallback stands: once the reset rule held, the ending completes on it (header, t637).
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
      // A completion naming the build's fallback completes on it, once the reset rule held (header, t637).
      const rescue = names ? context.state.standingRescue(context.controller, context.gate) : undefined;
      if (rescue?.fallback && rescue.fallback.revision === result.revision && rescue.fallback.digest === result.digest) {
        const { refusal, left } = resetFirst({ by: "completion", complete: { revision: rescue.fallback.revision, digest: rescue.fallback.digest } });
        if (refusal) return refusal;
        automationStudioProjectSupervisorReliesOnRecovery(context, "completed", { rescue, left: left.note });
        return { ok: true };
      }
      return refused("project.completion_not_latest", GUIDANCE.completion.notLatest, { submitted: true, complete: { revision: candidate.revision, digest: candidate.digest } });
    }
    const checked = context.gate.completion({ revision: candidate.revision, digest: candidate.digest });
    const rescued = checked.ok ? undefined : context.state.rescuedTest(context.controller, context.gate);
    if (checked.ok || !rescued) return checked;
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

/** What a shape refusal names (header): the latest assembly's complete object, when there is one, and the keys to drop. */
function shapeDetail(context: AutomationStudioProjectSupervisorContext, extra: readonly string[]): JsonObject {
  const latest = context.controller.latest();
  return { ...(latest ? { complete: { revision: latest.revision, digest: latest.digest } } : {}), extra: [...extra] };
}

/** Every refusal carries the supervisor's own sent-again words (header): it has no draft to change. */
function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction, ...detail, [AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY]: GUIDANCE.completion.sentAgain } };
}
