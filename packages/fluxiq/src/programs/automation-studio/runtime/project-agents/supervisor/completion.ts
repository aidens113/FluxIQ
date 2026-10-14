import type { JsonObject } from "../../../../../core/index.ts";
import { emitAutomationStudioActivity } from "../../activity/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorLeftOnTarget } from "./left-on-target.ts";
import type { AutomationStudioProjectSupervisorRecoveryShortfall, AutomationStudioProjectSupervisorReliesOnRecovery } from "./state.ts";

/** How many times an ending is held back for a reset before it is let through with what is left named (header). */
const MAX_HELD_FOR_RESET = 2;

/** An honest ending the model completed with, once the check accepted it. */
export type AutomationStudioProjectSupervisorEnded = { outcome: "blocked" | "partial"; reason: string };

/** What the supervisor completes with: the latest assembled revision, or an honest ending. */
export const AUTOMATION_STUDIO_PROJECT_SUPERVISOR_COMPLETION_SCHEMA: JsonObject = {
  type: "object",
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
 * a reset brief has come back after the build's last other brief. A reset that
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
 * A build its money, time or turns stopped first completes on it the same way
 * (`./supervisor-loop.ts`).
 */
export function automationStudioProjectSupervisorCompletion(context: AutomationStudioProjectSupervisorContext, ended: (ending: AutomationStudioProjectSupervisorEnded) => void): (result: JsonObject) => AutomationStudioLlmEvidenceCompletionCheck {
  let heldForReset = 0;
  return (result) => {
    const keys = Object.keys(result);
    if (result.ended !== undefined) {
      const reason = typeof result.reason === "string" ? result.reason.trim() : "";
      if ((result.ended !== "blocked" && result.ended !== "partial") || !reason || keys.some((key) => key !== "ended" && key !== "reason")) return refused("project.completion_shape", GUIDANCE.completion.shape);
      if (!context.state.anyNotDone() && !context.state.wholeTrialFailed) return refused("project.completion_ended_too_soon", GUIDANCE.completion.endedTooSoon);
      const left = automationStudioProjectSupervisorLeftOnTarget(context.ports, context.state);
      if (left.note && left.undoable && !context.state.resetCameBackLast() && heldForReset < MAX_HELD_FOR_RESET) {
        heldForReset += 1;
        return refused("project.completion_reset_first", GUIDANCE.completion.resetFirst, {
          actsInPlace: left.acts.filter((act) => act.undoable).map((act) => ({ act: act.act, did: act.did, brief: act.brief })),
          ...(left.lastWholeTrialLeftActs ? { lastWholeTrialLeftActs: true } : {})
        });
      }
      ended({ outcome: result.ended, reason: left.reason(reason) });
      return { ok: true };
    }
    const candidate = context.controller.latest();
    if (!candidate) return refused("project.completion_nothing_assembled", GUIDANCE.completion.nothingAssembled, { submitted: false });
    const named = typeof result.revision === "number" && typeof result.digest === "string" && keys.every((key) => key === "revision" || key === "digest");
    if (!named || !context.controller.matches({ revision: result.revision as number, digest: result.digest as string, baseDependencyDigest: candidate.baseDependencyDigest })) {
      return refused("project.completion_not_latest", GUIDANCE.completion.notLatest, { submitted: true, complete: { revision: candidate.revision, digest: candidate.digest } });
    }
    const checked = context.gate.completion({ revision: candidate.revision, digest: candidate.digest });
    const rescued = checked.ok ? undefined : context.state.rescuedTest(context.controller, context.gate);
    if (checked.ok || !rescued) return checked;
    // A pass the run rescued completes once its repair could not be made, and the person is told (header).
    const why = context.state.recoveryRepairsShort.get(rescued.key);
    if (why) {
      automationStudioProjectSupervisorReliesOnRecovery(context, why);
      return { ok: true };
    }
    return refused("candidate.trial_slow_down_unhandled", GUIDANCE.completion.recoveryRepairFirst, { slowDown: rescued.unanswered, wholeTest: { ...rescued.receipt } });
  };
}

/**
 * Completes on the latest whole test when it passed only on the run's own
 * recovery and its repair could not be made for `why` (header): the state
 * keeps what the person is told for the run's outcome, and the chat shows it
 * now. Undefined, and nothing said, when the latest whole test is no such pass.
 */
export function automationStudioProjectSupervisorReliesOnRecovery(context: Pick<AutomationStudioProjectSupervisorContext, "state" | "controller" | "gate">, why: AutomationStudioProjectSupervisorRecoveryShortfall): AutomationStudioProjectSupervisorReliesOnRecovery | undefined {
  const rescued = context.state.rescuedTest(context.controller, context.gate);
  if (!rescued) return undefined;
  const relied = context.state.relyOnRecovery(rescued, why);
  emitAutomationStudioActivity({ phase: "verifying", label: RELIES_TITLE, detail: { kind: "note", title: RELIES_TITLE, status: "succeeded", text: relied.told } });
  return relied;
}

/** The chat row's title when the Flow completes relying on the run's own recovery. */
const RELIES_TITLE = "The Flow relies on the run's own recovery";

function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction, ...detail } };
}
