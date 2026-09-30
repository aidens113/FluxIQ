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

import { randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { emitAutomationStudioActivity, emitAutomationStudioActivityWaitingOnAsk } from "../activity/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../llm/index.ts";
import {
  automationStudioAskedPersonNeeded,
  automationStudioPersonNeededAsk,
  automationStudioPersonNeededAskDraft,
  type AutomationStudioParkingPort,
  type AutomationStudioPersonNeededOutcome
} from "../parking/index.ts";
import { flowBootstrapUserInterventionRequiredFailure, type AutomationStudioFlowBootstrapFailureDiagnostic, type AutomationStudioFlowBootstrapGenerationError } from "./generation-failure/index.ts";

/** How many times one build may put the question to a person. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERSON_NEEDED_MAX_ASKS = 3;

/**
 * What the model is told in place of the call's own evidence, once the person
 * has completed the check. The fresh look travels beside it, under `now`.
 */
const PERSON_COMPLETED_NOTE = "This step met a check only a person can complete. FluxIQ handed it to the person, who completed it and pressed Continue, so the step stands. `now` is a fresh look at the target as it is after that. Never press, type into or reload a check.";

type ExecuteTool = AutomationStudioLlmEvidenceLoopInput["executeTool"];
type ToolCall = Parameters<ExecuteTool>[0];

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

/** Why a build stopped for a person, as the one issue code its ending carries. */
const ISSUE_CODE: Readonly<Record<Exclude<AutomationStudioPersonNeededOutcome, "done"> | "asks_exhausted", string>> = {
  stopped: "person_needed.stopped",
  timed_out: "person_needed.timed_out",
  unreachable: "person_needed.no_thread",
  cancelled: "person_needed.cancelled",
  asks_exhausted: "person_needed.asks_exhausted"
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
  const stopped = new AbortController();
  const maxAsks = input.maxAsks ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERSON_NEEDED_MAX_ASKS;
  const newAskId = input.newAskId ?? (() => `person-needed.${randomUUID()}`);
  const look = input.tools.find((tool) => tool.initialObservation);
  let asks = 0;
  let ended: keyof typeof ISSUE_CODE | undefined;

  const end = (reason: keyof typeof ISSUE_CODE): never => {
    ended ??= reason;
    stopped.abort();
    // Thrown, not returned: whatever this call answered is about a check, and
    // the loop records a thrown call without showing a model any of it.
    throw new Error(`The build stopped for a person (${ISSUE_CODE[ended]}).`);
  };

  /** Puts the question once, and says whether the person got past the check. */
  const asked = async (call: ToolCall): Promise<void> => {
    if (asks >= maxAsks) end("asks_exhausted");
    asks += 1;
    if (!input.ask) end("unreachable");
    const ask = automationStudioPersonNeededAsk(
      { ...automationStudioPersonNeededAskDraft({ timeoutMs: input.ask!.timeoutMs }), askId: newAskId() },
      { stage: "authoring" }
    );
    emitAutomationStudioActivityWaitingOnAsk(ask);
    const outcome = await automationStudioAskedPersonNeeded({ port: input.ask!.port, ...(input.signal ? { signal: input.signal } : {}), ...(input.ask!.now ? { now: input.ask!.now } : {}) }, ask);
    if (outcome !== "done") end(outcome);
    emitAutomationStudioActivity({ phase: "building", label: "The person completed the check; building goes on", detail: { kind: "step", title: "Check completed by the person", status: "succeeded", ref: call.callId } });
  };

  /** A fresh look at the target, or why there is none: no look to take, or one that threw. */
  const freshLook = async (call: ToolCall): Promise<FreshLook> => {
    if (!look) return { seen: false, why: "no_look" };
    for (;;) {
      let ran: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;
      try {
        ran = await input.executeTool({ callId: `${call.callId}.look`, toolId: look.toolId, value: structuredClone(look.initialObservation!.input), ...(call.signal ? { signal: call.signal } : {}) });
      } catch (error) {
        // The build stopping is not a look that failed.
        if (stopped.signal.aborted) throw error;
        // The step stands either way: the model is told the look did not come
        // back, and can take its own next turn.
        return { seen: false, why: "look_threw" };
      }
      // The person said Continue and the check is still there, or another one
      // came up: asked again, within the same bound.
      if (personNeeded(ran)) {
        await asked(call);
        continue;
      }
      if (!executionResult(ran)) return { seen: true, evidence: ran };
      const stateAfter = ran.stateDigests?.after ?? ran.stateDigests?.before;
      return { seen: true, evidence: ran.evidence, ...(stateAfter ? { stateAfter } : {}) };
    }
  };

  return {
    executeTool: async (call) => {
      const ran = await input.executeTool(call);
      if (!personNeeded(ran)) return ran;
      if (ended) end(ended);
      await asked(call);
      const now = await freshLook(call);
      return standing(ran, now, input.clearedResultCode?.(call.value));
    },
    signal: stopped.signal,
    endedOnIntervention: (progress, accounting) => ended
      ? flowBootstrapUserInterventionRequiredFailure(ISSUE_CODE[ended], progress ?? NO_LOOP_PROGRESS, accounting)
      : undefined
  };
}

/** What the look after the person came back with. */
type FreshLook = { seen: true; evidence: JsonValue; stateAfter?: string } | { seen: false; why: "no_look" | "look_threw" };

/**
 * The call as it stands once the person has cleared the check.
 *
 * The caller's own statement about the step is kept -- what it ran, whether it
 * changed anything, which node it was -- because the caller wrote it describing
 * the step once cleared. Its code and reason are not: they describe the check,
 * which is behind the person now. `clearedCode` stands in for the code where
 * the call is read in a vocabulary of its own -- a replayed step, which the dry
 * run reads as `replayed`.
 */
function standing(
  ran: AutomationStudioLlmEvidenceToolExecutionResult,
  now: FreshLook,
  clearedCode: string | undefined
): AutomationStudioLlmEvidenceToolExecutionResult {
  const before = ran.stateDigests?.before;
  const after = now.seen ? now.stateAfter : undefined;
  const evidence: JsonObject = { personCompletedCheck: true, note: PERSON_COMPLETED_NOTE, ...(now.seen ? { now: now.evidence } : { lookUnavailable: now.why }) };
  return {
    kind: "llm_evidence_tool_execution",
    evidence,
    effectApplied: ran.effectApplied,
    ...(ran.targetsUnchanged === undefined ? {} : { targetsUnchanged: ran.targetsUnchanged }),
    ...(clearedCode ? { resultCode: clearedCode } : {}),
    ...(ran.nodeId === undefined ? {} : { nodeId: ran.nodeId }),
    ...(before !== undefined || after !== undefined ? { stateDigests: { ...(before === undefined ? {} : { before }), ...(after === undefined ? {} : { after }) } } : {}),
    ...(ran.draft === undefined ? {} : { draft: ran.draft })
  };
}

function executionResult(value: unknown): value is AutomationStudioLlmEvidenceToolExecutionResult {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (value as { kind?: unknown }).kind === "llm_evidence_tool_execution";
}

/** Only the literal `true` on an execution result, as the loop's parser reads it. */
function personNeeded(value: unknown): value is AutomationStudioLlmEvidenceToolExecutionResult & { personNeeded: true } {
  return executionResult(value) && value.personNeeded === true;
}

/** What a build that ran no evidence loop has to show for itself: nothing, honestly. */
const NO_LOOP_PROGRESS: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> } = Object.freeze({
  trace: Object.freeze([]),
  accounting: Object.freeze({ iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
});
