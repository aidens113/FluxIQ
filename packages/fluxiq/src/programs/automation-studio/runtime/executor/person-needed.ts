// A run's node that meets something only a person can get past -- a robot
// check, in the web domain's words -- asks the person instead of failing.
//
// **What triggers it.** An attempt that failed with failure category
// `user_intervention_required` and raised no ask of its own. The domain has
// said "a person has to do this", and neither a retry nor a model repair can
// do it for them, so the recovery ladder has nothing to offer. Before this, the
// run went down the ladder anyway and ended `failed`, and nobody was asked.
//
// **What happens instead.** The executor raises Core's one person-needed ask
// (`parking/person-needed-ask.ts`) as though the attempt had raised it, and its
// ordinary parking carries it: held open in place when the port can, parked
// durably when it cannot. Continue resumes down the node's `success` route and
// the next node reads the page fresh; Stop, or nobody answering, goes down
// `failed`, and a Flow with no failed route of its own ends there with an
// ending that says a person was needed (`automationStudioPersonNeededEnding`).
//
// **Only with a port.** An unbound run has nobody to ask, so it fails as it
// always did rather than parking on a question nobody will ever see.
//
// **Bounded.** A check that is still there after Continue fails the node again
// and asks again. Past `AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN` asks the
// run stops asking and ends, because a loop that keeps knocking on the same
// check is the thing the ask exists to replace.

import type { AutomationStudioFlowNode } from "../../model/index.ts";
import {
  AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND,
  automationStudioAskEffect,
  automationStudioAskInEffects,
  automationStudioPersonNeededAskDraft,
  type AutomationStudioAsk
} from "../parking/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "./contracts.ts";

/** The failure category a domain reports when only a person can go on. */
const PERSON_NEEDED_CATEGORY = "user_intervention_required";

/** How many times one run asks a person before it stops asking and ends. */
export const AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN = 3;

/** What the executor does about one failed attempt, as far as a person is concerned. */
export type AutomationStudioPersonNeededStep =
  /** Nothing: the attempt did not need a person, raised its own ask, or nobody can be asked. */
  | { kind: "none" }
  /** Ask the person, with this ask, through the run's ordinary parking. */
  | { kind: "ask"; ask: AutomationStudioAsk }
  /** The run has asked as often as it may; end it with this message, without the ladder. */
  | { kind: "exhausted"; message: string };

/** Whether this attempt failed because only a person can go on. */
export function automationStudioAttemptNeedsPerson(attempt: AutomationStudioNodeAttemptTrace): boolean {
  return attempt.status === "failed" && attempt.failure?.category === PERSON_NEEDED_CATEGORY;
}

/** Whether an ask is the person-needed one, read from its marker rather than its words. */
export function automationStudioIsPersonNeededAsk(ask: Pick<AutomationStudioAsk, "control"> | undefined): boolean {
  return ask?.control?.kind === AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND;
}

/**
 * Decides, for an attempt that has just been recorded, whether the run asks a
 * person. `attempts` is the run's attempts so far, the seed's included, so the
 * cap holds across a durable park and resume.
 */
export function automationStudioPersonNeededStep(input: {
  attempt: AutomationStudioNodeAttemptTrace;
  node: AutomationStudioFlowNode;
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  /** An ask the attempt raised itself. It is the attempt's question, and none is added. */
  raised: AutomationStudioAsk | undefined;
  /** Whether a parking port is bound, which is whether anybody can be asked. */
  parkingBound: boolean;
}): AutomationStudioPersonNeededStep {
  if (input.raised || !input.parkingBound || !automationStudioAttemptNeedsPerson(input.attempt)) return { kind: "none" };
  const asked = input.attempts.filter((attempt) => attempt.ask?.personNeeded === true).length;
  if (asked >= AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN) {
    return { kind: "exhausted", message: endingMessage(input.node, input.attempt, `a person was asked ${asked} times and the check was still there`) };
  }
  const ask = automationStudioAskInEffects([automationStudioAskEffect(automationStudioPersonNeededAskDraft({ askId: input.attempt.attemptId }))], {
    askId: input.attempt.attemptId,
    stage: "execution",
    nodeId: input.node.id,
    definitionId: input.node.definitionId,
    attemptId: input.attempt.attemptId
  });
  return ask ? { kind: "ask", ask } : { kind: "none" };
}

/**
 * The run's ending when a person-needed ask was settled down a route the Flow
 * has no edge for: the person pressed Stop, or nobody answered.
 *
 * Nothing when the node's latest attempt did not settle a person-needed ask
 * down `route`. It is read from the attempts rather than handed over by the
 * caller, because a durably parked run reaches this from a resume, where the
 * only record of the ask is the one its attempt carries.
 *
 * The attempt keeps its own failure record, category and code unchanged, and it
 * is the last attempt of the run, so whatever reads a run's failure off its
 * attempts still reads `user_intervention_required`; the message says it again
 * in words, and says what the person did.
 */
export function automationStudioPersonNeededEnding(
  attempts: readonly AutomationStudioNodeAttemptTrace[],
  node: AutomationStudioFlowNode,
  route: string
): string | undefined {
  const attempt = latestAttemptOf(attempts, node.id);
  const ask = attempt?.ask;
  if (!attempt || !ask?.personNeeded || ask.route !== route) return undefined;
  if (ask.status === "expired") return endingMessage(node, attempt, "nobody answered in time");
  if (ask.status === "answered") return endingMessage(node, attempt, "the person pressed Stop");
  return undefined;
}

function latestAttemptOf(attempts: readonly AutomationStudioNodeAttemptTrace[], nodeId: string): AutomationStudioNodeAttemptTrace | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]!.nodeId === nodeId) return attempts[index];
  }
  return undefined;
}

function endingMessage(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace, what: string): string {
  const step = node.label?.trim() ? `"${node.label.trim()}"` : node.id;
  const code = attempt.failure?.code ? ` (${PERSON_NEEDED_CATEGORY}, ${attempt.failure.code})` : ` (${PERSON_NEEDED_CATEGORY})`;
  return `Run stopped: a person was needed at step ${step} to complete a check on the page${code}, and ${what}.`;
}
