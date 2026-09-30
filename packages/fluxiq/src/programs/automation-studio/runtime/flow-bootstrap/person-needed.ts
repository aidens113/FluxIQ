// The build handing a check to the person.
//
// **The rule.** FluxIQ never presses, types into or solves a check that asks
// whether it is a person. A domain that meets one says so on its call
// (`personNeeded` on the tool result, `../llm/evidence-loop/tool-execution.ts`),
// and this is where the build acts on it. The result never reaches the model
// as it stands: a model told "that failed, try again" knocks on the check
// until the site locks it out (`run-munp80f5-c31ea417`).
//
// **What happens instead.** The person-needed question goes into the Flow's
// thread, through the same parking port the permission question uses, and the
// build waits where it stands. On Continue the call stands as the domain
// described it once cleared -- its `draft`, `effectApplied` and `nodeId` -- and
// its evidence is replaced by a fresh look at the target, under a note that
// says a person completed a check here. On anything else -- Stop, nobody
// answering, no thread to ask in, a thread that could not be written -- the
// build ends `flow_bootstrap.user_intervention_required`.
//
// **How it ends the build.** The plan-refusal pattern from
// `./action-permissions.ts`: abort a signal the loop runs under, so the loop
// stops at its next turn without asking the model anything, and let the
// caller read `endedOnIntervention` first once it has. The call that was
// stopped throws rather than returning anything, so nothing the domain said
// about the check is shown to a model either way.
//
// **Every path through the executor.** The loop's ordinary calls, its free
// first look, an `amend_draft` rerun and the dry run's replay
// (`../llm/node-tools/replay-draft.ts`) all call the executor this wraps, so
// each of them asks the person rather than counting a check as a failed,
// changed or unreproducible step.
//
// **Bounded.** A build asks at most `maxAsks` times. A site that keeps putting
// a check in front of every step is not one a build should keep a person
// clearing, and past the bound the build ends with the same code.
//
// **Shared with recovery.** The question, the wait, the bound and the fresh
// look are `../parking/person-needed-tool-calls.ts`, which a recovery's
// exploration wraps its executor with too. What is the build's own is here:
// the stage it asks from, what the person is shown while it waits, and the
// `flow_bootstrap.user_intervention_required` ending.

import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../core/index.ts";
import { emitAutomationStudioActivity, emitAutomationStudioActivityWaitingOnAsk } from "../activity/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceTool } from "../llm/index.ts";
import {
  AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES,
  AUTOMATION_STUDIO_PERSON_NEEDED_MAX_ASKS,
  automationStudioPersonNeededToolCalls,
  type AutomationStudioParkingPort
} from "../parking/index.ts";
import { flowBootstrapUserInterventionRequiredFailure, type AutomationStudioFlowBootstrapFailureDiagnostic, type AutomationStudioFlowBootstrapGenerationError } from "./generation-failure/index.ts";

/** How many times one build may put the question to a person. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERSON_NEEDED_MAX_ASKS = AUTOMATION_STUDIO_PERSON_NEEDED_MAX_ASKS;

type ExecuteTool = AutomationStudioLlmEvidenceLoopInput["executeTool"];

export type AutomationStudioFlowBootstrapPersonNeeded = {
  /** The executor the loop is handed: the inner one, with every person-needed result put to a person first. */
  executeTool: ExecuteTool;
  /** Aborted when the build has to end because the person did not get past a check. The loop runs under it. */
  signal: AbortSignal;
  /**
   * The ending the person-needed stop makes, or `undefined` when there was
   * none. Read first once the loop stops, beside `endedOnRequest`: the loop
   * itself only saw a tool that threw and a signal that fired.
   */
  endedOnIntervention(
    progress?: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> },
    accounting?: NonNullable<AutomationStudioFlowBootstrapFailureDiagnostic["accounting"]>
  ): AutomationStudioFlowBootstrapGenerationError | undefined;
};

export function automationStudioFlowBootstrapPersonNeeded(input: {
  /** The executor underneath: the permission gate's, in a build. */
  executeTool: ExecuteTool;
  /** The loop's tools; the one with an `initialObservation` is how the fresh look is taken. */
  tools: readonly AutomationStudioLlmEvidenceTool[];
  /** Where the question goes. Absent, a person-needed result ends the build at once: there is nobody to ask. */
  ask?: { port: AutomationStudioParkingPort; timeoutMs?: number | undefined; now?: (() => number) | undefined } | undefined;
  /** The build's own cancellation, so a cancelled build stops waiting. */
  signal?: AbortSignal | undefined;
  /**
   * The code a call answers once a person has cleared the check it met, from
   * the call's own argument; absent, or answering nothing, it carries no code.
   * A build passes the dry run's (`automationStudioFlowDraftReplayClearedCode`),
   * because a replayed step is read in the replay's closed vocabulary and
   * nothing else.
   */
  clearedResultCode?: ((value: JsonObject) => string | undefined) | undefined;
  maxAsks?: number;
  newAskId?: () => string;
}): AutomationStudioFlowBootstrapPersonNeeded {
  const calls = automationStudioPersonNeededToolCalls({
    executeTool: input.executeTool,
    tools: input.tools,
    stage: "authoring",
    subject: "build",
    ask: input.ask,
    signal: input.signal,
    clearedResultCode: input.clearedResultCode,
    maxAsks: input.maxAsks,
    newAskId: input.newAskId ?? (() => `person-needed.${randomUUID()}`),
    onAsk: (ask) => emitAutomationStudioActivityWaitingOnAsk(ask),
    onCleared: (call) => emitAutomationStudioActivity({ phase: "building", label: "The person completed the check; building goes on", detail: { kind: "step", title: "Check completed by the person", status: "succeeded", ref: call.callId } })
  });
  return {
    executeTool: calls.executeTool,
    signal: calls.signal,
    endedOnIntervention: (progress, accounting) => {
      const ended = calls.ended();
      return ended
        ? flowBootstrapUserInterventionRequiredFailure(AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES[ended], progress ?? NO_LOOP_PROGRESS, accounting)
        : undefined;
    }
  };
}

/** What a build that ran no evidence loop has to show for itself: nothing, honestly. */
const NO_LOOP_PROGRESS: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> } = Object.freeze({
  trace: Object.freeze([]),
  accounting: Object.freeze({ iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
});
